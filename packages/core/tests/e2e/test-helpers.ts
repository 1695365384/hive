/**
 * E2E 测试辅助函数
 *
 * 用于真实 API 调用测试，从 providers.json 或环境变量读取配置
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { Agent, createAgent } from '../../src/index.js';

// ============================================
// 类型定义
// ============================================

export interface TestProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface ProvidersConfig {
  default?: string;
  providers: Record<string, {
    name: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    models?: string[];
    enabled?: boolean;
  }>;
}

// ============================================
// 配置获取
// ============================================

/**
 * 获取测试用提供商配置
 *
 * 优先级：环境变量 > providers.json
 */
export function getTestProvider(): TestProvider | null {
  // 1. 优先使用环境变量（CI 环境）
  if (process.env.TEST_API_KEY) {
    return {
      id: process.env.TEST_PROVIDER_ID || 'test',
      name: process.env.TEST_PROVIDER_NAME || 'Test Provider',
      baseUrl: process.env.TEST_BASE_URL || 'https://api.anthropic.com',
      apiKey: process.env.TEST_API_KEY,
      model: process.env.TEST_MODEL || 'claude-sonnet-4-6',
    };
  }

  // 2. 尝试读取 providers.json
  const configPath = join(process.cwd(), 'providers.json');
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const configContent = readFileSync(configPath, 'utf-8');
    const config: ProvidersConfig = JSON.parse(configContent);

    // 获取默认提供商或第一个
    const defaultId = config.default || Object.keys(config.providers)[0];
    if (!defaultId) return null;

    const provider = config.providers[defaultId];
    if (!provider?.apiKey) return null;

    return {
      id: defaultId,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
    };
  } catch {
    return null;
  }
}

/**
 * 获取所有可用的测试提供商
 */
export function getAllTestProviders(): TestProvider[] {
  const providers: TestProvider[] = [];

  // 从 providers.json 读取
  const configPath = join(process.cwd(), 'providers.json');
  if (!existsSync(configPath)) {
    return providers;
  }

  try {
    const configContent = readFileSync(configPath, 'utf-8');
    const config: ProvidersConfig = JSON.parse(configContent);

    for (const [id, provider] of Object.entries(config.providers)) {
      if (provider.apiKey && provider.enabled !== false) {
        providers.push({
          id,
          name: provider.name,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: provider.model,
        });
      }
    }
  } catch {
    // ignore
  }

  return providers;
}

// ============================================
// 条件测试
// ============================================

/**
 * 条件跳过：没有 API Key 时跳过整个测试套件
 *
 * @example
 * describeIfApiKey('Agent Real API Tests', () => {
 *   it('should respond', async () => { ... });
 * });
 */
export function describeIfApiKey(name: string, fn: () => void): void {
  const provider = getTestProvider();
  if (provider) {
    describe(name, fn);
  } else {
    describe.skip(`${name} (skipped: no API key configured)`, fn);
  }
}

/**
 * 条件跳过：当满足条件时才运行测试
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function itIf(condition: boolean): any {
  return condition ? it : it.skip;
}

// ============================================
// Agent 创建
// ============================================

/**
 * 创建真实 Agent 实例
 *
 * @returns Agent 实例和提供商信息，如果没有配置则返回 null
 */
export async function createRealAgent(): Promise<{ agent: Agent; provider: TestProvider } | null> {
  const provider = getTestProvider();
  if (!provider) return null;

  const agent = createAgent();
  await agent.initialize();

  // 切换到测试提供商
  const success = agent.useProvider(provider.id, provider.apiKey);
  if (!success) {
    // 如果切换失败，尝试直接注册
    // 这适用于 providers.json 中没有的提供商
    await agent.dispose();
    return null;
  }

  return { agent, provider };
}

/**
 * 创建用于测试的 Agent 上下文
 */
export interface RealAgentContext {
  agent: Agent;
  provider: TestProvider;
  cleanup: () => Promise<void>;
}

/**
 * 设置测试 Agent（自动清理）
 */
export async function setupRealAgent(): Promise<RealAgentContext | null> {
  const result = await createRealAgent();
  if (!result) return null;

  return {
    ...result,
    cleanup: async () => {
      await result.agent.dispose();
    },
  };
}

// ============================================
// 断言辅助
// ============================================

/**
 * 宽松的响应验证
 *
 * LLM 响应内容不固定，使用宽松的匹配
 */
export function assertValidResponse(response: string, minLength = 1): void {
  expect(response).toBeDefined();
  expect(typeof response).toBe('string');
  expect(response.length).toBeGreaterThanOrEqual(minLength);
}

/**
 * 验证响应包含预期内容（宽松匹配）
 */
export function assertResponseContains(response: string, expected: string | string[]): void {
  const expectedArray = Array.isArray(expected) ? expected : [expected];
  const lowerResponse = response.toLowerCase();

  const found = expectedArray.some(e => lowerResponse.includes(e.toLowerCase()));
  expect(found).toBe(true);
}

// ============================================
// 超时配置
// ============================================

/**
 * 默认 E2E 测试超时时间（毫秒）
 */
export const E2E_TIMEOUT = {
  SHORT: 15000,    // 15 秒 - 简单查询
  MEDIUM: 30000,   // 30 秒 - 普通对话
  LONG: 60000,     // 60 秒 - 复杂任务
  VERY_LONG: 120000, // 2 分钟 - 非常复杂的任务
};
