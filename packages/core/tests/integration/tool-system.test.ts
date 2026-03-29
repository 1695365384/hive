/**
 * 统一工具系统集成测试
 *
 * 验证 ToolRegistry → 工具分配 → 真实文件系统执行的端到端流程。
 * 不依赖 LLM API，聚焦工具系统本身的集成。
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { _resetAllowedRoots } from '../../src/tools/built-in/utils/security.js';

// Mock child_process.exec（grep 测试用）
vi.mock('node:child_process', () => ({
  exec: vi.fn((cmd: string, opts: any, cb: any) => {
    // 简单模拟：返回匹配的行
    cb(null, 'match-file.ts:1:const result = searchResult;\n', '');
  }),
}));

import { ToolRegistry } from '../../src/tools/tool-registry.js';
import {
  createBashTool,
  createFileTool,
  createGlobTool,
  createGrepTool,
  createWebSearchTool,
  createWebFetchTool,
  createAskUserTool,
} from '../../src/tools/built-in/index.js';

describe('Tool System Integration', () => {
  let tmpDir: string;

  beforeAll(async () => {
    _resetAllowedRoots();
    tmpDir = join(os.tmpdir(), `hive-integration-tools-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'a.ts'), 'const a = 1;');
    await writeFile(join(tmpDir, 'b.ts'), 'const b = 2;');
    await writeFile(join(tmpDir, 'README.md'), '# Test Project');
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    await mkdir(join(tmpDir, 'src', 'utils'), { recursive: true });
    await writeFile(join(tmpDir, 'src', 'index.ts'), 'export { a } from "./a";');
    await writeFile(join(tmpDir, 'src', 'utils', 'helper.ts'), 'export const helper = () => 1;');
    process.env.HIVE_WORKING_DIR = tmpDir;
  });

  afterAll(async () => {
    delete process.env.HIVE_WORKING_DIR;
    _resetAllowedRoots();
    try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
  });

  describe('ToolRegistry 工具分配 → 真实执行', () => {
    it('explore agent: glob 搜索只读文件系统', async () => {
      const registry = new ToolRegistry();
      registry.registerBuiltInTools();
      const tools = registry.getToolsForAgent('explore');
      const globTool = tools['glob']!;

      const result = await globTool.execute!({ pattern: '*.ts', path: tmpDir }, {} as any);
      expect(result).toContain('a.ts');
      expect(result).toContain('b.ts');
      expect(result).not.toContain('README.md');
    });

    it('explore agent: glob ** 递归搜索', async () => {
      const registry = new ToolRegistry();
      registry.registerBuiltInTools();
      const tools = registry.getToolsForAgent('explore');
      const globTool = tools['glob']!;

      const result = await globTool.execute!({ pattern: '**/*.ts', path: tmpDir }, {} as any);
      expect(result).toContain('a.ts');
      expect(result).toContain('b.ts');
      expect(result).toContain('index.ts');
      expect(result).toContain('helper.ts');
    });

    it('explore agent: file 只读查看', async () => {
      const registry = new ToolRegistry();
      registry.registerBuiltInTools();
      const tools = registry.getToolsForAgent('explore');
      const fileTool = tools['file']!;

      const result = await fileTool.execute!({
        command: 'view',
        file_path: join(tmpDir, 'a.ts'),
      }, {} as any);
      expect(result).toContain('const a = 1');
    });

    it('explore agent: file 只读拒绝写入', async () => {
      const registry = new ToolRegistry();
      registry.registerBuiltInTools();
      const tools = registry.getToolsForAgent('explore');
      const fileTool = tools['file']!;

      const result = await fileTool.execute!({
        command: 'create',
        file_path: join(tmpDir, 'evil.ts'),
        content: 'const evil = 1;',
      }, {} as any);
      expect(result).toContain('无权限');
    });

    it('explore agent: 不应有 bash 工具', () => {
      const registry = new ToolRegistry();
      registry.registerBuiltInTools();
      const tools = registry.getToolsForAgent('explore');
      expect(tools['bash']).toBeUndefined();
      expect(tools['ask-user']).toBeUndefined();
    });

    it('general agent: 应有完整工具集', () => {
      const registry = new ToolRegistry();
      registry.registerBuiltInTools();
      const tools = registry.getToolsForAgent('general');

      expect(tools['bash']).toBeDefined();
      expect(tools['file']).toBeDefined();
      expect(tools['glob']).toBeDefined();
      expect(tools['grep']).toBeDefined();
      expect(tools['web-search']).toBeDefined();
      expect(tools['web-fetch']).toBeDefined();
      expect(tools['ask-user']).toBeDefined();
    });

    it('general agent: file 工具应支持写入', async () => {
      const registry = new ToolRegistry();
      registry.registerBuiltInTools();
      const tools = registry.getToolsForAgent('general');
      const fileTool = tools['file']!;

      const newFile = join(tmpDir, 'new-file.ts');
      const result = await fileTool.execute!({
        command: 'create',
        file_path: newFile,
        content: 'export const x = 42;',
      }, {} as any);

      // 不应拒绝
      expect(result).not.toContain('无权限');

      // 验证文件已创建
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(newFile, 'utf-8');
      expect(content).toContain('export const x = 42');
    });

    it('plan agent: 与 explore 相同的只读工具集', () => {
      const registry = new ToolRegistry();
      registry.registerBuiltInTools();

      const exploreTools = Object.keys(registry.getToolsForAgent('explore')).sort();
      const planTools = Object.keys(registry.getToolsForAgent('plan')).sort();

      expect(exploreTools).toEqual(planTools);
    });
  });

  describe('自定义工具 + 内置工具共存', () => {
    it('自定义工具对所有 agent 可见', () => {
      const registry = new ToolRegistry();
      registry.registerBuiltInTools();

      const customTool = {
        description: 'my database query tool',
        inputSchema: { type: 'object' as const },
      } as any;
      registry.register('db-query', customTool);

      const exploreTools = registry.getToolsForAgent('explore');
      const generalTools = registry.getToolsForAgent('general');

      expect(exploreTools['db-query']).toBeDefined();
      expect(generalTools['db-query']).toBeDefined();
    });

    it('内置工具工厂创建的实例应正确工作', async () => {
      const registry = new ToolRegistry();
      registry.registerBuiltInTools();

      // getToolsForAgent 使用工厂创建新实例，不是 getAllTools 的缓存
      const tools = registry.getToolsForAgent('explore');
      const globTool = tools['glob']!;

      const result = await globTool.execute!({ pattern: '*.md', path: tmpDir }, {} as any);
      expect(result).toContain('README.md');
      expect(result).not.toContain('.ts');
    });
  });

  describe('危险命令拦截', () => {
    it('bash 工具应拦截 rm -rf /', async () => {
      const tool = createBashTool({ allowed: true });
      const result = await tool.execute!({ command: 'rm -rf /' }, {} as any);
      expect(result).toContain('[Security]');
      expect(result).toContain('阻止危险命令');
    });

    it('bash 工具应拦截 fork bomb', async () => {
      const tool = createBashTool({ allowed: true });
      const result = await tool.execute!({ command: ':(){ :|:& };:' }, {} as any);
      expect(result).toContain('[Security]');
    });

    it('file 工具应拦截敏感文件写入', async () => {
      const tool = createFileTool({ allowedCommands: ['view', 'create', 'str_replace', 'insert'] });
      const result = await tool.execute!({
        command: 'view',
        file_path: join(tmpDir, '.env'),
      }, {} as any);
      expect(result).toContain('敏感文件');
    });
  });

  describe('ask-user 回调集成', () => {
    it('ToolRegistry 设置回调后 ask-user 工具应使用它', async () => {
      const registry = new ToolRegistry();
      registry.registerBuiltInTools();

      let callbackCalled = false;
      registry.setAskUserCallback(async () => {
        callbackCalled = true;
        return 'user response';
      });

      const tools = registry.getToolsForAgent('general');
      const askUser = tools['ask-user']!;

      const result = await askUser.execute!({ question: 'Continue?' }, {} as any);
      expect(callbackCalled).toBe(true);
      expect(result).toContain('user response');
    });
  });
});
