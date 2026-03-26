import { defineConfig } from 'vitest/config';

/**
 * E2E 测试配置
 *
 * 与单元测试不同：
 * - 不使用 setup.ts 中的全局 mock
 * - 更长的超时时间
 * - 使用真实的 API 调用
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    exclude: ['tests/unit/**', 'tests/integration/**'],

    // 不使用 setup.ts，避免全局 mock
    setupFiles: [],

    // 更长的超时时间（真实 API 调用需要）
    testTimeout: 60000,
    hookTimeout: 30000,

    // 串行执行（避免 API 限流）
    fileParallelism: false,

    // 重试配置
    retry: 1,
  },
});
