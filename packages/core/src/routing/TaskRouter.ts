/**
 * TaskRouter — Coordinator 唯一路由入口
 */

import type {
  RouterDecision,
  ScenarioDefinition,
  ScenarioResolveResult,
  WorkerSpawnInput,
} from './types.js';
import { ScenarioRegistry } from './ScenarioRegistry.js';

export class TaskRouter {
  constructor(private readonly registry: ScenarioRegistry) {}

  resolve(task: string): RouterDecision {
    const scenario = this.registry.findBestMatch(task);
    if (!scenario) {
      return { action: 'pass' };
    }

    const resolved = scenario.resolve(task);
    return this.toDecision(scenario, resolved);
  }

  getRoutingHint(task: string): string | null {
    const decision = this.resolve(task);
    if (decision.action === 'hint') {
      return decision.directive;
    }
    return null;
  }

  /** match 场景的 Coordinator system prompt 补充段落 */
  getCoordinatorBlurbs(task: string): string[] {
    const blurbs: string[] = [];
    for (const scenario of this.registry.list()) {
      if (!scenario.match(task)) continue;
      const blurb = scenario.copy.coordinatorBlurb?.(task);
      if (blurb) blurbs.push(blurb);
    }
    return blurbs;
  }

  validateSpawn(task: string, spawn: WorkerSpawnInput): string | null {
    const scenario = this.registry.findBestMatch(task);
    if (!scenario) {
      return null;
    }
    if (scenario.validateSpawn) {
      return scenario.validateSpawn(task, spawn);
    }
    if (!scenario.allowedWorkers.includes(spawn.type)) {
      return `Status: FAILED\nWorker type "${spawn.type}" is NOT allowed for scenario "${scenario.id}".`;
    }
    return null;
  }

  getRegistry(): ScenarioRegistry {
    return this.registry;
  }

  private toDecision(
    scenario: ScenarioDefinition,
    resolved: ScenarioResolveResult,
  ): RouterDecision {
    switch (resolved.kind) {
      case 'none':
        return { action: 'pass' };
      case 'inquiry':
        return {
          action: 'inquiry',
          scenarioId: scenario.id,
          reply: resolved.reply,
          notificationTitle: scenario.labels.inquiryNotification,
        };
      case 'delegate':
        return {
          action: 'delegate',
          scenarioId: scenario.id,
          spawn: resolved.spawn,
          notificationTitle: scenario.labels.creationNotification,
          notificationBody: scenario.labels.workerRunning,
        };
      case 'hint':
        return {
          action: 'hint',
          scenarioId: scenario.id,
          directive: resolved.directive,
        };
      default: {
        const _exhaustive: never = resolved;
        return _exhaustive;
      }
    }
  }
}
