/**
 * HookRegistry 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookRegistry } from '../../src/hooks/registry.js';
import type {
  HookResult,
  SessionStartHookContext,
  ToolBeforeHookContext,
  ToolAfterHookContext,
} from '../../src/hooks/types.js';

// 辅助函数：延迟
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('HookRegistry', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry('test-session-123');
  });

  describe('构造函数', () => {
    it('应该使用提供的 sessionId', () => {
      expect(registry.getSessionId()).toBe('test-session-123');
    });

    it('应该自动生成 sessionId 如果未提供', () => {
      const autoRegistry = new HookRegistry();
      expect(autoRegistry.getSessionId()).toMatch(/^session_/);
    });

    it('应该允许设置新的 sessionId', () => {
      registry.setSessionId('new-session-456');
      expect(registry.getSessionId()).toBe('new-session-456');
    });
  });

  describe('on()', () => {
    it('应该注册 hook 并返回 ID', () => {
      const handler = vi.fn();
      const id = registry.on('session:start', handler);

      expect(id).toMatch(/^hook_/);
      expect(registry.count('session:start')).toBe(1);
    });

    it('应该按优先级排序 hooks', () => {
      const calls: string[] = [];

      registry.on('session:start', () => { calls.push('normal'); }, { priority: 'normal' });
      registry.on('session:start', () => { calls.push('highest'); }, { priority: 'highest' });
      registry.on('session:start', () => { calls.push('low'); }, { priority: 'low' });

      expect(registry.count('session:start')).toBe(3);

      // 验证排序（通过查看内部 hooks 数组）
      const hooks = registry.getHooks('session:start');
      expect(hooks[0].priority).toBe(100); // highest
      expect(hooks[1].priority).toBe(50);  // normal
      expect(hooks[2].priority).toBe(25);  // low
    });
  });

  describe('once()', () => {
    it('应该注册一次性 hook', async () => {
      const handler = vi.fn();
      const context: SessionStartHookContext = {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      };

      registry.once('session:start', handler);

      expect(registry.count('session:start')).toBe(1);

      // 第一次触发
      await registry.emit('session:start', context);
      expect(handler).toHaveBeenCalledTimes(1);

      // 一次性 hook 应该被移除
      expect(registry.count('session:start')).toBe(0);

      // 第二次触发不应该执行
      await registry.emit('session:start', context);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('off()', () => {
    it('应该注销已注册的 hook', () => {
      const handler = vi.fn();
      const id = registry.on('session:start', handler);

      expect(registry.count('session:start')).toBe(1);

      const result = registry.off(id);

      expect(result).toBe(true);
      expect(registry.count('session:start')).toBe(0);
    });

    it('应该返回 false 如果 hook 不存在', () => {
      const result = registry.off('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('clear()', () => {
    it('应该清除指定类型的所有 hooks', () => {
      registry.on('session:start', vi.fn());
      registry.on('session:start', vi.fn());
      registry.on('session:end', vi.fn());

      registry.clear('session:start');

      expect(registry.count('session:start')).toBe(0);
      expect(registry.count('session:end')).toBe(1);
    });
  });

  describe('clearAll()', () => {
    it('应该清除所有 hooks', () => {
      registry.on('session:start', vi.fn());
      registry.on('session:end', vi.fn());
      registry.on('tool:before', vi.fn());

      registry.clearAll();

      expect(registry.totalCount()).toBe(0);
    });
  });

  describe('emit()', () => {
    it('应该触发所有注册的 hooks', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const context: SessionStartHookContext = {
        sessionId: 'test-session-123',
        prompt: 'Hello',
        timestamp: new Date(),
      };

      registry.on('session:start', handler1);
      registry.on('session:start', handler2);

      const result = await registry.emit('session:start', context);

      expect(result).toBe(true);
      expect(handler1).toHaveBeenCalledWith(context);
      expect(handler2).toHaveBeenCalledWith(context);
    });

    it('应该按优先级顺序执行 hooks', async () => {
      const calls: string[] = [];

      registry.on('session:start', () => { calls.push('low'); }, { priority: 'low' });
      registry.on('session:start', () => { calls.push('highest'); }, { priority: 'highest' });
      registry.on('session:start', () => { calls.push('normal'); }, { priority: 'normal' });

      await registry.emit('session:start', {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      });

      expect(calls).toEqual(['highest', 'normal', 'low']);
    });

    it('应该中止执行如果 hook 返回 proceed: false', async () => {
      const calls: string[] = [];
      const context: SessionStartHookContext = {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      };

      registry.on('session:start', () => {
        calls.push('first');
        return { proceed: false };
      }, { priority: 'high' });

      registry.on('session:start', () => {
        calls.push('second');
      }, { priority: 'low' });

      const result = await registry.emit('session:start', context);

      expect(result).toBe(false);
      expect(calls).toEqual(['first']);
      expect(calls).not.toContain('second');
    });

    it('应该继续执行如果 hook 抛出错误', async () => {
      const calls: string[] = [];
      const context: SessionStartHookContext = {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      };

      registry.on('session:start', () => {
        calls.push('error');
        throw new Error('Test error');
      }, { priority: 'high' });

      registry.on('session:start', () => {
        calls.push('success');
      }, { priority: 'low' });

      const result = await registry.emit('session:start', context);

      expect(result).toBe(true);
      expect(calls).toEqual(['error', 'success']);
    });

    it('应该在没有 hooks 时返回 true', async () => {
      const result = await registry.emit('session:start', {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      });

      expect(result).toBe(true);
    });
  });

  describe('emitSync()', () => {
    it('应该同步触发 hooks', () => {
      const calls: string[] = [];

      registry.on('session:start', () => { calls.push('first'); });
      registry.on('session:start', () => { calls.push('second'); });

      const result = registry.emitSync('session:start', {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      });

      expect(result).toBe(true);
      expect(calls).toEqual(['first', 'second']);
    });
  });

  describe('emitToolBefore()', () => {
    it('应该返回原始上下文如果没有 hooks', async () => {
      const context: ToolBeforeHookContext = {
        sessionId: 'test-session-123',
        toolName: 'Bash',
        input: { command: 'ls' },
        timestamp: new Date(),
      };

      const result = await registry.emitToolBefore(context);

      expect(result.proceed).toBe(true);
      expect(result.context).toEqual(context);
    });

    it('应该允许修改上下文', async () => {
      const context: ToolBeforeHookContext = {
        sessionId: 'test-session-123',
        toolName: 'Bash',
        input: { command: 'ls' },
        timestamp: new Date(),
      };

      registry.on('tool:before', () => ({
        proceed: true,
        modifiedData: {
          input: { command: 'ls -la' },
        },
      }));

      const result = await registry.emitToolBefore(context);

      expect(result.proceed).toBe(true);
      expect(result.context.input.command).toBe('ls -la');
    });

    it('应该支持中止工具执行', async () => {
      const context: ToolBeforeHookContext = {
        sessionId: 'test-session-123',
        toolName: 'Bash',
        input: { command: 'rm -rf /' },
        timestamp: new Date(),
      };

      registry.on('tool:before', () => ({
        proceed: false,
        error: new Error('Blocked dangerous command'),
      }), { priority: 'highest' });

      const result = await registry.emitToolBefore(context);

      expect(result.proceed).toBe(false);
      expect(result.error?.message).toBe('Blocked dangerous command');
    });

    it('应该链式修改上下文', async () => {
      const context: ToolBeforeHookContext = {
        sessionId: 'test-session-123',
        toolName: 'Bash',
        input: { command: 'ls' },
        timestamp: new Date(),
      };

      // 第一个 hook 添加 timeout
      registry.on('tool:before', () => ({
        proceed: true,
        modifiedData: {
          input: { command: 'ls', timeout: 30000 },
        },
      }), { priority: 'high' });

      // 第二个 hook 添加 cwd
      registry.on('tool:before', (ctx) => ({
        proceed: true,
        modifiedData: {
          input: { ...ctx.input, cwd: '/home' },
        },
      }), { priority: 'normal' });

      const result = await registry.emitToolBefore(context);

      expect(result.proceed).toBe(true);
      expect(result.context.input).toEqual({
        command: 'ls',
        timeout: 30000,
        cwd: '/home',
      });
    });
  });

  describe('查询方法', () => {
    it('count() 应该返回正确的数量', () => {
      registry.on('session:start', vi.fn());
      registry.on('session:start', vi.fn());
      registry.on('session:end', vi.fn());

      expect(registry.count('session:start')).toBe(2);
      expect(registry.count('session:end')).toBe(1);
      expect(registry.count('tool:before')).toBe(0);
    });

    it('totalCount() 应该返回所有 hooks 的总数', () => {
      registry.on('session:start', vi.fn());
      registry.on('session:end', vi.fn());
      registry.on('tool:before', vi.fn());

      expect(registry.totalCount()).toBe(3);
    });

    it('has() 应该正确检查 hooks 是否存在', () => {
      registry.on('session:start', vi.fn());

      expect(registry.has('session:start')).toBe(true);
      expect(registry.has('session:end')).toBe(false);
    });

    it('getHooks() 应该返回 hooks 数组', () => {
      registry.on('session:start', vi.fn(), { description: 'Test hook' });

      const hooks = registry.getHooks('session:start');

      expect(hooks).toHaveLength(1);
      expect(hooks[0].description).toBe('Test hook');
    });
  });

  describe('超时保护', () => {
    it('应该在 hook 超时时记录日志并继续执行', async () => {
      // 启用追踪以便验证
      registry.enableTracking();

      const calls: string[] = [];
      const context: SessionStartHookContext = {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      };

      // 第一个 hook 会超时
      registry.on('session:start', async () => {
        calls.push('timeout-hook');
        await sleep(100); // 超过 50ms 超时
        return { proceed: true };
      }, { priority: 'high', timeout: 50 });

      // 第二个 hook 应该继续执行
      registry.on('session:start', () => {
        calls.push('normal-hook');
      }, { priority: 'low' });

      const result = await registry.emit('session:start', context);

      // 应该继续执行后续 hooks
      expect(result).toBe(true);
      expect(calls).toContain('timeout-hook');
      expect(calls).toContain('normal-hook');

      // 验证日志中有超时记录
      const logs = registry.getExecutionLog();
      const timeoutLog = logs.find(l => l.timedOut);
      expect(timeoutLog).toBeDefined();
      expect(timeoutLog?.hookId).toMatch(/^hook_/);
    });

    it('应该允许设置无限超时（timeout: 0）', async () => {
      const calls: string[] = [];
      const context: SessionStartHookContext = {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      };

      registry.on('session:start', async () => {
        calls.push('slow-hook');
        await sleep(30);
        return { proceed: true };
      }, { timeout: 0 }); // 无超时

      const result = await registry.emit('session:start', context);

      expect(result).toBe(true);
      expect(calls).toContain('slow-hook');
    });

    it('超时的 hook 应该返回错误信息', async () => {
      registry.enableTracking();

      const context: SessionStartHookContext = {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      };

      registry.on('session:start', async () => {
        await sleep(100);
        return { proceed: true };
      }, { timeout: 10 });

      await registry.emit('session:start', context);

      const logs = registry.getExecutionLog();
      const timeoutLog = logs.find(l => l.timedOut);
      expect(timeoutLog?.error?.message).toContain('timed out');
    });
  });

  describe('执行追踪', () => {
    it('默认应该禁用追踪', () => {
      const newRegistry = new HookRegistry('test');
      expect(newRegistry.getTrackingOptions().enabled).toBe(false);
    });

    it('应该在构造函数中接受追踪配置', () => {
      const trackingRegistry = new HookRegistry('test', { enabled: true, maxLogEntries: 50 });
      expect(trackingRegistry.getTrackingOptions().enabled).toBe(true);
      expect(trackingRegistry.getTrackingOptions().maxLogEntries).toBe(50);
    });

    it('应该记录 hook 执行日志', async () => {
      registry.enableTracking();

      const context: SessionStartHookContext = {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      };

      registry.on('session:start', () => {
        return { proceed: true };
      }, { description: 'Test hook' });

      await registry.emit('session:start', context);

      const logs = registry.getExecutionLog();
      expect(logs).toHaveLength(1);
      expect(logs[0].success).toBe(true);
      expect(logs[0].timedOut).toBe(false);
      expect(logs[0].duration).toBeGreaterThanOrEqual(0);
    });

    it('应该记录失败的 hook 执行', async () => {
      registry.enableTracking();

      const context: SessionStartHookContext = {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      };

      registry.on('session:start', () => {
        throw new Error('Test error');
      });

      await registry.emit('session:start', context);

      const logs = registry.getExecutionLog();
      expect(logs).toHaveLength(1);
      expect(logs[0].success).toBe(false);
      expect(logs[0].error?.message).toBe('Test error');
    });

    it('应该记录中止传播的 hook', async () => {
      registry.enableTracking();

      const context: SessionStartHookContext = {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      };

      registry.on('session:start', () => {
        return { proceed: false };
      }, { priority: 'high' });

      registry.on('session:start', () => {
        // 这个不应该被执行
      }, { priority: 'low' });

      await registry.emit('session:start', context);

      const logs = registry.getExecutionLog();
      expect(logs).toHaveLength(1);
      expect(logs[0].stoppedPropagation).toBe(true);
    });

    it('应该限制最大日志条目数', async () => {
      registry.enableTracking(5); // 最大 5 条

      const context: SessionStartHookContext = {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      };

      // 执行 10 次
      for (let i = 0; i < 10; i++) {
        registry.on('session:start', () => {});
        await registry.emit('session:start', context);
      }

      const logs = registry.getExecutionLog();
      expect(logs.length).toBe(5);
    });

    it('应该能够获取最近的执行日志', async () => {
      registry.enableTracking();

      const context: SessionStartHookContext = {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      };

      for (let i = 0; i < 5; i++) {
        registry.on('session:start', () => {});
        await registry.emit('session:start', context);
      }

      const recentLogs = registry.getRecentExecutionLog(3);
      expect(recentLogs.length).toBe(3);
    });

    it('应该能够清除执行日志', async () => {
      registry.enableTracking();

      const context: SessionStartHookContext = {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      };

      registry.on('session:start', () => {});
      await registry.emit('session:start', context);

      expect(registry.getExecutionLog().length).toBe(1);

      registry.clearExecutionLog();

      expect(registry.getExecutionLog().length).toBe(0);
    });

    it('应该能够动态启用/禁用追踪', () => {
      registry.disableTracking();
      expect(registry.getTrackingOptions().enabled).toBe(false);

      registry.enableTracking();
      expect(registry.getTrackingOptions().enabled).toBe(true);

      registry.setTrackingOptions({ enabled: false, maxLogEntries: 200 });
      expect(registry.getTrackingOptions().enabled).toBe(false);
      expect(registry.getTrackingOptions().maxLogEntries).toBe(200);
    });

    it('禁用追踪时不应该记录日志', async () => {
      registry.disableTracking();

      const context: SessionStartHookContext = {
        sessionId: 'test-session-123',
        timestamp: new Date(),
      };

      registry.on('session:start', () => {});
      await registry.emit('session:start', context);

      const logs = registry.getExecutionLog();
      expect(logs.length).toBe(0);
    });
  });

  describe('emitToolBefore 超时和追踪', () => {
    it('应该在 tool:before hook 超时时记录日志', async () => {
      registry.enableTracking();

      const context: ToolBeforeHookContext = {
        sessionId: 'test-session-123',
        toolName: 'Bash',
        input: { command: 'ls' },
        timestamp: new Date(),
      };

      registry.on('tool:before', async () => {
        await sleep(100);
        return { proceed: true };
      }, { timeout: 10 });

      const result = await registry.emitToolBefore(context);

      expect(result.proceed).toBe(true);

      const logs = registry.getExecutionLog();
      const timeoutLog = logs.find(l => l.timedOut);
      expect(timeoutLog).toBeDefined();
      expect(timeoutLog?.type).toBe('tool:before');
    });

    it('应该记录 tool:before hook 的中止传播', async () => {
      registry.enableTracking();

      const context: ToolBeforeHookContext = {
        sessionId: 'test-session-123',
        toolName: 'Bash',
        input: { command: 'rm -rf /' },
        timestamp: new Date(),
      };

      registry.on('tool:before', () => ({
        proceed: false,
        error: new Error('Blocked'),
      }), { priority: 'highest' });

      await registry.emitToolBefore(context);

      const logs = registry.getExecutionLog();
      expect(logs[0].stoppedPropagation).toBe(true);
    });
  });
});
