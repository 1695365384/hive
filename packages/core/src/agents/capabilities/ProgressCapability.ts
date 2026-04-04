/**
 * ProgressCapability
 *
 * 提供实时进度和 ETA 估算能力。
 */

import type { AgentCapability, AgentContext } from '../core/types.js';
import type { TaskProgressHookContext } from '../../hooks/types.js';

export interface ProgressSnapshot {
  phase: string;
  progress: number;
  currentStep?: string;
  totalSteps: number;
  completedSteps: number;
  startedAt: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  message: string;
}

export class ProgressCapability implements AgentCapability {
  readonly name = 'progress';

  private context: AgentContext | null = null;
  private taskId: string | null = null;
  private phase = 'idle';
  private description = '';
  private totalSteps = 1;
  private completedSteps = 0;
  private startedAt = 0;
  private currentStep: string | undefined;
  private stepDurations: number[] = [];
  private lastStepTimestamp = 0;

  initialize(context: AgentContext): void {
    this.context = context;
  }

  begin(taskId: string, description: string, phase: string, totalSteps: number): void {
    this.taskId = taskId;
    this.description = description;
    this.phase = phase;
    this.totalSteps = Math.max(1, totalSteps);
    this.completedSteps = 0;
    this.startedAt = Date.now();
    this.currentStep = undefined;
    this.stepDurations = [];
    this.lastStepTimestamp = this.startedAt;
    this.emitProgress().catch(() => undefined);
  }

  step(stepName: string): void {
    if (!this.taskId) {
      return;
    }

    const now = Date.now();
    const duration = now - this.lastStepTimestamp;
    if (duration > 0) {
      this.stepDurations = [...this.stepDurations, duration];
    }
    this.lastStepTimestamp = now;

    this.completedSteps = Math.min(this.totalSteps, this.completedSteps + 1);
    this.currentStep = stepName;
    this.emitProgress().catch(() => undefined);
  }

  complete(message?: string): void {
    if (!this.taskId) {
      return;
    }

    this.completedSteps = this.totalSteps;
    this.currentStep = message ?? 'completed';
    this.emitProgress().catch(() => undefined);
  }

  getSnapshot(): ProgressSnapshot {
    const elapsedMs = this.startedAt > 0 ? Date.now() - this.startedAt : 0;
    const progress = Math.round((this.completedSteps / this.totalSteps) * 100);
    return {
      phase: this.phase,
      progress,
      currentStep: this.currentStep,
      totalSteps: this.totalSteps,
      completedSteps: this.completedSteps,
      startedAt: this.startedAt,
      elapsedMs,
      estimatedRemainingMs: this.getETA(),
      message: `${this.description}${this.currentStep ? ` - ${this.currentStep}` : ''}`,
    };
  }

  getETA(): number | null {
    if (this.completedSteps < 2 || this.stepDurations.length < 2) {
      return null;
    }

    const alpha = 0.3;
    const ema = this.stepDurations.reduce((acc, value) => {
      return alpha * value + (1 - alpha) * acc;
    });

    const remainingSteps = this.totalSteps - this.completedSteps;
    if (remainingSteps <= 0) {
      return 0;
    }
    return Math.max(0, Math.round(ema * remainingSteps));
  }

  dispose(): void {
    this.context = null;
  }

  private async emitProgress(): Promise<void> {
    if (!this.context || !this.taskId) {
      return;
    }

    const snapshot = this.getSnapshot();
    const hookContext: TaskProgressHookContext = {
      sessionId: this.context.hookRegistry.getSessionId(),
      taskId: this.taskId,
      description: this.description,
      progress: snapshot.progress,
      currentStep: snapshot.currentStep,
      totalSteps: snapshot.totalSteps,
      timestamp: new Date(),
      metadata: {
        phase: snapshot.phase,
        etaMs: snapshot.estimatedRemainingMs,
        elapsedMs: snapshot.elapsedMs,
      },
    };

    await this.context.hookRegistry.emit('task:progress', hookContext);
  }
}
