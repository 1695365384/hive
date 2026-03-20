/**
 * config.ts 测试
 *
 * 测试 providers.json 路径解析逻辑
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { resetConfig, initializeConfig, getConfig } from './config';

describe('config - providers path resolution', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetConfig();
    // 深拷贝环境变量
    process.env = { ...originalEnv };
    delete process.env.AICLAW_PROVIDERS_PATH;
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfig();
  });

  it('should use AICLAW_PROVIDERS_PATH env when set', async () => {
    const customPath = '/custom/path/providers.json';
    process.env.AICLAW_PROVIDERS_PATH = customPath;

    await initializeConfig();
    const config = getConfig();

    expect(config.providersPath).toBe(customPath);
  });

  it('should find providers.json in cwd when env not set', async () => {
    // 模拟开发环境：providers.json 在 cwd
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    const providersPath = path.join(tempDir, 'providers.json');
    fs.writeFileSync(providersPath, '{}');

    const originalCwd = process.cwd();

    try {
      process.chdir(tempDir);
      resetConfig(); // 重置以触发重新计算路径
      await initializeConfig();
      const config = getConfig();

      // 使用 realpath 处理 macOS 符号链接（/var -> /private/var）
      const expectedPath = fs.realpathSync(providersPath);
      expect(fs.realpathSync(config.providersPath)).toBe(expectedPath);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should fallback to ~/.aiclaw/providers.json when not found elsewhere', async () => {
    // 清除环境变量，cwd 中无 providers.json
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'));
    const originalCwd = process.cwd();

    try {
      process.chdir(tempDir);
      resetConfig(); // 重置以触发重新计算路径
      await initializeConfig();
      const config = getConfig();

      const expected = path.join(os.homedir(), '.aiclaw', 'providers.json');
      expect(config.providersPath).toBe(expected);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should prioritize env over cwd providers.json', async () => {
    // 设置环境变量
    const envPath = '/env/path/providers.json';
    process.env.AICLAW_PROVIDERS_PATH = envPath;

    // 在 cwd 中也创建 providers.json
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'priority-test-'));
    const cwdPath = path.join(tempDir, 'providers.json');
    fs.writeFileSync(cwdPath, '{}');

    const originalCwd = process.cwd();

    try {
      process.chdir(tempDir);
      resetConfig();
      await initializeConfig();
      const config = getConfig();

      // 环境变量优先级更高
      expect(config.providersPath).toBe(envPath);
      expect(config.providersPath).not.toBe(cwdPath);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
