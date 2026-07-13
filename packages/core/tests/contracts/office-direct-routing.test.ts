/**
 * 场景确定性路由测试（Office / Schedule）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockAgentContext,
  createTestProviderConfig,
} from '../mocks/agent-context.mock.js';

const mockExecuteStreaming = vi.fn();
vi.mock('../../src/agents/core/runner.js', () => ({
  createAgentRunner: () => ({
    executeStreaming: mockExecuteStreaming,
    getToolRegistry: () => ({ register: vi.fn(), getTool: vi.fn() }),
  }),
}));

vi.mock('ai', () => ({
  tool: (config: Record<string, unknown>) => config,
  zodSchema: (schema: unknown) => schema,
}));

const mockRuntimeStream = vi.fn();
vi.mock('../../src/agents/runtime/LLMRuntime.js', () => ({
  LLMRuntime: class MockLLMRuntime {
    stream = mockRuntimeStream;
  },
}));

import { CoordinatorCapability } from '../../src/agents/capabilities/CoordinatorCapability.js';
import { configureWorkerSetupMocks } from './contract-helpers.js';

describe('Scenario direct routing', () => {
  let capability: CoordinatorCapability;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteStreaming.mockResolvedValue({
      text: 'Created deck.pptx with officecli',
      tools: ['bash'],
      success: true,
    });
    mockRuntimeStream.mockImplementation(() => {
      throw new Error('Coordinator LLM should not run for direct-routed office tasks');
    });

    capability = new CoordinatorCapability();
    const context = createMockAgentContext({
      activeProvider: createTestProviderConfig(),
      providers: [createTestProviderConfig()],
    });
    configureWorkerSetupMocks(context);
    capability.initialize(context);
  });

  it('answers office inquiry without LLM or explore workers', async () => {
    const result = await capability.run('你能做PPT吗');

    expect(mockRuntimeStream).not.toHaveBeenCalled();
    expect(mockExecuteStreaming).not.toHaveBeenCalled();
    expect(result.text).toContain('officecli');
    expect(result.text).not.toMatch(/用 python-pptx|use python-pptx/i);
    expect(result.success).toBe(true);
  });

  it('spawns office worker directly for creation tasks', async () => {
    const result = await capability.run('帮我做一个关于 AI 的 PPT，3 页');

    expect(mockRuntimeStream).not.toHaveBeenCalled();
    expect(mockExecuteStreaming).toHaveBeenCalledWith(
      'office',
      expect.stringContaining('AI'),
      expect.any(Object),
      expect.any(Object),
    );
    expect(result.success).toBe(true);
  });

  it('answers schedule inquiry without LLM', async () => {
    const result = await capability.run('你能设置定时任务吗');

    expect(mockRuntimeStream).not.toHaveBeenCalled();
    expect(mockExecuteStreaming).not.toHaveBeenCalled();
    expect(result.text).toContain('schedule Worker');
    expect(result.success).toBe(true);
  });

  it('spawns schedule worker directly for creation tasks', async () => {
    const result = await capability.run('每天早上 9 点提醒我喝水');

    expect(mockRuntimeStream).not.toHaveBeenCalled();
    expect(mockExecuteStreaming).toHaveBeenCalledWith(
      'schedule',
      expect.stringContaining('喝水'),
      expect.any(Object),
      expect.any(Object),
    );
    expect(result.success).toBe(true);
  });
});
