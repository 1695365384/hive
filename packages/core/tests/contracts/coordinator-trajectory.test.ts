/**
 * Coordinator 轨迹契约测试
 *
 * 用 scripted mock LLM 驱动 Coordinator，断言 tool-call 轨迹与 Worker 路由。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockAgentContext,
  createTestProviderConfig,
} from '../mocks/agent-context.mock.js';
import type { AgentContext } from '../../src/agents/core/types.js';
import {
  TRAJECTORY_FIXTURES,
  type TrajectoryFixture,
} from './fixtures/trajectory-fixtures.js';

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

function createRuntimeMockForFixture(fixture: TrajectoryFixture) {
  return (config: { tools?: Record<string, { execute?: (input: unknown) => Promise<unknown> }> }) => {
    let resolveResult!: (result: unknown) => void;
    const resultPromise = new Promise((resolve) => { resolveResult = resolve; });

    const events = (async function* () {
      const toolsUsed: string[] = [];

      for (const step of fixture.steps) {
        yield { type: 'tool-call', toolName: step.toolName, input: step.input };

        const tool = config.tools?.[step.toolName];
        let output = step.output ?? 'ok';
        if (tool?.execute) {
          output = await tool.execute(step.input);
        }
        toolsUsed.push(step.toolName);

        yield { type: 'tool-result', toolName: step.toolName, output };
      }

      const finalText = fixture.steps.at(-1)?.finalText ?? 'Done';
      if (finalText) {
        yield { type: 'text-delta', text: finalText };
      }

      resolveResult({
        text: finalText,
        tools: toolsUsed,
        success: true,
        usage: { promptTokens: 100, completionTokens: 50 },
        steps: [],
        duration: 50,
      });
    })();

    return { events, result: resultPromise };
  };
}

describe('Coordinator Trajectory Contract', () => {
  let capability: CoordinatorCapability;
  let context: AgentContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteStreaming.mockReset();
    mockExecuteStreaming.mockResolvedValue({
      text: 'Worker done',
      tools: [],
      success: true,
    });

    capability = new CoordinatorCapability();
    context = createMockAgentContext({
      activeProvider: createTestProviderConfig(),
      providers: [createTestProviderConfig()],
    });
    capability.initialize(context);
  });

  for (const fixture of TRAJECTORY_FIXTURES.filter(
    f => f.id !== 'office-ppt' && f.id !== 'schedule-cron',
  )) {
    it(`[${fixture.id}] records expected agent() trajectory`, async () => {
      mockRuntimeStream.mockImplementation(createRuntimeMockForFixture(fixture));

      const toolCalls: Array<{ tool: string; input: unknown }> = [];

      await capability.run(fixture.task, {
        onTool: (tool, input) => {
          toolCalls.push({ tool, input });
        },
      });

      const agentCalls = toolCalls.filter(c => c.tool === 'agent');
      expect(agentCalls).toHaveLength(fixture.expectAgentCalls ?? 0);

      if (fixture.expectedWorkerTypes) {
        const workerTypes = agentCalls.map(c => (c.input as { type?: string }).type);
        expect(workerTypes).toEqual(fixture.expectedWorkerTypes);
      }
    });
  }

  it('office-ppt and schedule-cron use direct routing (see scenario-direct-routing.test.ts)', () => {
    expect(TRAJECTORY_FIXTURES.find(f => f.id === 'office-ppt')).toBeDefined();
    expect(TRAJECTORY_FIXTURES.find(f => f.id === 'schedule-cron')).toBeDefined();
  });
});
