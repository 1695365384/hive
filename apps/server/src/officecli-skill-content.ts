/**
 * OfficeCLI SKILL.md 内容（内联打包，不依赖网络下载）
 *
 * 基于官方 SKILL.md 精简，覆盖核心命令和路径语法。
 * Agent 可运行 `officecli --help` 或 `officecli <format> <command>` 获取详细帮助。
 */
export const OFFICECLI_SKILL_CONTENT = `# OfficeCLI — Office 文档操作技能

> 让 AI 智能体通过 CLI 创建、读取、编辑 Word/Excel/PowerPoint 文档。
> 单一二进制文件，无需安装 Office，全平台运行。

## 安装状态

OfficeCLI 已由 Hive 自动安装。直接使用 \`officecli\` 命令即可。

## 核心命令

| 命令 | 说明 |
|------|------|
| \`create <file>\` | 创建空白 .docx/.xlsx/.pptx（按扩展名判断类型）|
| \`view <file> <mode>\` | 查看内容（outline/text/annotated/stats/issues/html/screenshot）|
| \`get <file> <path>\` | 获取元素及子元素（--depth N, --json）|
| \`query <file> "<selector>"\` | CSS 风格查询（[attr=value], :contains(), :has()）|
| \`set <file> <path>\` | 修改元素属性（--prop key=value）|
| \`add <file> <path>\` | 添加元素（--type, --prop, --from 克隆）|
| \`remove <file> <path>\` | 删除元素 |
| \`move <file> <path>\` | 移动元素（--to, --index, --after, --before）|
| \`swap <file> <path1> <path2>\` | 交换两个元素 |
| \`validate <file>\` | OpenXML 模式校验 |
| \`batch <file>\` | 单次打开/保存周期内执行多条操作（--input, --commands, --json）|
| \`merge <template> <output> <json>\` | 模板合并 — {{key}} 占位符替换 |
| \`dump <file> -o <output>\` | 序列化为可重放的 batch JSON |
| \`watch <file>\` | 浏览器实时预览（http://localhost:26315）|

## 路径语法

基于路径的元素寻址，1-based 索引：

- \`/\` — 文档根
- \`/slide[1]\` — 第一张幻灯片
- \`/slide[1]/shape[2]\` — 第一张幻灯片的第二个形状
- \`/body/p[1]/r[1]\` — Word 正文第一段第一个文本片段
- \`/Sheet1\` — Excel 工作表
- \`/Sheet1/A1\` — Excel 单元格

## 属性设置

所有命令支持 \`--prop key=value\` 语法：

\`\`\`bash
officecli add deck.pptx / --type slide --prop title="Q4 Report" --prop background=1A1A2E
officecli add deck.pptx '/slide[1]' --type shape \\
  --prop text="Revenue grew 25%" --prop x=2cm --prop y=5cm \\
  --prop font=Arial --prop size=24 --prop color=FFFFFF
\`\`\`

## 单位与颜色

| 类型 | 格式 | 示例 |
|------|------|------|
| 尺寸 | cm/in/pt/px/EMU | 2cm, 1in, 72pt, 96px |
| 颜色 | 十六进制/命名色/RGB/主题色 | #FF0000, red, rgb(255,0,0), accent1 |
| 字号 | 纯数字或带 pt | 14, 14pt |

## JSON 输出

所有命令支持 \`--json\`，返回结构化 JSON：

\`\`\`bash
officecli get deck.pptx '/slide[1]/shape[1]' --json
# → {"tag":"shape","path":"/slide[1]/shape[1]","attributes":{"name":"TextBox 1","text":"Hello"}}
\`\`\`

错误返回结构化对象，含错误码和建议：

\`\`\`json
{"success":false,"error":{"error":"Slide 50 not found","code":"not_found","suggestion":"Valid range: 1-8"}}
\`\`\`

## 典型工作流

### 创建 PPT

\`\`\`bash
officecli create report.pptx
officecli add report.pptx / --type slide --prop title="Q4 Results"
officecli add report.pptx '/slide[1]' --type shape \\
  --prop text="Revenue: $4.2M" --prop x=2cm --prop y=5cm --prop size=28
officecli add report.pptx / --type slide --prop title="Details"
officecli view report.pptx outline
officecli validate report.pptx
\`\`\`

### 模板合并

\`\`\`bash
officecli merge invoice-template.docx out-001.docx '{"client":"Acme","total":"$5,200"}'
\`\`\`

### 从现有文档学习

\`\`\`bash
officecli dump existing.docx -o blueprint.json
officecli batch new.docx --input blueprint.json
\`\`\`

## 内置帮助

不确定属性名时：

\`\`\`bash
officecli pptx set              # 全部可设置元素与属性
officecli pptx set shape        # 某类元素的详细说明
officecli pptx set shape.fill   # 单个属性格式与示例
officecli docx query            # 选择器说明
\`\`\`

将 \`pptx\` 换成 \`docx\` 或 \`xlsx\`；动词包括 \`view\`、\`get\`、\`query\`、\`set\`、\`add\`、\`raw\`。

## 三层架构

- **L1 读取**: view（text/annotated/outline/stats/issues/html/screenshot）
- **L2 DOM**: get/query/set/add/remove/move/swap
- **L3 原始 XML**: raw/raw-set/add-part/validate

从 L1 开始，仅在需要时深入 L2/L3，最大限度节省 token。
`;
