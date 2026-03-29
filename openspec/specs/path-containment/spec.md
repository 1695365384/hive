## ADDED Requirements

### Requirement: 文件路径工作目录约束
file-tool、glob-tool、grep-tool 的路径参数 SHALL 被约束在允许的根目录内。超出根目录的路径 SHALL 被拒绝。

#### Scenario: file-tool 阻止路径穿越
- **WHEN** 调用 file-tool view 时传入 `file_path: "/etc/passwd"`
- **THEN** 工具 SHALL 返回错误信息，不执行读取操作

#### Scenario: glob-tool 阻止路径穿越
- **WHEN** 调用 glob-tool 时传入 `path: "/etc"`
- **THEN** 工具 SHALL 返回错误信息，不执行搜索

#### Scenario: glob-tool 允许工作目录内路径
- **WHEN** 调用 glob-tool 时传入 `path: "./src"` 且当前工作目录为 `/project`
- **THEN** 工具 SHALL 正常搜索 `/project/src`

#### Scenario: 路径解析处理符号链接和 ..
- **WHEN** 路径包含 `../` 或符号链接
- **THEN** SHALL 使用 `path.resolve()` 解析后再检查边界

#### Scenario: 工作目录可通过环境变量配置
- **WHEN** 设置环境变量 `HIVE_WORKING_DIR=/allowed/dir`
- **THEN** 路径约束 SHALL 使用该目录作为根目录

### Requirement: web-fetch SSRF 防护
web-fetch-tool SHALL 验证 URL scheme 并拒绝访问内网地址。

#### Scenario: 拒绝非 HTTP scheme
- **WHEN** 调用 web-fetch 时传入 `url: "file:///etc/passwd"`
- **THEN** 工具 SHALL 返回错误信息

#### Scenario: 拒绝内网 IP
- **WHEN** 调用 web-fetch 时传入 URL 解析到 `127.0.0.1` 或 `10.0.0.1`
- **THEN** 工具 SHALL 返回错误信息

#### Scenario: 仅允许 HTTPS
- **WHEN** 调用 web-fetch 时传入 `url: "http://example.com"`
- **THEN** 工具 SHALL 返回错误信息（除非域名在白名单中）
