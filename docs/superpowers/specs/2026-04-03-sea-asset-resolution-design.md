# SEA 资源路径解析统一方案

## 背景

Hive 使用 Node.js SEA 打包为单文件二进制（`hive-server`）。esbuild 将 TypeScript 编译为 CJS bundle，使用 `--define:import.meta.url=undefined` 导致 `import.meta.url` 在 SEA 环境中不可用。

当前项目中有 **2 处** 独立的 SEA 路径回退逻辑，模式相似但各自为战：

| 文件 | ESM 路径 | SEA 回退方式 |
|------|---------|-------------|
| `PromptTemplate.ts` | `import.meta.url` → `fileURLToPath` | `process.argv[1]` |
| `agent-tool.ts` | `import.meta.url` → `new URL()` | `__dirname` + `existsSync` 候选探测 |

每新增一个需要读文件的功能，都要写一套 try/catch + fallback，不可维护。

## 方案

**C: 统一路径解析工具函数 + `isSea()` 环境检测**

提取 `resolveAsset()` 工具函数，用 `sea.isSea()` 替代 `import.meta.url` try/catch 检测环境，统一所有 SEA 路径解析逻辑。

**A: `sea.getAsset()` 嵌入 prompt 模板**

将 `.md` 模板文件通过 `sea-config.json` 的 `assets` 字段嵌入 SEA blob，运行时通过 `getAsset()` 从内存读取，消除文件复制步骤。

Worker 入口文件因 `new Worker(path)` 必须需要磁盘路径，保持当前的复制策略。

## 设计

### 1. 新增 `packages/core/src/utils/sea-path.ts`

```typescript
import { isSea, getAsset } from 'node:sea';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * SEA 感知的资源路径解析
 *
 * - ESM 开发环境：基于 import.meta.url
 * - SEA 生产环境：基于 __dirname（指向 binary 所在目录）
 *
 * @param esmRelative  相对于当前文件的路径（ESM 环境使用）
 * @param seaRelative  相对于 SEA binary 目录的路径（SEA 环境使用）
 */
export function resolveAsset(esmRelative: string, seaRelative: string): string {
  if (isSea()) {
    return resolve(__dirname, seaRelative);
  }
  return fileURLToPath(new URL(esmRelative, import.meta.url));
}

/**
 * 从 SEA asset 或文件系统加载文本内容
 *
 * - SEA 环境：从嵌入的 blob 读取（零磁盘 I/O）
 * - 开发环境：从文件系统读取
 *
 * @param assetKey    SEA asset key（如 'coordinator.md'）
 * @param fsPath      文件系统回退路径（开发环境使用）
 */
export function readAssetText(assetKey: string, fsPath: string): string {
  if (isSea()) {
    return getAsset(assetKey, 'utf8');
  }
  const { readFileSync } = require('node:fs');
  return readFileSync(fsPath, 'utf-8');
}

export { isSea };
```

### 2. 重构 `PromptTemplate.ts`

替换手动 try/catch + `process.argv[1]` 回退：

```typescript
import { resolveAsset, readAssetText } from '../../utils/sea-path.js';

function getTemplatesDir(): string {
  return resolveAsset('../prompts/templates', 'agents/prompts/templates');
}

export class PromptTemplate {
  load(name: string): string {
    if (this.cache.has(name)) return this.cache.get(name)!;

    const templateKey = `${name}.md`;
    const fsPath = path.join(TEMPLATES_DIR, templateKey);

    let content: string;
    try {
      content = readAssetText(templateKey, fsPath);
    } catch {
      throw new Error(`Prompt template not found: ${name}`);
    }

    this.cache.set(name, content);
    return content;
  }
}
```

### 3. 重构 `agent-tool.ts` 的 `resolveWorkerEntryPath()`

替换 existsSync 候选探测：

```typescript
import { resolveAsset, isSea } from '../../utils/sea-path.js';

function resolveWorkerEntryPath(): string {
  if (_cachedWorkerPath) return _cachedWorkerPath;
  _cachedWorkerPath = resolveAsset(
    '../../workers/worker-entry.js',
    'dist/workers/worker-entry.js',
  );
  return _cachedWorkerPath;
}
```

### 4. 更新 `bundle.sh` — Step 2.5 添加 `assets` 配置

```bash
# Step 2.5: 收集 prompt 模板为 sea-config assets
echo "[sea] Step 2.5: Preparing assets..."
CORE_DIST="$SERVER_ROOT/../../packages/core/dist"
TEMPLATES_DIR="$CORE_DIST/agents/prompts/templates"

# 构建 assets JSON（动态收集 .md 文件）
ASSETS_JSON="{"
for f in "$TEMPLATES_DIR"/*.md; do
  [ -f "$f" ] || continue
  key=$(basename "$f")
  ASSETS_JSON+="\"$key\":\"$f\","
done
ASSETS_JSON="${ASSETS_JSON%,}}"

# 复制 worker-entry.js（Worker 线程仍需磁盘文件）
mkdir -p "$OUT_DIR/dist/workers"
if [ -f "$CORE_DIST/workers/worker-entry.js" ]; then
  cp "$CORE_DIST/workers/worker-entry.js" "$OUT_DIR/dist/workers/worker-entry.js"
fi
```

### 5. 更新 `sea-config.json` — 注入 `assets`

```bash
# Step 4 中构建 sea-config.json 时注入 assets
cat > "$OUT_DIR/sea-config.json" << EOF
{
  "main": "sea-main.cjs",
  "output": "sea-prep.blob",
  "disableExperimentalSEAWarning": true,
  "useCodeCache": true,
  "assets": $ASSETS_JSON
}
EOF
```

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/core/src/utils/sea-path.ts` | **新建** | 统一路径解析工具 |
| `packages/core/src/agents/prompts/PromptTemplate.ts` | 修改 | 使用 `resolveAsset()` + `readAssetText()` |
| `packages/core/src/tools/built-in/agent-tool.ts` | 修改 | 使用 `resolveAsset()`，删除 existsSync 逻辑 |
| `apps/server/scripts/bundle.sh` | 修改 | 动态生成 assets JSON，嵌入 prompt 模板 |

## 不做的事

- **不** 将 worker-entry.js 嵌入 SEA asset（`new Worker(path)` 需要磁盘路径）
- **不** 改变 `better-sqlite3` 的处理方式（native addon 需要磁盘文件）
- **不** 升级到 `--build-sea`（当前 Node.js 22，该特性需要 Node.js 25.5+）
- **不** 引入 `@platformatic/vfs` 等第三方依赖

## 验证

```bash
# 1. 构建
pnpm -r build

# 2. 单元测试
pnpm test

# 3. SEA 打包
bash apps/server/scripts/bundle.sh
# 验证：输出中应包含 assets 信息

# 4. 启动 desktop 验证
cd apps/desktop && pnpm dev
# 验证：prompt 模板正常加载
# 验证：Worker 线程正常 spawn
```

## 限制

- `sea.getAsset()` 嵌入的文件只读，不能热更新
- `sea.isSea()` 需要 Node.js 20.12+
- Worker 入口文件仍需手动复制到 bundle 目录
