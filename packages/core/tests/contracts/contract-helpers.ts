/**
 * 契约测试辅助
 */

import { vi } from 'vitest';
import type { AgentContext } from '../../src/agents/core/types.js';
import type { ScheduleCapability } from '../../src/agents/capabilities/ScheduleCapability.js';

/**
 * 从 coordinator.md 解析 agent 工具下列出的 Worker 类型
 */
export function parseCoordinatorWorkerTypes(markdown: string): string[] {
  const toolsSection = markdown.match(/## Your Tools[\s\S]*?(?=\n## )/)?.[0] ?? markdown;
  const agentBlock = toolsSection.match(/1\. \*\*agent\*\*[\s\S]*?(?=\n2\. \*\*)/)?.[0] ?? '';
  const matches = [...agentBlock.matchAll(/- "(\w+)":/g)];
  return matches.map(m => m[1]);
}

/**
 * 构建 Coordinator system prompt（与 CoordinatorCapability.buildSystemPrompt 同路径）
 */
export async function buildCoordinatorSystemPrompt(task: string): Promise<string> {
  const { CoordinatorCapability } = await import('../../src/agents/capabilities/CoordinatorCapability.js');
  const { createMockAgentContext, createTestProviderConfig } = await import('../mocks/agent-context.mock.js');

  const capability = new CoordinatorCapability();
  const context = createMockAgentContext({
    activeProvider: createTestProviderConfig(),
    providers: [createTestProviderConfig()],
  });
  capability.initialize(context);

  const buildSystemPrompt = (capability as unknown as {
    buildSystemPrompt: (t: string) => Promise<string>;
  }).buildSystemPrompt.bind(capability);

  return buildSystemPrompt(task);
}

/** 契约测试：mock office MCP + schedule capability，满足 agent-tool Worker 前置条件 */
export function configureWorkerSetupMocks(context: AgentContext): void {
  vi.mocked(context.mcpManager.getAllTools).mockReturnValue({
    officecli_create: { description: 'mock officecli tool' },
  });
  const baseGetCapability = context.getCapability.bind(context);
  vi.mocked(context.getCapability).mockImplementation((name: string) => {
    if (name === 'schedule') {
      return {} as ScheduleCapability;
    }
    return baseGetCapability(name);
  });
}
