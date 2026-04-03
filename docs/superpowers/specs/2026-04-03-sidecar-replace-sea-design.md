# 去掉 SEA，改用 Node.js 二进制 Sidecar

## 背景

当前 Hive Desktop 使用 Node.js SEA (Single Executable Application) 将 server 打包为单个二进制。SEA 导致了 `import.meta.url` 失效、Worker 线程需要特殊处理、native addon 需要 shim 等 6 个 workaround。

实际上 Hive 的 `lib.rs` 已经在用 sidecar 模式（`tokio::process::Command` spawn 子进程），只是子进程是 SEA binary。将其替换为 Node.js 二进制 + JS 文件即可消除所有 SEA 兼容性问题。

## 方案

保持当前 `tokio::process::Command` 的 spawn 方式，只把 SEA binary 换成 Node.js 二进制 + JS bundle 文件。

## 设计

### 1. 新的 server 分发结构

```
Hive.app/Contents/
├── MacOS/
│   └── node-aarch64-apple-darwin      # Node.js 二进制（作为 sidecar）
└── Resources/
    └── server/
        ├── main.js                     # esbuild 产物（CJS）
        ├── node_modules/
        │   └── better-sqlite3/         # native addon（直接 require）
        └── dist/
            ├── agents/prompts/templates/  # prompt 模板（直接 fs 读取）
            └── workers/
                └── worker-entry.js       # Worker 线程脚本（直接 new Worker）
```

### 2. 删除的文件

| 文件 | 原因 |
|------|------|
| `apps/server/scripts/sea-main.cjs` | 不再需要 createRequire patch |
| `packages/core/src/utils/sea-path.ts` | 不再需要 isSea/resolveAsset/readAssetText |

### 3. 恢复为标准 Node.js 写法的文件

**`packages/core/src/agents/prompts/PromptTemplate.ts`**

恢复为标准 ESM 写法：
```typescript
const __filename = fileURLToPath(import.meta.url);
const TEMPLATES_DIR = path.join(path.dirname(__filename), 'templates');
```

**`packages/core/src/tools/built-in/agent-tool.ts`**

恢复为标准 ESM 写法：
```typescript
const workerPath = fileURLToPath(new URL('../../workers/worker-entry.js', import.meta.url));
```

### 4. 修改的文件

**`apps/server/scripts/bundle.sh`**

- 去掉 Step 4（SEA blob 生成 + postject 注入）
- Step 1 保持不变（esbuild bundle）
- Step 2 保持不变（复制 better-sqlite3）
- Step 2.5 改为：复制 prompt 模板 + worker-entry.js（不再是 SEA assets）
- 新增 Step：下载 Node.js 二进制（单架构，与当前下载逻辑复用）

**`apps/desktop/src-tauri/src/lib.rs`**

- `spawn_server()` 中 `spawn_info.program` 从 `hive-server` 改为 `node`
- `spawn_info.args` 从 `[]` 改为 `["Resources/server/main.js"]`
- 开发模式：`program` 改为 `node`，`args` 改为 `["apps/server/dist/main.js"]`

**`apps/desktop/src-tauri/tauri.conf.json`**

- `resources` 保持 `../../server/bundle` → `server`
- 不需要 `externalBin`（Node.js 二进制也作为 resource 打包）

### 5. 不改的文件

- `lib.rs` 中的 `watch_server()`、`health_check()`、`kill_port_processes()` 等生命周期管理 — 完全保留
- 前端 WebSocket 通信代码 — 完全不变
- `apps/server/src/` 下所有 server 业务代码 — 完全不变
- Worker 线程逻辑（`worker-entry.ts`、`TaskManager.ts`、`agent-tool.ts` 的 Worker 管理部分）— 不变

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `apps/server/scripts/sea-main.cjs` | **删除** | 不再需要 |
| `packages/core/src/utils/sea-path.ts` | **删除** | 不再需要 |
| `packages/core/src/agents/prompts/PromptTemplate.ts` | 修改 | 恢复标准 import.meta.url |
| `packages/core/src/tools/built-in/agent-tool.ts` | 修改 | 恢复标准 import.meta.url |
| `apps/server/scripts/bundle.sh` | 修改 | 去掉 SEA，下载 Node.js 二进制 |
| `apps/desktop/src-tauri/src/lib.rs` | 修改 | spawn 参数微调 |

## 验证

```bash
# 1. 构建
pnpm -r build

# 2. 全量测试
pnpm test

# 3. SEA bundle 构建验证（bundle.sh 输出应为 JS 文件，无 SEA binary）
bash apps/server/scripts/bundle.sh

# 4. 启动 desktop 验证
cd apps/desktop && pnpm dev
# 验证：prompt 模板正常加载
# 验证：Worker 线程正常 spawn
# 验证：流式事件正常
```

## 风险

- **Node.js 版本锁定**：打包的 Node.js 二进制版本需要与开发环境一致
- **体积**：从 108MB 降到 ~70MB，仍是合理范围
- **macOS 签名**：Node.js 官方二进制已签名，无需额外处理
