/**
 * Provider 连接测试
 *
 * 测试提供商配置和 API 连接
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getTestProvider,
  getAllTestProviders,
  setupRealAgent,
  type RealAgentContext,
  E2E_TIMEOUT,
} from './test-helpers.js';
import { createProviderManager } from '../../src/providers/index.js';

// ============================================
// Provider 连接测试
// ============================================

describe('Provider Real Connection Tests', () => {
  describe('Configuration', () => {
    it('should load provider configuration', () => {
      const provider = getTestProvider();

      if (provider) {
        expect(provider.id).toBeDefined();
        expect(provider.apiKey).toBeTruthy();
        expect(provider.baseUrl).toBeDefined();
        console.log(`✅ 使用提供商: ${provider.name} (${provider.id})`);
      } else {
        console.log('⚠️  未找到有效的提供商配置');
      }
    });

    it('should list all configured providers', () => {
      const providers = getAllTestProviders();

      console.log(`📋 发现 ${providers.length} 个配置的提供商:`);
      providers.forEach(p => {
        const maskedKey = p.apiKey.slice(0, 8) + '...' + p.apiKey.slice(-4);
        console.log(`   - ${p.name} (${p.id}): ${p.baseUrl} [${maskedKey}]`);
      });

      expect(Array.isArray(providers)).toBe(true);
    });

    it('should initialize ProviderManager', () => {
      const manager = createProviderManager();

      const allProviders = manager.all;
      console.log(`📦 ProviderManager 加载了 ${allProviders.length} 个提供商`);

      const activeProvider = manager.active;
      if (activeProvider) {
        console.log(`🟢 当前活跃提供商: ${activeProvider.name || activeProvider.id}`);
      }

      expect(manager).toBeDefined();
    });
  });

  describe('Provider Switching', () => {
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

    it('should switch provider successfully', async () => {
      if (!ctx) return;

      const provider = ctx.agent.currentProvider;
      expect(provider).toBeDefined();
      expect(provider?.id).toBe(ctx.provider.id);
    });

    it('should list available presets', async () => {
      if (!ctx) return;

      const presets = ctx.agent.listPresets();
      expect(Array.isArray(presets)).toBe(true);

      console.log('📋 可用的提供商预设:');
      presets.forEach(p => {
        console.log(`   - ${p.name} (${p.id}): ${p.type}`);
      });
    });
  });
});

// ============================================
// 每个提供商的单独测试
// ============================================

const providers = getAllTestProviders();

if (providers.length > 0) {
  describe('Individual Provider Tests', () => {
    for (const provider of providers) {
      describe(`${provider.name} (${provider.id})`, () => {
        let ctx: RealAgentContext | null = null;

        beforeEach(async () => {
          // 为每个提供商创建独立的 Agent
          const { createAgent } = await import('../../src/index.js');
          const agent = createAgent();
          await agent.initialize();

          const success = agent.useProvider(provider.id, provider.apiKey);
          if (!success) {
            console.warn(`无法切换到提供商 ${provider.id}`);
            ctx = null;
            return;
          }

          ctx = {
            agent,
            provider,
            cleanup: async () => {
              await agent.dispose();
            },
          };
        });

        afterEach(async () => {
          if (ctx) {
            await ctx.cleanup();
            ctx = null;
          }
        });

        it('should respond to ping', async () => {
          if (!ctx) return;

          try {
            const response = (await ctx.agent.dispatch('回复 OK')).text;
            expect(response).toBeDefined();
            console.log(`✅ ${provider.name} 响应正常`);
          } catch (error) {
            console.error(`❌ ${provider.name} 连接失败:`, error);
            throw error;
          }
        }, E2E_TIMEOUT.MEDIUM);

      });
    }
  });
}
