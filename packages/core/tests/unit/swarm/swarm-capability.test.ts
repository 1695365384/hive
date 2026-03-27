/**
 * SwarmCapability 集成测试
 *
 * Mock AgentRunner，验证完整蜂群执行流程。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SwarmCapability } from '../../../src/agents/capabilities/SwarmCapability.js';
import type { AgentResult } from '../../../src/agents/types.js';
import type { NodeResult } from '../../../src/agents/swarm/types.js';

/**
 * 创建 mock AgentContext
 */
function createMockContext(overrides: Record<string, any> = {}) {
  return {
    runner: {
      execute: vi.fn(async (_agent: string, prompt: string) => {
        return {
          text: `Response to: ${prompt.slice(0, 50)}`,
          tools: ['Read', 'Grep'],
          success: true,
          usage: { input: 100, output: 50 },
        } satisfies AgentResult;
      }),
    },
    providerManager: {
      getActiveProvider: vi.fn(() => ({ baseUrl: 'https://api.example.com', apiKey: 'test-key' })),
    },
    hookRegistry: {
      getSessionId: vi.fn(() => 'test-session'),
      emit: vi.fn(),
    },
    skillRegistry: { size: 0 },
    timeoutCap: { getConfig: () => ({ heartbeatInterval: 30000, stallTimeout: 60000 }) },
    ...overrides,
  };
}

describe('SwarmCapability', () => {
  let cap: SwarmCapability;

  beforeEach(() => {
    cap = new SwarmCapability();
    cap.initialize(createMockContext());
  });

  describe('listTemplates', () => {
    it('should list all built-in templates (with variants)', () => {
      const list = cap.listTemplates();
      expect(list.length).toBeGreaterThanOrEqual(9);
      expect(list.map(t => t.name)).toContain('add-feature');
      expect(list.map(t => t.name)).toContain('debug');
      expect(list.map(t => t.name)).toContain('code-review');
      expect(list.map(t => t.name)).toContain('refactor');
    });
  });

  describe('registerTemplate', () => {
    it('should add custom template', () => {
      cap.registerTemplate({
        name: 'custom',
        match: /custom/i,
        description: 'Custom template',
        nodes: {
          step1: { agent: 'explore', prompt: 'Do {task}', depends: [] },
        },
        aggregate: { primary: 'step1' },
      });
      expect(cap.listTemplates().length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('preview', () => {
    it('should return preview for matching template', () => {
      const preview = cap.preview('添加用户认证');
      expect(preview).not.toBeNull();
      expect(preview!.template).toBe('add-feature');
      expect(preview!.layers.length).toBeGreaterThanOrEqual(2);
      expect(preview!.agents).toContain('explore');
    });

    it('should return null for no match', () => {
      const preview = cap.preview('今天天气怎么样');
      expect(preview).toBeNull();
    });

    it('should preview by template name', () => {
      const preview = cap.preview('anything', 'debug');
      expect(preview).not.toBeNull();
      expect(preview!.template).toBe('debug');
    });
  });

  describe('run', () => {
    it('should execute add-feature swarm with all nodes', async () => {
      const ctx = createMockContext();
      cap.initialize(ctx);

      const result = await cap.run('添加用户认证模块', { classify: false });

      expect(result.success).toBe(true);
      expect(result.template).toBe('add-feature');
      expect(result.text).toBeTruthy();
      expect(result.duration).toBeGreaterThan(0);
      expect(Object.keys(result.nodeResults).length).toBeGreaterThanOrEqual(3);
      expect(result.trace.length).toBeGreaterThan(0);

      // Verify all nodes were called
      const callAgents = ctx.runner.execute.mock.calls.map(
        (c: any[]) => c[0]
      );
      expect(callAgents).toContain('explore');
      expect(callAgents).toContain('plan');
      expect(callAgents).toContain('general');
    });

    it('should execute debug swarm', async () => {
      const ctx = createMockContext();
      cap.initialize(ctx);

      const result = await cap.run('修复登录 bug', { classify: false });

      expect(result.success).toBe(true);
      expect(result.template).toBe('debug');
      expect(Object.keys(result.nodeResults).length).toBeGreaterThanOrEqual(2);
    });

    it('should execute code-review swarm with parallel nodes', async () => {
      const ctx = createMockContext();
      cap.initialize(ctx);

      const result = await cap.run('审查这段代码', { classify: false });

      expect(result.success).toBe(true);
      expect(result.template).toBe('code-review');
      // 3 parallel nodes
      expect(Object.keys(result.nodeResults).length).toBeGreaterThanOrEqual(2);
    });

    it('should fallback to workflow when no template matches', async () => {
      const workflowRun = vi.fn(async () => ({
        success: true,
        analysis: { type: 'moderate' as const, needsExploration: false, needsPlanning: false, recommendedAgents: [], reason: '' },
        executeResult: { text: 'workflow result', tools: [], success: true },
      }));
      const ctx = createMockContext({
        capabilityRegistry: {
          get: () => ({
            run: workflowRun,
            name: 'workflow',
            initialize() {},
          }),
          has: () => true,
        },
      });
      cap.initialize(ctx);

      const result = await cap.run('今天天气怎么样', { classify: false });

      expect(result.success).toBe(true);
      expect(result.template).toBe('_fallback_workflow');
      expect(workflowRun).toHaveBeenCalledWith('今天天气怎么样', expect.anything());
    });

    it('should trigger onPhase callbacks', async () => {
      const phases: string[] = [];
      const ctx = createMockContext();
      cap.initialize(ctx);

      await cap.run('添加功能', {
        classify: false,
        onPhase: (phase) => phases.push(phase),
      });

      expect(phases).toContain('template-match');
      expect(phases).toContain('execute');
      expect(phases).toContain('aggregate');
      expect(phases).toContain('complete');
    });

    it('should trigger onNodeComplete callbacks', async () => {
      const completedNodes: string[] = [];
      const ctx = createMockContext();
      cap.initialize(ctx);

      await cap.run('添加功能', {
        classify: false,
        onNodeComplete: (nodeId) => completedNodes.push(nodeId),
      });

      expect(completedNodes.length).toBeGreaterThan(0);
    });

    it('should trigger hook events', async () => {
      const ctx = createMockContext();
      cap.initialize(ctx);

      await cap.run('添加功能', { classify: false });

      expect(ctx.hookRegistry.emit).toHaveBeenCalledWith(
        'swarm:complete',
        expect.objectContaining({ success: true })
      );
    });

    it('should handle execution errors gracefully', async () => {
      const ctx = createMockContext({
        runner: {
          execute: vi.fn(async () => {
            throw new Error('API timeout');
          }),
        },
      });
      cap.initialize(ctx);

      const result = await cap.run('添加功能', { classify: false });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
    });

    it('should use custom template', async () => {
      cap.registerTemplate({
        name: 'my-template',
        match: /custom/i,
        description: 'Custom',
        nodes: {
          step: { agent: 'explore', prompt: 'Custom: {task}', depends: [] },
        },
        aggregate: { primary: 'step' },
      });

      const ctx = createMockContext();
      cap.initialize(ctx);

      const result = await cap.run('custom task', { template: 'my-template', classify: false });
      expect(result.success).toBe(true);
      expect(result.template).toBe('my-template');
    });
  });
});
