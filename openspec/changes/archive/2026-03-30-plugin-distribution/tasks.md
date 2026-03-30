## 1. 基础设施

- [x] 1.1 在 `apps/server/src/` 下创建 `plugin-manager/` 目录结构（index.ts、searcher.ts、installer.ts、registry.ts、cli.ts、types.ts）
- [x] 1.2 添加 `commander` 依赖到 `apps/server/package.json`
- [x] 1.3 定义 `plugin-manager/types.ts` — PluginSource、InstallResult、RegistryEntry 等类型

## 2. 注册表（Registry）

- [x] 2.1 实现 `registry.ts` — `.registry.json` 的读写（load/save/add/remove）
- [x] 2.2 处理注册表不存在时自动创建、JSON 损坏时优雅降级
- [x] 2.3 编写 registry 单元测试

## 3. 搜索器（Searcher）

- [x] 3.1 实现 `searcher.ts` — 调用 npm Registry Search API，参数 `scope:hive-plugin`
- [x] 3.2 实现搜索结果格式化（表格输出：名称、版本、描述、安装命令）
- [x] 3.3 处理网络错误和空结果
- [x] 3.4 编写 searcher 单元测试（mock fetch）

## 4. 安装器（Installer）

- [x] 4.1 实现来源类型自动识别（npm scope / Git URL / 本地路径）
- [x] 4.2 实现 npm 包安装 — `npm install --prefix .hive/plugins/<name>`
- [x] 4.3 实现安装后验证（检查 package.json 的 `hive.plugin` 字段）
- [x] 4.4 实现安装后写入 `.registry.json` 和 `hive.config.json`
- [x] 4.5 实现安装失败回滚（清理目录、不写注册表）
- [x] 4.6 实现 Git URL 安装（clone → npm install --production → 复制）
- [x] 4.7 实现本地路径安装（验证 → 复制）
- [x] 4.8 编写 installer 单元测试

## 5. 管理命令（Manager）

- [x] 5.1 实现 `list` — 读取 `.registry.json` + 格式化展示
- [x] 5.2 实现 `remove` — 移除注册表记录 + 清理目录 + 更新 config
- [x] 5.3 实现 `info` — 读取单个插件详情
- [x] 5.4 实现 `update` — 检查 npm 最新版本 + 重新安装
- [x] 5.5 编写 manager 单元测试

## 6. CLI 集成

- [x] 6.1 实现 `cli.ts` — 注册 `plugin` 子命令及所有嵌套子命令
- [x] 6.2 迁移 `cli/index.ts` — 用 commander 重写，保持 `chat`、`server` 命令兼容
- [x] 6.3 实现 `index.ts` — 公开 API（search、install、list、remove、update、info）
- [x] 6.4 编写 CLI 集成测试

## 7. 加载器适配

- [x] 7.1 修改 `plugins.ts` 的 `scanPluginDir()` — 支持 `--prefix` 安装的嵌套目录结构
- [x] 7.2 编写 scanPluginDir 适配测试

## 8. 验收

- [x] 8.1 端到端验证：`hive plugin search` → `hive plugin add` → `hive plugin list` → `hive plugin remove` 完整流程
- [x] 8.2 确认现有 `hive chat` 和 `hive server` 命令不受影响
