/**
 * 7.5 WorkflowCapability 超时保护集成测试
 *
 * 验证工作流执行中的心跳启动和停止
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowCapability } from '../../src/agents/capabilities/WorkflowCapability.js';
import {
  createMockAgentContext,
  createTestProviderConfig,
} from '../mocks/agent-context.mock.js';
import type { AgentContext, AgentResult } from '../../src/agents/core/types.js';

describe('WorkflowCapability 超时保护', () => {
  let capability: WorkflowCapability;
  let context: AgentContext;

  const testProvider = createTestProviderConfig({
    id: 'test',
    name: 'Test',
  });

  const mockAgentResult: AgentResult = {
    text: 'Done',
    success: true,
    tools: [],
  };

  beforeEach(() => {
    capability = new WorkflowCapability();
    context = createMockAgentContext({
      activeProvider: testProvider,
      providers: [testProvider],
    });
    vi.mocked(context.runner.execute).mockResolvedValue(mockAgentResult);
    capability.initialize(context);
  });

  it('工作流执行时应启动心跳', async () => {
    await capability.run('Test task');

    expect(context.timeoutCap.startHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        interval: expect.any(Number),
        stallTimeout: expect.any(Number),
      }),
      expect.any(AbortController)
    );
  });

  it('工作流完成后应停止心跳', async () => {
    await capability.run('Test task');

    expect(context.timeoutCap.stopHeartbeat).toHaveBeenCalled();
  });

  it('工作流出错后应停止心跳（finally 保证）', async () => {
    vi.mocked(context.runner.execute).mockRejectedValue(new Error('exec failed'));

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

  it('心跳停止应在 runner.execute 之后', async () => {
    const callOrder: string[] = [];
    vi.mocked(context.timeoutCap.startHeartbeat).mockImplementation(() => {
      callOrder.push('startHeartbeat');
    });
    vi.mocked(context.runner.execute).mockImplementation(async () => {
      callOrder.push('execute');
      return mockAgentResult;
    });
    vi.mocked(context.timeoutCap.stopHeartbeat).mockImplementation(() => {
      callOrder.push('stopHeartbeat');
    });

    await capability.run('Test task');

    expect(callOrder).toEqual(['startHeartbeat', 'execute', 'stopHeartbeat']);
  });
});
