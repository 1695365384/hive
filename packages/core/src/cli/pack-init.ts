/**
 * hive-pack init — 生成 Vertical Pack 骨架
 *
 * 生成的目录结构：
 *   <pack-name>/
 *   ├── src/
 *   │   └── index.ts        # Pack 入口（实现 VerticalPack 接口）
 *   ├── skills/
 *   │   └── README.md       # 放 SKILL.md 文件的目录
 *   ├── tools/
 *   │   └── example.ts      # 示例工具
 *   ├── package.json
 *   ├── tsconfig.json
 *   └── README.md
 *
 * 生成后开发者只需：
 *   1. cd <pack-name>
 *   2. pnpm install  (或 npm install)
 *   3. 编辑 src/index.ts 填业务逻辑
 *   4. 在 Hive Agent 中 use(new YourPack())
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { InitArgs } from './pack-cli.js';

// ============================================
// 文件模板
// ============================================

function pascalCase(name: string): string {
  return name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function packageJsonTpl(args: InitArgs): string {
  const className = pascalCase(args.name);
  return JSON.stringify(
    {
      name: `@hive-pack/${args.name}`,
      version: '0.1.0',
      description: args.description || `${args.name} vertical pack for Hive`,
      type: 'module',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      scripts: {
        build: 'tsc',
        dev: 'tsc --watch',
        test: 'vitest',
      },
      peerDependencies: {
        '@bundy-lmw/hive-core': '^1.0.0',
      },
      devDependencies: {
        '@bundy-lmw/hive-core': 'workspace:*',
        typescript: '^5.3.0',
      },
      hive: {
        type: 'vertical-pack',
        class: className,
      },
    },
    null,
    2,
  );
}

function tsconfigTpl(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        lib: ['ES2022'],
        outDir: './dist',
        rootDir: './src',
        declaration: true,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist', '**/*.test.ts'],
    },
    null,
    2,
  );
}

function indexTsTpl(args: InitArgs): string {
  const className = pascalCase(args.name);
  return `/**
 * ${args.name} — Vertical Pack for Hive
 *
 * ${args.description || `${args.name} 垂直场景扩展包`}
 *
 * 用法：
 * \`\`\`typescript
 * import { Agent } from '@bundy-lmw/hive-core';
 * import { ${className} } from '@hive-pack/${args.name}';
 *
 * const agent = new Agent();
 * agent.use(new ${className}());
 * await agent.initialize();
 * \`\`\`
 */

import type { VerticalPack } from '@bundy-lmw/hive-core';
import { createExampleTool } from './tools/example.js';

/**
 * ${className} — ${args.description || args.name}
 *
 * 这个 pack 实现了 VerticalPack 接口。按需取消注释你要用的扩展点，
 * 删掉不需要的部分。至少要保留一个扩展点。
 */
export class ${className} implements VerticalPack {
  readonly id = '${args.name}';
  readonly name = '${args.description || args.name}';
  readonly version = '0.1.0';
  readonly dependencies: string[] = [];

  // ── 1. 领域工具 ──
  // 自定义工具会自动对所有 agent 可见
  tools = [
    { name: 'example-query', tool: createExampleTool() },
  ];

  // ── 2. 领域 SubAgent（可选） ──
  // 取消注释来定义一个专属角色。声明的 tools 白名单会被严格尊重。
  // agents = [
  //   {
  //     name: '${args.name}-agent',
  //     config: {
  //       type: 'custom' as const,
  //       description: '${args.description || args.name} 专属 agent',
  //       tools: ['file', 'glob', 'grep', 'example-query'],
  //       maxTurns: 10,
  //     },
  //   },
  // ];

  // ── 3. 领域技能（可选） ──
  // 在 skills/ 目录放 SKILL.md（带 YAML frontmatter），然后在这里加载：
  // skills = [
  //   { skill: await loadSkill('./skills/my-skill/SKILL.md') },
  // ];

  // ── 4. 领域 Capability（可选） ──
  // 有状态服务（知识库、向量检索、外部连接）实现 AgentCapability：
  // capabilities = [new MyKnowledgeBase({ dbPath: './kb' })];

  // ── 5. 生命周期 Hook（可选） ──
  // 审计、合规拦截、数据脱敏：
  // hooks = [
  //   {
  //     event: 'tool:before',
  //     handler: async (ctx) => {
  //       console.log('[${args.name}] tool call:', ctx.toolName);
  //       return { proceed: true };
  //     },
  //     options: { priority: 'normal' as const },
  //   },
  // ];

  // ── 6. Pack 初始化（可选） ──
  // 所有扩展点注册后、Agent 启动前调用
  async setup({ agent, context }) {
    // 连接外部服务、预热缓存、校验配置等
    console.log('[${className}] 已就绪');
  }

  // ── 7. Pack 销毁（可选） ──
  async dispose() {
    // 清理资源、断开连接
  }
}

/**
 * 默认导出，方便 use() 时简写
 */
export default ${className};
`;
}

function exampleToolTpl(args: InitArgs): string {
  return `/**
 * 示例工具 — ${args.name}
 *
 * 替换成你的领域工具。工具是标准的 AI SDK Tool 格式。
 */

import { tool } from 'ai';
import { z } from 'zod';

/**
 * 创建示例工具
 *
 * 这个工具只是演示格式。替换成你真实的领域逻辑。
 */
export function createExampleTool() {
  return tool({
    description: [
      '示例工具 — 查询 ${args.name} 相关信息。',
      '替换成你的真实领域工具描述。',
    ].join('\\n'),
    inputSchema: z.object({
      query: z.string().describe('查询内容'),
    }),
    execute: async ({ query }) => {
      // TODO: 替换成真实的领域查询逻辑
      return \`示例查询结果: \${query}\\n（这是一个占位工具，请在 src/tools/example.ts 替换为真实逻辑）\`;
    },
  });
}
`;
}

function readmeTpl(args: InitArgs): string {
  const className = pascalCase(args.name);
  return `# ${args.name}

${args.description || `${args.name} vertical pack for Hive`}

## 安装

\`\`\`bash
npm install @hive-pack/${args.name}
# 或在 monorepo 中
pnpm add @hive-pack/${args.name} --workspace
\`\`\`

## 使用

\`\`\`typescript
import { Agent } from '@bundy-lmw/hive-core';
import { ${className} } from '@hive-pack/${args.name}';

const agent = new Agent();
agent.use(new ${className}());
await agent.initialize();

await agent.dispatch('你的任务描述');
\`\`\`

## 结构

\`\`\`
${args.name}/
├── src/
│   └── index.ts        # Pack 入口
├── tools/
│   └── example.ts      # 示例工具（替换为你的领域工具）
├── skills/             # 放 SKILL.md 知识文件
├── package.json
└── tsconfig.json
\`\`\`

## 开发

\`\`\`bash
pnpm install
pnpm dev          # watch 模式编译
pnpm build        # 编译到 dist/
\`\`\`

## 扩展点

这个 pack 支持以下扩展点（编辑 \`src/index.ts\` 按需启用）：

| 扩展点 | 字段 | 用途 |
|:-------|:-----|:-----|
| Tool | \`tools\` | 领域 API 调用、数据库查询 |
| SubAgent | \`agents\` | 领域专属角色（带工具白名单） |
| Skill | \`skills\` | 领域知识、prompt 模板 |
| Capability | \`capabilities\` | 有状态服务（知识库、向量检索） |
| Hook | \`hooks\` | 审计、合规、数据脱敏 |

详见 [Hive Vertical Pack 文档](https://github.com/1695365384/hive#vertical-pack)。
`;
}

function skillsReadmeTpl(): string {
  return `# Skills 目录

把领域知识技能放在这里。每个技能是一个 \`SKILL.md\` 文件，带 YAML frontmatter：

\`\`\`markdown
---
name: my-skill
description: 技能描述（包含触发短语）
version: 1.0.0
---

# 技能内容

这里写领域知识、操作流程、最佳实践。Agent 会根据用户输入匹配技能并注入这段内容。
\`\`\`

然后在 \`src/index.ts\` 的 \`skills\` 字段加载。
`;
}

// ============================================
// init 命令实现
// ============================================

export async function runInit(args: InitArgs): Promise<void> {
  const { name, dir, description } = args;

  console.log(`\n📦 创建 Vertical Pack: ${name}`);
  console.log(`   目录: ${dir}\n`);

  // 创建目录结构
  const dirs = ['src', 'src/tools', 'skills'];
  for (const d of dirs) {
    await mkdir(join(dir!, d), { recursive: true });
  }

  // 写入文件
  const files: Array<[string, string]> = [
    ['package.json', packageJsonTpl(args)],
    ['tsconfig.json', tsconfigTpl()],
    ['src/index.ts', indexTsTpl(args)],
    ['src/tools/example.ts', exampleToolTpl(args)],
    ['README.md', readmeTpl(args)],
    ['skills/README.md', skillsReadmeTpl()],
  ];

  for (const [relPath, content] of files) {
    const fullPath = join(dir!, relPath);
    await writeFile(fullPath, content, 'utf-8');
    console.log(`   ✓ ${relPath}`);
  }

  console.log(`\n✅ Pack 骨架已生成: ${dir}`);
  console.log(`\n下一步：`);
  console.log(`   cd ${name}`);
  console.log(`   pnpm install  (或 npm install)`);
  console.log(`   # 编辑 src/index.ts 填业务逻辑`);
  console.log(`   pnpm build`);
  console.log(`   hive-pack validate  # 校验\n`);
}
