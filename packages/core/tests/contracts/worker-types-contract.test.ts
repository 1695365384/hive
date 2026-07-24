/**
 * Worker 类型契约测试
 *
 * 防止 agent-tool schema、CORE_AGENTS、coordinator.md 三者漂移。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DELEGATABLE_WORKER_TYPES } from '../../src/agents/core/worker-types.js';
import { CORE_AGENTS } from '../../src/agents/core/agents.js';
import { ToolRegistry } from '../../src/tools/tool-registry.js';
import { parseCoordinatorWorkerTypes } from './contract-helpers.js';

const templatesDir = join(
  fileURLToPath(new URL('../../src/agents/prompts/templates', import.meta.url)),
);

// AgentLoop migration — CoordinatorCapability removed
describe.skip('Worker Types Contract', () => {
  // Eager coordinator.md read deferred — file removed with AgentLoop migration.
  const loadPromptWorkers = () => {
    const coordinatorMd = readFileSync(join(templatesDir, 'coordinator.md'), 'utf-8');
    return parseCoordinatorWorkerTypes(coordinatorMd);
  };

  it('coordinator.md lists every delegatable worker type', () => {
    expect(loadPromptWorkers().sort()).toEqual([...DELEGATABLE_WORKER_TYPES].sort());
  });

  it('CORE_AGENTS defines every delegatable worker type', () => {
    for (const type of DELEGATABLE_WORKER_TYPES) {
      expect(CORE_AGENTS[type]).toBeDefined();
      expect(CORE_AGENTS[type].type).toBe(type);
    }
  });

  it('ToolRegistry has a whitelist for every delegatable worker type', () => {
    const registry = new ToolRegistry();
    registry.registerBuiltInTools();

    for (const type of DELEGATABLE_WORKER_TYPES) {
      const tools = registry.getToolsForAgent(type);
      if (type === 'schedule') {
        // schedule 工具在 spawn 时动态注册
        expect(Object.keys(tools)).toHaveLength(0);
      } else {
        expect(Object.keys(tools).length).toBeGreaterThan(0);
      }
    }
  });

  it('critic and arbiter are not delegatable via agent()', () => {
    expect(loadPromptWorkers()).not.toContain('critic');
    expect(loadPromptWorkers()).not.toContain('arbiter');
  });
});
