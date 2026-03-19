/**
 * Agent + Hooks 完整集成测试
 *
 * 测试 Hooks 与 Agent 的完整集成，包括：
 * - Session 生命周期 hooks
 * - Tool 执行 hooks
 * - Provider 切换 hooks
 * - Skill 匹配 hooks
 * - Agent 生成 hooks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Agent, createAgent } from '../../src/agents/core/Agent.js';

describe('Agent + Hooks Integration', () => {
  // ============================================
  // Hook Registry Access
  // ============================================
  describe('Hook Registry Access', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should have hookRegistry on context', () => {
      expect(agent.context.hookRegistry).toBeDefined();
    });

    it('should have session ID', () => {
      expect(agent.context.hookRegistry.getSessionId()).toBeDefined();
    });

    it('should allow setting session ID', () => {
      agent.context.hookRegistry.setSessionId('custom-session');
      expect(agent.context.hookRegistry.getSessionId()).toBe('custom-session');
    });
  });

  // ============================================
  // Session Lifecycle Hooks
  // ============================================
  describe('Session Lifecycle Hooks', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should register session:start hook', () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('session:start', hookSpy);

      expect(agent.context.hookRegistry.has('session:start')).toBe(true);
      expect(agent.context.hookRegistry.count('session:start')).toBe(1);
    });

    it('should register session:end hook', () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('session:end', hookSpy);

      expect(agent.context.hookRegistry.has('session:end')).toBe(true);
    });

    it('should register session:error hook', () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('session:error', hookSpy);

      expect(agent.context.hookRegistry.has('session:error')).toBe(true);
    });

    it('should emit session:start with correct context', async () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('session:start', hookSpy);

      await agent.context.hookRegistry.emit('session:start', {
        sessionId: 'test-session',
        prompt: 'Hello',
        timestamp: new Date(),
      });

      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'test-session',
          prompt: 'Hello',
        })
      );
    });

    it('should emit session:end with duration', async () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('session:end', hookSpy);

      await agent.context.hookRegistry.emit('session:end', {
        sessionId: 'test-session',
        success: true,
        timestamp: new Date(),
        duration: 1000,
      });

      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          duration: 1000,
        })
      );
    });
  });

  // ============================================
  // Tool Execution Hooks
  // ============================================
  describe('Tool Execution Hooks', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should register tool:before hook', () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('tool:before', hookSpy);

      expect(agent.context.hookRegistry.has('tool:before')).toBe(true);
    });

    it('should register tool:after hook', () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('tool:after', hookSpy);

      expect(agent.context.hookRegistry.has('tool:after')).toBe(true);
    });

    it('should emit tool:before with input context', async () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('tool:before', hookSpy);

      await agent.context.hookRegistry.emit('tool:before', {
        sessionId: 'test-session',
        toolName: 'Read',
        input: { file_path: '/test.ts' },
        timestamp: new Date(),
      });

      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'Read',
          input: { file_path: '/test.ts' },
        })
      );
    });

    it('should emit tool:after with output', async () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('tool:after', hookSpy);

      await agent.context.hookRegistry.emit('tool:after', {
        sessionId: 'test-session',
        toolName: 'Read',
        input: { file_path: '/test.ts' },
        output: 'file content',
        success: true,
        duration: 100,
        timestamp: new Date(),
      });

      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          duration: 100,
        })
      );
    });

    it('should allow blocking tool execution via hook', async () => {
      const blockHook = vi.fn().mockReturnValue({
        proceed: false,
        error: new Error('Tool blocked'),
      });
      agent.context.hookRegistry.on('tool:before', blockHook, { priority: 'highest' });

      const result = await agent.context.hookRegistry.emit('tool:before', {
        sessionId: 'test-session',
        toolName: 'Bash',
        input: { command: 'rm -rf /' },
        timestamp: new Date(),
      });

      expect(result).toBe(false);
    });
  });

  // ============================================
  // Provider Hooks
  // ============================================
  describe('Provider Hooks', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should register provider:beforeChange hook', () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('provider:beforeChange', hookSpy);

      expect(agent.context.hookRegistry.has('provider:beforeChange')).toBe(true);
    });

    it('should register provider:afterChange hook', () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('provider:afterChange', hookSpy);

      expect(agent.context.hookRegistry.has('provider:afterChange')).toBe(true);
    });

    it('should emit provider:beforeChange with provider info', async () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('provider:beforeChange', hookSpy);

      await agent.context.hookRegistry.emit('provider:beforeChange', {
        sessionId: 'test-session',
        previousProvider: 'anthropic',
        newProviderId: 'deepseek',
        timestamp: new Date(),
      });

      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          previousProvider: 'anthropic',
          newProviderId: 'deepseek',
        })
      );
    });

    it('should allow blocking provider switch via hook', async () => {
      const blockHook = vi.fn().mockReturnValue({
        proceed: false,
        error: new Error('Switch blocked'),
      });
      agent.context.hookRegistry.on('provider:beforeChange', blockHook, { priority: 'highest' });

      const result = await agent.context.hookRegistry.emit('provider:beforeChange', {
        sessionId: 'test-session',
        previousProvider: 'anthropic',
        newProviderId: 'deepseek',
        timestamp: new Date(),
      });

      expect(result).toBe(false);
    });
  });

  // ============================================
  // Skill Hooks
  // ============================================
  describe('Skill Hooks', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should register skill:match hook', () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('skill:match', hookSpy);

      expect(agent.context.hookRegistry.has('skill:match')).toBe(true);
    });

    it('should emit skill:match with matched skill info', async () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('skill:match', hookSpy);

      await agent.context.hookRegistry.emit('skill:match', {
        sessionId: 'test-session',
        input: 'review code',
        matchedSkill: 'Code Review',
        matchScore: 0.95,
        timestamp: new Date(),
      });

      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          matchedSkill: 'Code Review',
          matchScore: 0.95,
        })
      );
    });
  });

  // ============================================
  // Agent Hooks
  // ============================================
  describe('Agent Hooks', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should register agent:spawn hook', () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('agent:spawn', hookSpy);

      expect(agent.context.hookRegistry.has('agent:spawn')).toBe(true);
    });

    it('should register agent:complete hook', () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('agent:complete', hookSpy);

      expect(agent.context.hookRegistry.has('agent:complete')).toBe(true);
    });

    it('should emit agent:spawn with agent info', async () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('agent:spawn', hookSpy);

      await agent.context.hookRegistry.emit('agent:spawn', {
        parentSessionId: 'parent-session',
        agentName: 'explore',
        prompt: 'Find all tests',
        timestamp: new Date(),
      });

      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'explore',
          prompt: 'Find all tests',
        })
      );
    });

    it('should emit agent:complete with result', async () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('agent:complete', hookSpy);

      await agent.context.hookRegistry.emit('agent:complete', {
        parentSessionId: 'parent-session',
        agentName: 'explore',
        resultSummary: 'Found 10 test files',
        duration: 5000,
        success: true,
        timestamp: new Date(),
      });

      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          duration: 5000,
        })
      );
    });
  });

  // ============================================
  // Hook Priority
  // ============================================
  describe('Hook Priority', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should execute hooks by priority', async () => {
      const order: string[] = [];

      agent.context.hookRegistry.on('session:start', () => {
        order.push('low');
        return { proceed: true };
      }, { priority: 'low' });

      agent.context.hookRegistry.on('session:start', () => {
        order.push('highest');
        return { proceed: true };
      }, { priority: 'highest' });

      agent.context.hookRegistry.on('session:start', () => {
        order.push('normal');
        return { proceed: true };
      }, { priority: 'normal' });

      await agent.context.hookRegistry.emit('session:start', {
        sessionId: 'test',
        timestamp: new Date(),
      });

      expect(order).toEqual(['highest', 'normal', 'low']);
    });

    it('should stop propagation on proceed: false', async () => {
      const order: string[] = [];

      agent.context.hookRegistry.on('session:start', () => {
        order.push('first');
        return { proceed: false };
      }, { priority: 'high' });

      agent.context.hookRegistry.on('session:start', () => {
        order.push('second');
        return { proceed: true };
      }, { priority: 'low' });

      await agent.context.hookRegistry.emit('session:start', {
        sessionId: 'test',
        timestamp: new Date(),
      });

      expect(order).toEqual(['first']);
      expect(order).not.toContain('second');
    });
  });

  // ============================================
  // Hook Once
  // ============================================
  describe('Hook Once', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should execute once hook only once', async () => {
      let callCount = 0;

      agent.context.hookRegistry.once('session:start', () => {
        callCount++;
        return { proceed: true };
      });

      await agent.context.hookRegistry.emit('session:start', {
        sessionId: 'test',
        timestamp: new Date(),
      });

      expect(callCount).toBe(1);

      await agent.context.hookRegistry.emit('session:start', {
        sessionId: 'test',
        timestamp: new Date(),
      });

      expect(callCount).toBe(1);
    });

    it('should remove once hook after execution', async () => {
      agent.context.hookRegistry.once('session:start', () => ({ proceed: true }));

      expect(agent.context.hookRegistry.count('session:start')).toBe(1);

      await agent.context.hookRegistry.emit('session:start', {
        sessionId: 'test',
        timestamp: new Date(),
      });

      expect(agent.context.hookRegistry.count('session:start')).toBe(0);
    });
  });

  // ============================================
  // Hook Off
  // ============================================
  describe('Hook Off', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should remove hook by ID', () => {
      const hookId = agent.context.hookRegistry.on('session:start', () => ({ proceed: true }));

      expect(agent.context.hookRegistry.count('session:start')).toBe(1);

      const result = agent.context.hookRegistry.off(hookId);

      expect(result).toBe(true);
      expect(agent.context.hookRegistry.count('session:start')).toBe(0);
    });

    it('should return false for non-existent hook ID', () => {
      const result = agent.context.hookRegistry.off('non-existent-id');
      expect(result).toBe(false);
    });
  });

  // ============================================
  // Multi-Agent Hook Isolation
  // ============================================
  describe('Multi-Agent Hook Isolation', () => {
    let agent1: Agent;
    let agent2: Agent;

    beforeEach(async () => {
      agent1 = createAgent();
      agent2 = createAgent();
      await agent1.initialize();
      await agent2.initialize();
    });

    afterEach(async () => {
      await agent1.dispose();
      await agent2.dispose();
    });

    it('should have separate hook registries', () => {
      expect(agent1.context.hookRegistry).not.toBe(agent2.context.hookRegistry);
    });

    it('should isolate hooks between agents', async () => {
      const spy1 = vi.fn().mockReturnValue({ proceed: true });
      const spy2 = vi.fn().mockReturnValue({ proceed: true });

      agent1.context.hookRegistry.on('session:start', spy1);
      agent2.context.hookRegistry.on('session:start', spy2);

      // 只触发 agent1 的 hook
      await agent1.context.hookRegistry.emit('session:start', {
        sessionId: 'test',
        timestamp: new Date(),
      });

      expect(spy1).toHaveBeenCalled();
      expect(spy2).not.toHaveBeenCalled();
    });

    it('should have independent session IDs', () => {
      agent1.context.hookRegistry.setSessionId('agent1-session');
      agent2.context.hookRegistry.setSessionId('agent2-session');

      expect(agent1.context.hookRegistry.getSessionId()).toBe('agent1-session');
      expect(agent2.context.hookRegistry.getSessionId()).toBe('agent2-session');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should continue execution when hook throws error', async () => {
      const order: string[] = [];

      agent.context.hookRegistry.on('session:start', () => {
        order.push('error');
        throw new Error('Hook error');
      }, { priority: 'high' });

      agent.context.hookRegistry.on('session:start', () => {
        order.push('success');
        return { proceed: true };
      }, { priority: 'low' });

      const result = await agent.context.hookRegistry.emit('session:start', {
        sessionId: 'test',
        timestamp: new Date(),
      });

      // 应该继续执行，不因错误中断
      expect(order).toContain('error');
      expect(order).toContain('success');
      expect(result).toBe(true);
    });

    it('should handle async hook errors', async () => {
      agent.context.hookRegistry.on('session:start', async () => {
        throw new Error('Async hook error');
      });

      // 不应该抛出错误
      const result = await agent.context.hookRegistry.emit('session:start', {
        sessionId: 'test',
        timestamp: new Date(),
      });

      expect(result).toBe(true);
    });
  });

  // ============================================
  // Execution Tracking
  // ============================================
  describe('Execution Tracking', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should enable tracking', () => {
      agent.context.hookRegistry.enableTracking();
      expect(agent.context.hookRegistry.getTrackingOptions().enabled).toBe(true);
    });

    it('should disable tracking', () => {
      agent.context.hookRegistry.disableTracking();
      expect(agent.context.hookRegistry.getTrackingOptions().enabled).toBe(false);
    });

    it('should track hook execution', async () => {
      agent.context.hookRegistry.enableTracking();

      agent.context.hookRegistry.on('session:start', () => ({ proceed: true }));

      await agent.context.hookRegistry.emit('session:start', {
        sessionId: 'test',
        timestamp: new Date(),
      });

      const logs = agent.context.hookRegistry.getExecutionLog();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].success).toBe(true);
    });
  });

  // ============================================
  // Push Hooks (新增)
  // ============================================
  describe('Push Hooks', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    // agent:thinking hook
    describe('agent:thinking', () => {
      it('should register agent:thinking hook', () => {
        const hookSpy = vi.fn().mockReturnValue({ proceed: true });
        agent.context.hookRegistry.on('agent:thinking', hookSpy);

        expect(agent.context.hookRegistry.has('agent:thinking')).toBe(true);
      });

      it('should emit agent:thinking with thought context', async () => {
        const hookSpy = vi.fn().mockReturnValue({ proceed: true });
        agent.context.hookRegistry.on('agent:thinking', hookSpy);

        await agent.context.hookRegistry.emit('agent:thinking', {
          sessionId: 'test-session',
          thought: '正在分析用户请求...',
          type: 'analyzing',
          timestamp: new Date(),
        });

        expect(hookSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            thought: '正在分析用户请求...',
            type: 'analyzing',
          })
        );
      });

      it('should support all thinking types', async () => {
        const types: Array<'analyzing' | 'planning' | 'executing' | 'reflecting'> =
          ['analyzing', 'planning', 'executing', 'reflecting'];

        for (const type of types) {
          const hookSpy = vi.fn().mockReturnValue({ proceed: true });
          agent.context.hookRegistry.on('agent:thinking', hookSpy);

          await agent.context.hookRegistry.emit('agent:thinking', {
            sessionId: 'test',
            thought: `Thinking type: ${type}`,
            type,
            timestamp: new Date(),
          });

          expect(hookSpy).toHaveBeenCalledWith(
            expect.objectContaining({ type })
          );

          agent.context.hookRegistry.clear('agent:thinking');
        }
      });
    });

    // task:progress hook
    describe('task:progress', () => {
      it('should register task:progress hook', () => {
        const hookSpy = vi.fn().mockReturnValue({ proceed: true });
        agent.context.hookRegistry.on('task:progress', hookSpy);

        expect(agent.context.hookRegistry.has('task:progress')).toBe(true);
      });

      it('should emit task:progress with progress info', async () => {
        const hookSpy = vi.fn().mockReturnValue({ proceed: true });
        agent.context.hookRegistry.on('task:progress', hookSpy);

        await agent.context.hookRegistry.emit('task:progress', {
          sessionId: 'test-session',
          taskId: 'task-001',
          description: '正在处理文件',
          progress: 50,
          currentStep: '步骤 2/4',
          totalSteps: 4,
          timestamp: new Date(),
        });

        expect(hookSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            taskId: 'task-001',
            progress: 50,
            currentStep: '步骤 2/4',
            totalSteps: 4,
          })
        );
      });

      it('should accept progress from 0 to 100', async () => {
        const hookSpy = vi.fn().mockReturnValue({ proceed: true });
        agent.context.hookRegistry.on('task:progress', hookSpy);

        const progressValues = [0, 25, 50, 75, 100];

        for (const progress of progressValues) {
          await agent.context.hookRegistry.emit('task:progress', {
            sessionId: 'test',
            taskId: 'task',
            description: `Progress: ${progress}%`,
            progress,
            timestamp: new Date(),
          });
        }

        expect(hookSpy).toHaveBeenCalledTimes(progressValues.length);
      });
    });

    // notification:push hook
    describe('notification:push', () => {
      it('should register notification:push hook', () => {
        const hookSpy = vi.fn().mockReturnValue({ proceed: true });
        agent.context.hookRegistry.on('notification:push', hookSpy);

        expect(agent.context.hookRegistry.has('notification:push')).toBe(true);
      });

      it('should emit notification:push with notification info', async () => {
        const hookSpy = vi.fn().mockReturnValue({ proceed: true });
        agent.context.hookRegistry.on('notification:push', hookSpy);

        await agent.context.hookRegistry.emit('notification:push', {
          sessionId: 'test-session',
          type: 'info',
          title: '任务开始',
          message: '正在开始执行任务...',
          timestamp: new Date(),
        });

        expect(hookSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'info',
            title: '任务开始',
            message: '正在开始执行任务...',
          })
        );
      });

      it('should support all notification types', async () => {
        const types: Array<'info' | 'warning' | 'success' | 'error'> =
          ['info', 'warning', 'success', 'error'];

        for (const type of types) {
          const hookSpy = vi.fn().mockReturnValue({ proceed: true });
          agent.context.hookRegistry.on('notification:push', hookSpy);

          await agent.context.hookRegistry.emit('notification:push', {
            sessionId: 'test',
            type,
            title: `Notification: ${type}`,
            message: `This is a ${type} notification`,
            timestamp: new Date(),
          });

          expect(hookSpy).toHaveBeenCalledWith(
            expect.objectContaining({ type })
          );

          agent.context.hookRegistry.clear('notification:push');
        }
      });

      it('should include metadata when provided', async () => {
        const hookSpy = vi.fn().mockReturnValue({ proceed: true });
        agent.context.hookRegistry.on('notification:push', hookSpy);

        await agent.context.hookRegistry.emit('notification:push', {
          sessionId: 'test',
          type: 'success',
          title: '任务完成',
          message: '所有文件已处理完成',
          timestamp: new Date(),
          metadata: {
            filesProcessed: 10,
            duration: 5000,
          },
        });

        expect(hookSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: {
              filesProcessed: 10,
              duration: 5000,
            },
          })
        );
      });
    });
  });

  // ============================================
  // Agent Push Methods (便捷方法测试)
  // ============================================
  describe('Agent Push Methods', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should have notify method', () => {
      expect(agent.notify).toBeDefined();
      expect(typeof agent.notify).toBe('function');
    });

    it('should have updateProgress method', () => {
      expect(agent.updateProgress).toBeDefined();
      expect(typeof agent.updateProgress).toBe('function');
    });

    it('should have emitThinking method', () => {
      expect(agent.emitThinking).toBeDefined();
      expect(typeof agent.emitThinking).toBe('function');
    });

    it('should trigger notification:push hook via notify()', async () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('notification:push', hookSpy);

      await agent.notify('success', '测试标题', '测试消息');

      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: '测试标题',
          message: '测试消息',
        })
      );
    });

    it('should trigger task:progress hook via updateProgress()', async () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('task:progress', hookSpy);

      await agent.updateProgress('task-001', 75, '处理中', '步骤 3/4', 4);

      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-001',
          progress: 75,
          description: '处理中',
          currentStep: '步骤 3/4',
          totalSteps: 4,
        })
      );
    });

    it('should trigger agent:thinking hook via emitThinking()', async () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('agent:thinking', hookSpy);

      await agent.emitThinking('正在分析代码结构', 'analyzing', { file: 'test.ts' });

      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          thought: '正在分析代码结构',
          type: 'analyzing',
          metadata: { file: 'test.ts' },
        })
      );
    });
  });
});
