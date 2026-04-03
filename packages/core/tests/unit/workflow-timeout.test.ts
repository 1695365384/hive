/**
 * CoordinatorCapability 超时保护集成测试
 *
 * 验证执行中的心跳启动和停止
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockAgentContext,
  createTestProviderConfig,
} from '../mocks/agent-context.mock.js';
import type { AgentContext } from '../../src/agents/core/types.js';

// Mock LLMRuntime
const mockRuntimeRun = vi.fn();
const mockRuntimeStream = vi.fn();
vi.mock('../../src/agents/runtime/LLMRuntime.js', () => {
  return {
    LLMRuntime: class MockLLMRuntime {
      run = mockRuntimeRun;
      stream = mockRuntimeStream;
    },
  };
});

import { CoordinatorCapability } from '../../src/agents/capabilities/CoordinatorCapability.js';

describe('CoordinatorCapability 超时保护', () => {
  let capability: CoordinatorCapability;
  let context: AgentContext;

  const testProvider = createTestProviderConfig({
    id: 'test',
    name: 'Test',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRuntimeStream.mockImplementation((_config: any) => {
      let resolveResult!: (result: any) => void;
      const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
      const events = (async function* () {
        yield { type: 'text-delta', text: 'Done' };
        resolveResult({
          text: 'Done',
          tools: [],
          success: true,
          usage: { promptTokens: 50, completionTokens: 10 },
          steps: [],
          duration: 50,
        });
      })();
      return { events, result: resultPromise };
    });

    capability = new CoordinatorCapability();
    context = createMockAgentContext({
      activeProvider: testProvider,
      providers: [testProvider],
    });
    capability.initialize(context);
  });

  it('执行任务时应启动心跳', async () => {
    await capability.run('Test task');

    expect(context.timeoutCap.startHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        interval: expect.any(Number),
        stallTimeout: expect.any(Number),
      }),
      expect.any(AbortController)
    );
  });

  it('执行完成后应停止心跳', async () => {
    await capability.run('Test task');

    expect(context.timeoutCap.stopHeartbeat).toHaveBeenCalled();
  });

  it('执行出错后应停止心跳（finally 保证）', async () => {
    mockRuntimeStream.mockImplementation((_config: any) => {
      let resolveResult!: (result: any) => void;
      const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
      const events = (async function* () {
        throw new Error('exec failed');
      })();
      return { events, result: resultPromise };
    });

    await capability.run('Test task');

    expect(context.timeoutCap.stopHeartbeat).toHaveBeenCalled();
  });

  it('心跳应使用 AbortController', async () => {
    await capability.run('Test task');

    const startCall = vi.mocked(context.timeoutCap.startHeartbeat).mock.calls[0];
    expect(startCall[1]).toBeInstanceOf(AbortController);
  });

  it('心跳配置应来自 timeoutCap.getConfig()', async () => {
    const config = (context.timeoutCap as any).getConfig() as ReturnType<typeof context.timeoutCap.getConfig>;

    await capability.run('Test task');

    expect(context.timeoutCap.startHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        interval: config.heartbeatInterval,
        stallTimeout: config.stallTimeout,
      }),
      expect.any(AbortController)
    );
  });

  it('心跳停止应在 runtime.run 之后', async () => {
    const callOrder: string[] = [];
    vi.mocked(context.timeoutCap.startHeartbeat).mockImplementation(() => {
      callOrder.push('startHeartbeat');
    });
    mockRuntimeStream.mockImplementation((_config: any) => {
      let resolveResult!: (result: any) => void;
      const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
      const events = (async function* () {
        callOrder.push('stream');
        yield { type: 'text-delta', text: 'Done' };
        resolveResult({
          text: 'Done',
          tools: ['agent'],
          success: true,
          usage: { promptTokens: 50, completionTokens: 10 },
          steps: [],
          duration: 50,
        });
      })();
      return { events, result: resultPromise };
    });
    vi.mocked(context.timeoutCap.stopHeartbeat).mockImplementation(() => {
      callOrder.push('stopHeartbeat');
    });

    await capability.run('Test task');

    expect(callOrder).toEqual(['startHeartbeat', 'stream', 'stopHeartbeat']);
  });
});
