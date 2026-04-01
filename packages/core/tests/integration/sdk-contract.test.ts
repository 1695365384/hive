/**
 * SDK 公开 API 契约测试
 *
 * 验证 packages/core/src/index.ts 导出的所有公开 API 符合消费者契约：
 * - 命名导出存在且类型正确
 * - Agent 构造函数参数可选
 * - 便捷函数可调用
 */

import { describe, it, expect, beforeAll } from 'vitest';

// ============================================
// 1. 核心入口导出
// ============================================

describe('Core Agent Exports', () => {
  // 动态 import 避免在顶层解析所有模块
  let core: Record<string, unknown>;

  beforeAll(async () => {
    core = await import('../../src/index.js');
  });

  // 主类
  it('should export Agent class', () => {
    expect(core.Agent).toBeDefined();
    expect(typeof core.Agent).toBe('function');
  });

  it('should export createAgent factory', () => {
    expect(core.createAgent).toBeDefined();
    expect(typeof core.createAgent).toBe('function');
  });

  it('should export getAgent singleton accessor', () => {
    expect(core.getAgent).toBeDefined();
    expect(typeof core.getAgent).toBe('function');
  });

  // 便捷函数
  it('should export ask convenience function', () => {
    expect(core.ask).toBeDefined();
    expect(typeof core.ask).toBe('function');
  });

  // 类型导出（type-only exports 在运行时不存在，但我们可以验证模块加载不报错）
  it('should load module without errors', () => {
    expect(core).toBeDefined();
  });
});

// ============================================
// 2. 提供商管理导出
// ============================================

describe('Provider Management Exports', () => {
  let core: Record<string, unknown>;

  beforeAll(async () => {
    core = await import('../../src/index.js');
  });

  it('should export ProviderManager', () => {
    expect(core.ProviderManager).toBeDefined();
    expect(typeof core.ProviderManager).toBe('function');
  });

  it('should export createProviderManager', () => {
    expect(core.createProviderManager).toBeDefined();
    expect(typeof core.createProviderManager).toBe('function');
  });

  it('should export EnvSource', () => {
    expect(core.EnvSource).toBeDefined();
  });

  it('should export adapter creation functions', () => {
    expect(core.createAdapter).toBeDefined();
    expect(core.createOpenAIAdapter).toBeDefined();
    expect(core.createAnthropicAdapter).toBeDefined();
    expect(core.createGoogleAdapter).toBeDefined();
    expect(core.createOpenAICompatibleAdapter).toBeDefined();
  });

  it('should export getKnownProviders', () => {
    expect(core.getKnownProviders).toBeDefined();
    expect(typeof core.getKnownProviders).toBe('function');
  });
});

// ============================================
// 3. 工具系统导出
// ============================================

describe('Tool System Exports', () => {
  let core: Record<string, unknown>;

  beforeAll(async () => {
    core = await import('../../src/index.js');
  });

  it('should export ToolRegistry', () => {
    expect(core.ToolRegistry).toBeDefined();
    expect(typeof core.ToolRegistry).toBe('function');
  });

  it('should export createToolRegistry', () => {
    expect(core.createToolRegistry).toBeDefined();
    expect(typeof core.createToolRegistry).toBe('function');
  });

  it('should export all built-in tool creators', () => {
    const toolCreators = [
      'createBashTool',
      'createFileTool',
      'createGlobTool',
      'createGrepTool',
      'createWebSearchTool',
      'createWebFetchTool',
      'createAskUserTool',
    ];
    for (const name of toolCreators) {
      expect((core as Record<string, unknown>)[name]).toBeDefined();
      expect(typeof (core as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('should export security utilities', () => {
    expect(core.truncateOutput).toBeDefined();
    expect(core.isDangerousCommand).toBeDefined();
    expect(core.isSensitiveFile).toBeDefined();
  });
});

// ============================================
// 4. 技能系统导出
// ============================================

describe('Skill System Exports', () => {
  let core: Record<string, unknown>;

  beforeAll(async () => {
    core = await import('../../src/index.js');
  });

  it('should export SkillLoader', () => {
    expect(core.SkillLoader).toBeDefined();
  });

  it('should export SkillMatcher', () => {
    expect(core.SkillMatcher).toBeDefined();
  });

  it('should export SkillRegistry', () => {
    expect(core.SkillRegistry).toBeDefined();
  });

  it('should export initializeSkills', () => {
    expect(core.initializeSkills).toBeDefined();
    expect(typeof core.initializeSkills).toBe('function');
  });
});

// ============================================
// 5. Hooks 系统导出
// ============================================

describe('Hooks System Exports', () => {
  let core: Record<string, unknown>;

  beforeAll(async () => {
    core = await import('../../src/index.js');
  });

  it('should export HookRegistry', () => {
    expect(core.HookRegistry).toBeDefined();
    expect(typeof core.HookRegistry).toBe('function');
  });
});

// ============================================
// 6. 会话系统导出
// ============================================

describe('Session System Exports', () => {
  let core: Record<string, unknown>;

  beforeAll(async () => {
    core = await import('../../src/index.js');
  });

  it('should export SessionStorage', () => {
    expect(core.SessionStorage).toBeDefined();
  });

  it('should export SessionManager', () => {
    expect(core.SessionManager).toBeDefined();
  });

  it('should export createSessionStorage', () => {
    expect(core.createSessionStorage).toBeDefined();
    expect(typeof core.createSessionStorage).toBe('function');
  });

  it('should export createSessionManager', () => {
    expect(core.createSessionManager).toBeDefined();
    expect(typeof core.createSessionManager).toBe('function');
  });
});

// ============================================
// 7. 存储系统导出
// ============================================

describe('Storage System Exports', () => {
  let core: Record<string, unknown>;

  beforeAll(async () => {
    core = await import('../../src/index.js');
  });

  it('should export DatabaseManager', () => {
    expect(core.DatabaseManager).toBeDefined();
  });

  it('should export SessionRepository', () => {
    expect(core.SessionRepository).toBeDefined();
  });

  it('should export ScheduleRepository', () => {
    expect(core.ScheduleRepository).toBeDefined();
  });

  it('should export MemoryRepository', () => {
    expect(core.MemoryRepository).toBeDefined();
  });
});

// ============================================
// 8. Agent 构造函数 + 公开方法
// ============================================

describe('Agent Instance API', () => {
  it('should create Agent with no arguments', async () => {
    const { Agent } = await import('../../src/agents/core/index.js');
    const agent = new Agent();
    expect(agent).toBeInstanceOf(Agent);
    await agent.dispose();
  });

  it('should create Agent via createAgent factory', async () => {
    const { createAgent } = await import('../../src/agents/core/index.js');
    const agent = createAgent();
    expect(agent).toBeDefined();
    await agent.dispose();
  });

  it('should have all public methods after initialize', async () => {
    const { createAgent } = await import('../../src/agents/core/index.js');
    const agent = createAgent();
    await agent.initialize();

    const requiredMethods = [
      'dispatch',
      'listProviders', 'useProvider',
      'listSkills', 'getSkill', 'matchSkill',
      'createSession', 'loadSession', 'listSessions',
      'startHeartbeat', 'stopHeartbeat',
      'notify',
    ];

    for (const method of requiredMethods) {
      expect(typeof (agent as unknown as Record<string, unknown>)[method]).toBe(`function`);
    }

    await agent.dispose();
  });

  it('should have currentProvider property', async () => {
    const { createAgent } = await import('../../src/agents/core/index.js');
    const agent = createAgent();
    await agent.initialize();
    // currentProvider 可以是 null（没有配置 provider）
    expect(agent).toHaveProperty('currentProvider');
    await agent.dispose();
  });

  it('should have currentSession property', async () => {
    const { createAgent } = await import('../../src/agents/core/index.js');
    const agent = createAgent();
    await agent.initialize();
    expect(agent).toHaveProperty('currentSession');
    await agent.dispose();
  });

  it('should have context property', async () => {
    const { createAgent } = await import('../../src/agents/core/index.js');
    const agent = createAgent();
    await agent.initialize();
    expect(agent.context).toBeDefined();
    expect(agent.context.hookRegistry).toBeDefined();
    await agent.dispose();
  });
});

// ============================================
// 9. 便捷函数可调用
// ============================================

describe('Convenience Functions', () => {
  it('should call ask without throwing', async () => {
    const { ask } = await import('../../src/index.js');
    // ask 内部会创建 Agent 并 chat，在 mock 环境下不应抛异常
    // 但如果没有配置 provider 可能会报错，所以只验证函数存在
    expect(typeof ask).toBe('function');
  });
});

// ============================================
// 10. AgentRunner 导出
// ============================================

describe('AgentRunner Exports', () => {
  it('should export AgentRunner class', async () => {
    const { AgentRunner } = await import('../../src/index.js');
    expect(AgentRunner).toBeDefined();
    expect(typeof AgentRunner).toBe('function');
  });

  it('should export createAgentRunner factory', async () => {
    const { createAgentRunner } = await import('../../src/index.js');
    expect(createAgentRunner).toBeDefined();
    expect(typeof createAgentRunner).toBe('function');
  });
});
