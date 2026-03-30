## ADDED Requirements

### Requirement: npm 包安装
系统 SHALL 支持通过 `hive plugin add <npm-package>` 安装 npm 上的 `@hive/plugin-*` 插件到 `.hive/plugins/<name>/` 目录。

#### Scenario: 安装 npm 插件
- **WHEN** 用户执行 `hive plugin add @bundy-lmw/hive-plugin-feishu`
- **THEN** 执行 `npm install --prefix .hive/plugins/feishu @bundy-lmw/hive-plugin-feishu`，安装成功后验证 `package.json` 的 `hive.plugin` 字段，写入 `.registry.json`，追加到 `hive.config.json` 的 `plugins` 字段

#### Scenario: 安装指定版本
- **WHEN** 用户执行 `hive plugin add @bundy-lmw/hive-plugin-feishu@1.0.0`
- **THEN** 安装指定版本的包

#### Scenario: 插件已存在
- **WHEN** 安装的插件名称已在 `.registry.json` 中
- **THEN** 提示"Plugin already installed. Use `hive plugin update <name>` to upgrade."并跳过安装

#### Scenario: npm install 失败
- **WHEN** `npm install` 命令执行失败
- **THEN** 清理 `.hive/plugins/<name>/` 目录（如果已创建），展示错误信息，不写入 `.registry.json`

#### Scenario: 验证失败（无 hive.plugin 字段）
- **WHEN** 安装成功但 `package.json` 中缺少 `hive.plugin` 字段
- **THEN** 提示"Not a valid Hive plugin (missing hive.plugin in package.json)"，清理目录

### Requirement: Git URL 安装
系统 SHALL 支持通过 `hive plugin add <git-url>` 从 Git 仓库安装插件。

#### Scenario: 安装 Git 插件
- **WHEN** 用户执行 `hive plugin add https://github.com/user/@bundy-lmw/hive-plugin-feishu`
- **THEN** 展示仓库信息并要求用户确认 → `git clone` 到临时目录 → 检查 `package.json` 的 `hive.plugin` 字段 → 执行 `npm install --production` → 复制到 `.hive/plugins/<name>/` → 写入 `.registry.json`

#### Scenario: 用户取消确认
- **WHEN** 展示确认提示后用户选择取消
- **THEN** 不执行安装，返回

### Requirement: 本地路径安装
系统 SHALL 支持通过 `hive plugin add <local-path>` 从本地目录安装插件。

#### Scenario: 安装本地插件
- **WHEN** 用户执行 `hive plugin add ./my-plugin`
- **THEN** 验证路径存在且有 `package.json` 的 `hive.plugin` 字段 → 复制到 `.hive/plugins/<name>/` → 写入 `.registry.json`

#### Scenario: 路径不存在
- **WHEN** 指定的本地路径不存在
- **THEN** 展示错误信息"Path not found"

### Requirement: 来源类型自动识别
系统 SHALL 根据输入格式自动识别安装来源类型。

#### Scenario: 识别规则
- **WHEN** 输入匹配 `@hive/plugin-*` 或 `@scope/name`
- **THEN** 识别为 npm 包安装
- **WHEN** 输入匹配 `https://*` 或 `git://*` 或 `git@*`
- **THEN** 识别为 Git URL 安装
- **WHEN** 输入匹配 `./*` 或 `../*` 或 `/` 开头
- **THEN** 识别为本地路径安装
