/**
 * AgentContext Mock
 *
 * 提供测试用的 AgentContext mock 工厂
 */

import { vi } from 'vitest';
import type { AgentContext, AgentRegistry, AgentConfig } from '../../src/agents/core/types.js';
import type { ProviderManager, ProviderConfig } from '../../src/providers/index.js';
import type { SkillRegistry, Skill, SkillMatchResult } from '../../src/skills/index.js';
import type { AgentRunner } from '../../src/agents/core/runner.js';
import type { HookRegistry } from '../../src/hooks/index.js';

// ============================================
// Mock 工厂函数
// ============================================

/**
 * 创建 Mock ProviderManager
 */
export function createMockProviderManager(overrides?: {
  activeProvider?: ProviderConfig | null;
  providers?: ProviderConfig[];
}): ProviderManager {
  return {
    active: overrides?.activeProvider ?? null,
    all: overrides?.providers ?? [],
    ids: overrides?.providers?.map(p => p.id) ?? [],
    getActiveProvider: vi.fn(() => overrides?.activeProvider ?? null),
    getAllProviders: vi.fn(() => overrides?.providers ?? []),
    switchProvider: vi.fn(() => true),
    switch: vi.fn(() => true),
    register: vi.fn(),
    unregister: vi.fn(),
    getMcpServers: vi.fn(() => ({})),
    getMcpServersForAgent: vi.fn(() => ({})),
    isCCSwitchInstalled: vi.fn(() => false),
    get: vi.fn(),
    getModel: vi.fn(),
    getModelForProvider: vi.fn(),
    getModels: vi.fn(async () => []),
    getModelSpec: vi.fn(),
    getContextWindow: vi.fn(async () => 4096),
    checkSupport: vi.fn(async () => true),
    estimateCost: vi.fn(),
    reload: vi.fn(),
    getSourceStatus: vi.fn(() => []),
    getProviderType: vi.fn(() => 'openai-compatible'),
    applyToEnv: vi.fn(),
  } as unknown as ProviderManager;
}

/**
 * 创建 Mock SkillRegistry
 */
export function createMockSkillRegistry(overrides?: {
  skills?: Skill[];
  matchResult?: SkillMatchResult | null;
}): SkillRegistry {
  const skills = overrides?.skills ?? [];

  // 实现真实的 generateSkillInstruction 方法
  const generateSkillInstruction = (skill: Skill): string => {
    let instruction = `## Active Skill: ${skill.metadata.name}\n\n`;
    instruction += `**Description**: ${skill.metadata.description}\n\n`;
    instruction += `**Version**: ${skill.metadata.version}\n\n`;
    instruction += `### Instructions\n\n${skill.body}`;
    return instruction;
  };

  // 实现真实的 generateSkillListDescription 方法
  const generateSkillListDescription = (): string => {
    if (skills.length === 0) {
      return '';
    }

    const lines = skills.map((skill) => {
      const { name, description } = skill.metadata;
      return `- **${name}**: ${description}`;
    });

    return `## Available Skills\n\n${lines.join('\n')}`;
  };

  return {
    size: skills.length,
    initialize: vi.fn(async () => {}),
    register: vi.fn(),
    unregister: vi.fn(() => true),
    get: vi.fn((name: string) => skills.find(s => s.metadata.name.toLowerCase() === name.toLowerCase())),
    has: vi.fn((name: string) => skills.some(s => s.metadata.name.toLowerCase() === name.toLowerCase())),
    getAll: vi.fn(() => skills),
    getAllMetadata: vi.fn(() => skills.map(s => s.metadata)),
    match: vi.fn(() => overrides?.matchResult ?? null),
    matchAll: vi.fn(() => overrides?.matchResult ? [overrides.matchResult] : []),
    generateSkillListDescription,
    generateSkillInstruction,
    clear: vi.fn(),
    loadFromDirectory: vi.fn(async () => {}),
  } as unknown as SkillRegistry;
}

/**
 * 创建 Mock AgentRunner
 */
export function createMockAgentRunner(): AgentRunner {
  return {
    execute: vi.fn(async () => ({
      text: 'Mock agent result',
      success: true,
      tools: [],
      usage: { input: 100, output: 50 },
    })),
  } as unknown as AgentRunner;
}

/**
 * 创建 Mock AgentRegistry
 */
export function createMockAgentRegistry(overrides?: {
  configs?: Record<string, AgentConfig>;
}): AgentRegistry {
  const configs = overrides?.configs ?? {};

  return {
    get: vi.fn((name: string) => configs[name]),
    getAllNames: vi.fn(() => Object.keys(configs)),
    register: vi.fn(),
    has: vi.fn((name: string) => name in configs),
  } as unknown as AgentRegistry;
}

/**
 * 创建 Mock HookRegistry
 */
export function createMockHookRegistry(sessionId?: string): HookRegistry {
  return {
    getSessionId: vi.fn(() => sessionId ?? 'test-session-id'),
    setSessionId: vi.fn(),
    on: vi.fn(() => 'mock-hook-id'),
    once: vi.fn(() => 'mock-hook-id'),
    off: vi.fn(() => true),
    clear: vi.fn(),
    clearAll: vi.fn(),
    emit: vi.fn(async () => true),
    emitSync: vi.fn(() => true),
    emitToolBefore: vi.fn(async () => ({ proceed: true, context: {} as any })),
    count: vi.fn(() => 0),
    totalCount: vi.fn(() => 0),
    has: vi.fn(() => false),
    getHooks: vi.fn(() => []),
    getExecutionLog: vi.fn(() => []),
    getRecentExecutionLog: vi.fn(() => []),
    clearExecutionLog: vi.fn(),
    getTrackingOptions: vi.fn(() => ({ enabled: false, maxLogEntries: 100 })),
    setTrackingOptions: vi.fn(),
    enableTracking: vi.fn(),
    disableTracking: vi.fn(),
  } as unknown as HookRegistry;
}

// ============================================
// AgentContext Mock
// ============================================

export interface MockAgentContextOptions {
  /** 当前活跃提供商 */
  activeProvider?: ProviderConfig | null;
  /** 所有提供商列表 */
  providers?: ProviderConfig[];
  /** 技能列表 */
  skills?: Skill[];
  /** 技能匹配结果 */
  skillMatchResult?: SkillMatchResult | null;
  /** Agent 配置 */
  agentConfigs?: Record<string, AgentConfig>;
  /** 会话 ID */
  sessionId?: string;
}

/**
 * 创建完整的 Mock AgentContext
 */
export function createMockAgentContext(options: MockAgentContextOptions = {}): AgentContext {
  const providerManager = createMockProviderManager({
    activeProvider: options.activeProvider,
    providers: options.providers,
  });

  const skillRegistry = createMockSkillRegistry({
    skills: options.skills,
    matchResult: options.skillMatchResult,
  });

  const runner = createMockAgentRunner();
  const agentRegistry = createMockAgentRegistry({
    configs: options.agentConfigs,
  });
  const hookRegistry = createMockHookRegistry(options.sessionId);

  return {
    providerManager,
    skillRegistry,
    runner,
    agentRegistry,
    hookRegistry,

    // 便捷访问器
    getActiveProvider: vi.fn(() => options.activeProvider ?? null),
    getSkill: vi.fn((name: string) =>
      options.skills?.find(s => s.metadata.name.toLowerCase() === name.toLowerCase())
    ),
    matchSkill: vi.fn(() => options.skillMatchResult ?? null),
    getAgentConfig: vi.fn((name: string) => options.agentConfigs?.[name]),
  } as unknown as AgentContext;
}

// ============================================
// 测试数据生成器
// ============================================

/**
 * 创建测试用 Provider 配置
 */
export function createTestProviderConfig(overrides?: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    baseUrl: 'https://api.test.com',
    apiKey: 'test-api-key',
    model: 'test-model',
    type: 'openai-compatible',
    ...overrides,
  };
}

/**
 * 创建测试用 Skill
 */
export function createTestSkill(overrides?: Partial<Skill>): Skill {
  return {
    metadata: {
      name: 'Test Skill',
      description: 'A test skill for testing',
      version: '1.0.0',
      tags: ['test'],
      ...overrides?.metadata,
    },
    body: '# Test Skill\n\nThis is a test skill body.',
    path: '/test/skill/path',
    references: [],
    scripts: [],
    examples: [],
    assets: [],
    ...overrides,
  };
}

/**
 * 创建测试用 Agent 配置
 */
export function createTestAgentConfig(): AgentConfig {
  return {
    type: 'general',
    prompt: 'You are a helpful assistant.',
    model: 'claude-sonnet-4-6',
    tools: ['Read', 'Write', 'Edit'],
    maxTurns: 10,
  };
}
