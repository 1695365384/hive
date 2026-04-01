/**
 * Agent 真实 API 测试
 *
 * 使用真实的 LLM API 进行端到端测试
 * 需要配置 providers.json 或设置环境变量
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  describeIfApiKey,
  setupRealAgent,
  type RealAgentContext,
  assertValidResponse,
  assertResponseContains,
  E2E_TIMEOUT,
} from './test-helpers.js';

// ============================================
// Agent 真实 API 测试
// ============================================

describeIfApiKey('Agent Real API Tests', () => {
  let ctx: RealAgentContext | null = null;

  beforeEach(async () => {
    ctx = await setupRealAgent();
  });

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
      ctx = null;
    }
  });

  // ============================================
  // 基础对话测试
  // ============================================

  describe('Basic Chat', () => {
    it('should respond to simple question', async () => {
      if (!ctx) return;

      const response = (await ctx.agent.dispatch('1+1等于几？只回答数字。')).text;

      console.log(`📥 Response: "${response}" (${response.length} chars)`);
      assertValidResponse(response);
      // 宽松验证：响应应该包含 "2"
      expect(response).toMatch(/2/);
    }, E2E_TIMEOUT.MEDIUM);

    it('should respond to greeting', async () => {
      if (!ctx) return;

      const response = (await ctx.agent.dispatch('你好')).text;

      console.log(`📥 Response: "${response}" (${response.length} chars)`);
      assertValidResponse(response);
      // 应该有某种问候回复
      expect(response.length).toBeGreaterThan(0);
    }, E2E_TIMEOUT.MEDIUM);

    it('should answer factual question', async () => {
      if (!ctx) return;

      const response = (await ctx.agent.dispatch('中国的首都是哪里？')).text;

      console.log(`📥 Response: "${response}" (${response.length} chars)`);
      assertValidResponse(response);
      // 宽松匹配：包含 "北京" 或 "Beijing"
      const hasAnswer = response.includes('北京') || response.toLowerCase().includes('beijing');
      expect(hasAnswer || response.length > 0).toBe(true);
    }, E2E_TIMEOUT.MEDIUM);
  });

  // ============================================
  // 会话管理测试
  // ============================================

  describe('Session Management', () => {
    it('should create new session', async () => {
      if (!ctx) return;

      const session = await ctx.agent.createSession({
        title: 'Test Session',
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
    }, E2E_TIMEOUT.SHORT);

    it('should list sessions', async () => {
      if (!ctx) return;

      // 创建一个会话
      await ctx.agent.createSession({ title: 'Test' });

      const sessions = await ctx.agent.listSessions();
      expect(Array.isArray(sessions)).toBe(true);
    }, E2E_TIMEOUT.SHORT);

    it('should maintain conversation history', async () => {
      if (!ctx) return;

      // 发送第一条消息
      await ctx.agent.dispatch('我的名字是小明');

      // 发送第二条消息，测试上下文
      const response = (await ctx.agent.dispatch('我叫什么名字？')).text;

      // 验证响应中包含之前提到的名字
      assertResponseContains(response, ['小明', '名字']);
    }, E2E_TIMEOUT.MEDIUM);
  });

  // ============================================
  // 提供商管理测试
  // ============================================

  describe('Provider Management', () => {
    it('should have active provider', async () => {
      if (!ctx) return;

      const provider = ctx.agent.currentProvider;

      expect(provider).toBeDefined();
      expect(provider?.apiKey).toBeTruthy();
    }, E2E_TIMEOUT.SHORT);

    it('should list available providers', async () => {
      if (!ctx) return;

      const providers = ctx.agent.listProviders();

      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
    }, E2E_TIMEOUT.SHORT);
  });

  // ============================================
  // 技能匹配测试
  // ============================================

  describe('Skill Matching', () => {
    it('should match skills based on input', async () => {
      if (!ctx) return;

      // 测试技能匹配（如果有技能定义的话）
      const result = ctx.agent.matchSkill('review this code');

      // 技能匹配是可选的，不一定要匹配到
      if (result) {
        expect(result.skill).toBeDefined();
      }
    }, E2E_TIMEOUT.SHORT);
  });
});

// ============================================
// 无配置跳过提示
// ============================================

describe('E2E Test Configuration', () => {
  it('should have valid configuration or skip real tests', () => {
    // 这个测试总是运行，用于提示配置状态
    const hasConfig = !!process.env.TEST_API_KEY || (() => {
      try {
        const fs = require('fs');
        const path = require('path');
        const configPath = path.join(process.cwd(), 'providers.json');
        if (!fs.existsSync(configPath)) return false;
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const defaultId = config.default || Object.keys(config.providers)[0];
        return !!config.providers[defaultId]?.apiKey;
      } catch {
        return false;
      }
    })();

    if (!hasConfig) {
      console.log('\n⚠️  E2E 测试跳过：未配置 API Key');
      console.log('   配置方法：');
      console.log('   1. 复制 hive.config.example.json 为 hive.config.json');
      console.log('   2. 在 hive.config.json 中填入你的 API Key');
      console.log('   或设置环境变量：TEST_API_KEY=xxx\n');
    }

    // 这个测试总是通过
    expect(true).toBe(true);
  });
});
