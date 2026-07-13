/**
 * Coordinator 完成判定集成（契约层）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockAgentContext,
  createTestProviderConfig,
} from '../mocks/agent-context.mock.js';
import { OFFICE_PPT_FIXTURE } from './fixtures/trajectory-fixtures.js';

const mockExecuteStreaming = vi.fn();

vi.mock('../../src/agents/core/runner.js', () => ({
  createAgentRunner: () => ({
    executeStreaming: mockExecuteStreaming,
    getToolRegistry: () => ({
      register: vi.fn(),
      getTool: vi.fn(),
    }),
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

describe('Coordinator Completion Verification', () => {
  let capability: CoordinatorCapability;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteStreaming.mockResolvedValue({
      text: 'Created deck.pptx via officecli',
      tools: ['bash'],
      success: true,
    });

    capability = new CoordinatorCapability();
    const context = createMockAgentContext({
      activeProvider: createTestProviderConfig(),
      providers: [createTestProviderConfig()],
    });
    configureWorkerSetupMocks(context);
    capability.initialize(context);
  });

  it('direct-routes PPT creation to office worker without Coordinator LLM', async () => {
    const result = await capability.run('帮我做一个关于 AI 的 PPT');

    expect(mockRuntimeStream).not.toHaveBeenCalled();
    expect(mockExecuteStreaming).toHaveBeenCalledWith(
      'office',
      expect.stringContaining('AI'),
      expect.any(Object),
      expect.any(Object),
    );
    expect(result.success).toBe(true);
    expect(result.verification?.passed).toBe(true);
  });
});
