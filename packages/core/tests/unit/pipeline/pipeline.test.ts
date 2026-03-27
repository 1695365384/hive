/**
 * Pipeline 单元测试
 *
 * 测试触发条件引擎、Pipeline 执行器、阶段前缀、confirm 触发和空 Pipeline。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateTrigger } from '../../../src/agents/pipeline/trigger.js';
import type { TriggerContext } from '../../../src/agents/pipeline/trigger.js';
import { PipelineExecutor } from '../../../src/agents/pipeline/executor.js';
import { generatePipelineReport } from '../../../src/agents/pipeline/tracer.js';
import { Blackboard } from '../../../src/agents/swarm/blackboard.js';
import { BUILTIN_TEMPLATES } from '../../../src/agents/swarm/templates.js';
import type {
  TriggerCondition,
  PipelineStage,
  PipelineTraceEvent,
} from '../../../src/agents/pipeline/types.js';
import type { NodeResult } from '../../../src/agents/swarm/types.js';

// ============================================
// Helper
// ============================================

function createMockRunner() {
  return {
    execute: vi.fn(async (_agent: string, prompt: string) => ({
      text: `Response to: ${prompt.slice(0, 50)}`,
      tools: ['Read', 'Grep'],
      success: true,
      usage: { input: 100, output: 50 },
    })),
  } as any;
}

function createBaseContext(blackboard?: Blackboard, nodeResults?: Record<string, NodeResult>): TriggerContext {
  return {
    blackboard: blackboard ?? new Blackboard(),
    nodeResults: nodeResults ?? {},
  };
}

// ============================================
// 2.5 触发条件单元测试
// ============================================

describe('evaluateTrigger', () => {
  describe('always', () => {
    it('should always return true', () => {
      const result = evaluateTrigger({ type: 'always' }, createBaseContext());
      expect(result).toBe(true);
    });
  });

  describe('onField', () => {
    it('should match eq operator with string', () => {
      const bb = new Blackboard();
      bb.set('severity', 'high');
      const result = evaluateTrigger(
        { type: 'onField', field: 'severity', operator: 'eq', value: 'high' },
        createBaseContext(bb)
      );
      expect(result).toBe(true);
    });

    it('should not match eq operator with different value', () => {
      const bb = new Blackboard();
      bb.set('severity', 'low');
      const result = evaluateTrigger(
        { type: 'onField', field: 'severity', operator: 'eq', value: 'high' },
        createBaseContext(bb)
      );
      expect(result).toBe(false);
    });

    it('should match ne operator', () => {
      const bb = new Blackboard();
      bb.set('level', 'info');
      const result = evaluateTrigger(
        { type: 'onField', field: 'level', operator: 'ne', value: 'error' },
        createBaseContext(bb)
      );
      expect(result).toBe(true);
    });

    it('should match gt operator', () => {
      const bb = new Blackboard();
      bb.set('count', 10);
      const result = evaluateTrigger(
        { type: 'onField', field: 'count', operator: 'gt', value: 5 },
        createBaseContext(bb)
      );
      expect(result).toBe(true);
    });

    it('should match lt operator', () => {
      const bb = new Blackboard();
      bb.set('score', 3);
      const result = evaluateTrigger(
        { type: 'onField', field: 'score', operator: 'lt', value: 5 },
        createBaseContext(bb)
      );
      expect(result).toBe(true);
    });

    it('should match contains operator', () => {
      const bb = new Blackboard();
      bb.set('message', 'error: timeout occurred');
      const result = evaluateTrigger(
        { type: 'onField', field: 'message', operator: 'contains', value: 'timeout' },
        createBaseContext(bb)
      );
      expect(result).toBe(true);
    });

    it('should return false for non-existent field', () => {
      const result = evaluateTrigger(
        { type: 'onField', field: 'nonexistent', operator: 'eq', value: 'anything' },
        createBaseContext()
      );
      expect(result).toBe(false);
    });

    it('should compare numeric strings as numbers', () => {
      const bb = new Blackboard();
      bb.set('count', '10');
      const result = evaluateTrigger(
        { type: 'onField', field: 'count', operator: 'gt', value: 5 },
        createBaseContext(bb)
      );
      expect(result).toBe(true);
    });
  });

  describe('onNodeFail', () => {
    it('should trigger when specified node failed', () => {
      const nodeResults: Record<string, NodeResult> = {
        fix: {
          nodeId: 'fix',
          text: '',
          tools: [],
          success: false,
          error: 'timeout',
          duration: 1000,
        },
      };
      const result = evaluateTrigger(
        { type: 'onNodeFail', nodeId: 'fix' },
        createBaseContext(undefined, nodeResults)
      );
      expect(result).toBe(true);
    });

    it('should not trigger when node succeeded', () => {
      const nodeResults: Record<string, NodeResult> = {
        fix: {
          nodeId: 'fix',
          text: 'fixed',
          tools: [],
          success: true,
          duration: 500,
        },
      };
      const result = evaluateTrigger(
        { type: 'onNodeFail', nodeId: 'fix' },
        createBaseContext(undefined, nodeResults)
      );
      expect(result).toBe(false);
    });

    it('should not trigger for non-existent node', () => {
      const result = evaluateTrigger(
        { type: 'onNodeFail', nodeId: 'nonexistent' },
        createBaseContext()
      );
      expect(result).toBe(false);
    });
  });

  describe('confirm', () => {
    it('should return true (delegated to executor)', () => {
      const result = evaluateTrigger(
        { type: 'confirm', message: 'Continue?' },
        createBaseContext()
      );
      expect(result).toBe(true);
    });
  });
});

// ============================================
// 6.5 空 Pipeline 测试
// ============================================

describe('PipelineExecutor', () => {
  describe('empty pipeline', () => {
    it('should return empty result for empty stages', async () => {
      const executor = new PipelineExecutor(createMockRunner(), BUILTIN_TEMPLATES);
      const result = await executor.execute([], 'any task');

      expect(result.stages).toEqual([]);
      expect(result.success).toBe(true);
      expect(result.text).toBe('');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.trace.length).toBeGreaterThanOrEqual(2); // start + complete
    });
  });

  // ============================================
  // 6.1 两阶段 Pipeline 集成测试
  // ============================================

  describe('two-stage pipeline', () => {
    it('should execute both stages sequentially', async () => {
      const runner = createMockRunner();
      const executor = new PipelineExecutor(runner, BUILTIN_TEMPLATES);

      const stages: PipelineStage[] = [
        { name: 'scan', templateName: 'code-review' },
        { name: 'fix', templateName: 'debug' },
      ];

      const result = await executor.execute(stages, 'review and fix code');

      expect(result.stages.length).toBe(2);
      expect(result.stages[0].stageName).toBe('scan');
      expect(result.stages[0].executed).toBe(true);
      expect(result.stages[0].template).toBe('code-review');
      expect(result.stages[1].stageName).toBe('fix');
      expect(result.stages[1].executed).toBe(true);
      expect(result.stages[1].template).toBe('debug');
      expect(result.success).toBe(true);
      expect(result.text).toBeTruthy();
    });

    it('should share blackboard across stages', async () => {
      const runner = createMockRunner();
      const executor = new PipelineExecutor(runner, BUILTIN_TEMPLATES);

      const stages: PipelineStage[] = [
        { name: 'scan', templateName: 'code-review' },
        { name: 'fix', templateName: 'debug' },
      ];

      await executor.execute(stages, 'review and fix');

      // Verify runner was called for both stages
      expect(runner.execute.mock.calls.length).toBeGreaterThan(3);
    });
  });

  // ============================================
  // 6.2 条件触发测试
  // ============================================

  describe('conditional triggers', () => {
    it('should skip stage when onField condition not met', async () => {
      const runner = createMockRunner();
      const executor = new PipelineExecutor(runner, BUILTIN_TEMPLATES);

      // Stage 1: write severity 'low' to blackboard
      // Stage 2: trigger only on severity 'high'
      const stages: PipelineStage[] = [
        { name: 'scan', templateName: 'code-review', trigger: { type: 'always' } },
        {
          name: 'fix',
          templateName: 'debug',
          trigger: { type: 'onField', field: 'severity', operator: 'eq', value: 'high' },
        },
      ];

      const result = await executor.execute(stages, 'review code');

      expect(result.stages[0].executed).toBe(true);
      expect(result.stages[1].executed).toBe(false);
      expect(result.stages[1].skipReason).toContain('Trigger condition not met');
    });

    it('should execute stage when onNodeFail triggers', async () => {
      const failRunner = {
        execute: vi.fn(async () => ({
          text: 'failed',
          tools: [],
          success: false,
          usage: { input: 100, output: 50 },
        })),
      } as any;

      const executor = new PipelineExecutor(failRunner, BUILTIN_TEMPLATES);

      const stages: PipelineStage[] = [
        { name: 'try', templateName: 'debug', trigger: { type: 'always' } },
        {
          name: 'retry',
          templateName: 'debug',
          trigger: { type: 'onNodeFail', nodeId: 'fix' },
        },
      ];

      const result = await executor.execute(stages, 'fix bug');

      // First stage executes, fix node fails
      expect(result.stages[0].executed).toBe(true);
      expect(result.stages[0].result?.success).toBe(false);

      // Second stage triggers because fix node failed
      expect(result.stages[1].executed).toBe(true);
    });

    it('should always execute with always trigger', async () => {
      const runner = createMockRunner();
      const executor = new PipelineExecutor(runner, BUILTIN_TEMPLATES);

      const stages: PipelineStage[] = [
        { name: 'a', templateName: 'debug', trigger: { type: 'always' } },
        { name: 'b', templateName: 'debug', trigger: { type: 'always' } },
      ];

      const result = await executor.execute(stages, 'task');

      expect(result.stages[0].executed).toBe(true);
      expect(result.stages[1].executed).toBe(true);
    });
  });

  // ============================================
  // 6.3 阶段前缀测试
  // ============================================

  describe('stage prefix', () => {
    it('should execute stages with same-named templates', async () => {
      const runner = createMockRunner();
      const executor = new PipelineExecutor(runner, BUILTIN_TEMPLATES);

      const stages: PipelineStage[] = [
        { name: 'first', templateName: 'debug' },
        { name: 'second', templateName: 'debug' },
      ];

      const result = await executor.execute(stages, 'debug twice');

      expect(result.stages.length).toBe(2);
      expect(result.stages[0].stageName).toBe('first');
      expect(result.stages[0].template).toBe('debug');
      expect(result.stages[1].stageName).toBe('second');
      expect(result.stages[1].template).toBe('debug');
    });
  });

  // ============================================
  // 6.4 confirm 触发测试
  // ============================================

  describe('confirm trigger', () => {
    it('should execute stage when confirm approved', async () => {
      const runner = createMockRunner();
      const executor = new PipelineExecutor(runner, BUILTIN_TEMPLATES);

      const stages: PipelineStage[] = [
        {
          name: 'review',
          templateName: 'code-review',
          trigger: { type: 'confirm', message: 'Proceed with review?' },
        },
      ];

      const result = await executor.execute(stages, 'review', {
        onConfirm: async () => true,
      });

      expect(result.stages[0].executed).toBe(true);
    });

    it('should skip stage when confirm rejected', async () => {
      const runner = createMockRunner();
      const executor = new PipelineExecutor(runner, BUILTIN_TEMPLATES);

      const stages: PipelineStage[] = [
        {
          name: 'review',
          templateName: 'code-review',
          trigger: { type: 'confirm', message: 'Proceed?' },
        },
      ];

      const result = await executor.execute(stages, 'review', {
        onConfirm: async () => false,
      });

      expect(result.stages[0].executed).toBe(false);
      expect(result.stages[0].skipReason).toContain('User rejected');
    });

    it('should auto-approve when no onConfirm callback', async () => {
      const runner = createMockRunner();
      const executor = new PipelineExecutor(runner, BUILTIN_TEMPLATES);

      const stages: PipelineStage[] = [
        {
          name: 'review',
          templateName: 'code-review',
          trigger: { type: 'confirm', message: 'Proceed?' },
        },
      ];

      const result = await executor.execute(stages, 'review');

      expect(result.stages[0].executed).toBe(true);
    });
  });

  // ============================================
  // 6.1 onPhase 和 onStageComplete 回调
  // ============================================

  describe('callbacks', () => {
    it('should trigger onPhase callbacks', async () => {
      const runner = createMockRunner();
      const executor = new PipelineExecutor(runner, BUILTIN_TEMPLATES);
      const phases: string[] = [];

      const stages: PipelineStage[] = [
        { name: 'scan', templateName: 'code-review' },
      ];

      await executor.execute(stages, 'task', {
        onPhase: (phase) => phases.push(phase),
      });

      expect(phases).toContain('stage-start');
      expect(phases).toContain('execute');
      expect(phases).toContain('stage-complete');
    });

    it('should trigger onStageComplete callback', async () => {
      const runner = createMockRunner();
      const executor = new PipelineExecutor(runner, BUILTIN_TEMPLATES);
      const completedStages: string[] = [];

      const stages: PipelineStage[] = [
        { name: 'scan', templateName: 'code-review' },
        { name: 'fix', templateName: 'debug' },
      ];

      await executor.execute(stages, 'task', {
        onStageComplete: (result) => completedStages.push(result.stageName),
      });

      expect(completedStages).toEqual(['scan', 'fix']);
    });
  });

  // ============================================
  // 模板未找到
  // ============================================

  describe('template not found', () => {
    it('should skip stage when template not found', async () => {
      const runner = createMockRunner();
      const executor = new PipelineExecutor(runner, BUILTIN_TEMPLATES);

      const stages: PipelineStage[] = [
        { name: 'nonexistent', templateName: 'does-not-exist' },
      ];

      const result = await executor.execute(stages, 'task');

      expect(result.stages[0].executed).toBe(false);
      expect(result.stages[0].skipReason).toContain('Template not found');
    });
  });
});

// ============================================
// 4.4 Pipeline tracer 测试
// ============================================

describe('generatePipelineReport', () => {
  it('should generate report with stage events', () => {
    const events: PipelineTraceEvent[] = [
      {
        timestamp: 1000,
        type: 'pipeline.start',
        pipelineId: 'pl-test',
        metadata: { task: 'review code' },
      },
      {
        timestamp: 1001,
        type: 'stage.start',
        pipelineId: 'pl-test',
        stageName: 'scan',
        template: 'code-review',
        variant: 'medium',
      },
      {
        timestamp: 5000,
        type: 'stage.complete',
        pipelineId: 'pl-test',
        stageName: 'scan',
        template: 'code-review',
        variant: 'medium',
        duration: 3999,
        metadata: { success: true, nodeCount: 3 },
      },
      {
        timestamp: 5001,
        type: 'pipeline.complete',
        pipelineId: 'pl-test',
        metadata: { success: true },
      },
    ];

    const report = generatePipelineReport(events);

    expect(report).toContain('Pipeline #pl-test');
    expect(report).toContain('Task: "review code"');
    expect(report).toContain('[scan]');
    expect(report).toContain('code-review');
    expect(report).toContain('Success');
  });

  it('should show skipped stages', () => {
    const events: PipelineTraceEvent[] = [
      {
        timestamp: 1000,
        type: 'pipeline.start',
        pipelineId: 'pl-test',
        metadata: { task: 'task' },
      },
      {
        timestamp: 1001,
        type: 'stage.start',
        pipelineId: 'pl-test',
        stageName: 'fix',
        template: 'debug',
        variant: 'medium',
      },
      {
        timestamp: 1002,
        type: 'stage.skipped',
        pipelineId: 'pl-test',
        stageName: 'fix',
        template: 'debug',
        variant: 'medium',
        skipReason: 'Trigger condition not met (onField)',
        duration: 1,
      },
      {
        timestamp: 1002,
        type: 'pipeline.complete',
        pipelineId: 'pl-test',
        metadata: { success: true },
      },
    ];

    const report = generatePipelineReport(events);

    expect(report).toContain('Skipped');
    expect(report).toContain('Trigger condition not met');
  });

  it('should show execution and skip counts in summary', () => {
    const events: PipelineTraceEvent[] = [
      {
        timestamp: 1000,
        type: 'pipeline.start',
        pipelineId: 'pl-test',
        metadata: { task: 'task' },
      },
      {
        timestamp: 1001,
        type: 'stage.start',
        pipelineId: 'pl-test',
        stageName: 'a',
        template: 'debug',
      },
      {
        timestamp: 3000,
        type: 'stage.complete',
        pipelineId: 'pl-test',
        stageName: 'a',
        template: 'debug',
        duration: 1999,
      },
      {
        timestamp: 3001,
        type: 'stage.start',
        pipelineId: 'pl-test',
        stageName: 'b',
        template: 'debug',
      },
      {
        timestamp: 3002,
        type: 'stage.skipped',
        pipelineId: 'pl-test',
        stageName: 'b',
        template: 'debug',
        skipReason: 'condition',
        duration: 1,
      },
      {
        timestamp: 3002,
        type: 'pipeline.complete',
        pipelineId: 'pl-test',
        metadata: { success: true },
      },
    ];

    const report = generatePipelineReport(events);

    expect(report).toContain('1 executed, 1 skipped');
  });
});
