> **回退参考，不是默认路径。**
> 新建 PPT **必须优先** 使用内置 `dashi-ppt`（模板填文案 → 可浏览器编辑 → 导出 PPTX）。
> 仅当 `dashi-ppt` 不可用时，才用本文件的 HTML/`hive-ppt` 管线。
> 做漂亮 PPT ≠ 手写 Tailwind；手写 HTML 最容易出现 AI 套话和文字溢出。

# PPT Design — HTML to PowerPoint Pipeline

> 不用 officecli 逐命令建 PPT。你可以直接写 HTML+Tailwind，然后一条命令转 .pptx。

## 何时用 HTML 管线

| 用户说 | 选哪个 |
|--------|--------|
| "做一份漂亮的/好看的/精美的/专业的 PPT" | **dashi-ppt（默认）**；仅无本文件作回退 |
| "按这个模板做"（上传了 .pptx） | 优先 **dashi-ppt**；必要时 officecli dump 学模板后回退本管线 |
| "改一下第 3 页标题" | officecli（改已有文档） |
| "把两个 pptx 合并" | officecli merge |
| Word / Excel | officecli |

## 工作流

### 路径 A：无模板（用户描述风格）

1. **读需求**：提取颜色、字体偏好、风格关键词（"科技感"→深色背景+霓虹色、"简约"→大量留白+细线）、页数和每页内容
2. **写 HTML**：用 `write` 工具写出完整的 HTML 文件。必须遵循下面的 HTML 规范
3. **转 pptx**：`hive-ppt convert /path/to/deck.html /path/to/output.pptx`
4. **验证**：`hive-ppt validate /path/to/output.pptx`
5. **交付**：`send-file /path/to/output.pptx`

### 路径 B：有模板（用户上传或指定了 .pptx）

1. **学习模板**：
   - 结构：`officecli dump template.pptx -o blueprint.json`
   - 视觉：`officecli view template.pptx html -o template.html`
2. **分析**：读 blueprint.json + template.html，提取配色（背景色、强调色、文字色）、字体、版式（标题位置、正文区、图片区、页码位置）
3. **仿写 HTML**：按分析的配色/字体/版式，用 Tailwind 重写每页
4. 后续同路径 A 的步骤 3-5

### blueprint.json 解读指南

`officecli dump` 输出的 JSON 中，版面信息在 `.slide[N].shapes[].attributes` 里：

| 属性 | 含义 | Tailwind 映射 |
|------|------|---------------|
| `x`, `y` | 元素左上角位置（cm） | `left-[Npx]`, `top-[Npx]` — 1cm ≈ 37.8px（在 1920px 宽画布上） |
| `width`, `height` | 元素尺寸（cm） | `w-[Npx]`, `h-[Npx]` |
| `fill` / `color` | OOXML 十六进制色值 `#RRGGBB` | `bg-[#RRGGBB]`, `text-[#RRGGBB]` |
| `font` | 字体族名 | `font-['Name']` |
| `size` | 字号（pt） | `text-[Npx]` — `pt × 1.333 = px`（在 1920px 宽画布上每个 pt ≈ 2.67px，近似取 `pt × 1.333` 是因为 Tailwind 用 px 做基准、dom-to-pptx 内部按 192dpi 换算） |

## HTML 规范（必须严格遵守）

### 骨架

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=<按需选取>');
    body { margin: 0; background: #fff; }
    .slide { width: 1920px; height: 1080px; overflow: hidden; position: relative; page-break-after: always; }
    .slide:last-child { page-break-after: auto; }
  </style>
</head>
<body>
  <div class="slide" data-notes="演讲备注（可选）">...第 1 页...</div>
  <div class="slide" data-notes="...">...第 2 页...</div>
</body>
</html>
```

### 铁律

- **每页一个 `.slide` div，宽高 1920×1080**（16:9 标准，dom-to-pptx 自动映射到 10×5.625 inch）
- **所有内容在 Tailwind 类名中**，不要用内联 `<style>` 或 CSS 变量（dom-to-pptx 靠 computed style 解析）
- **文本在 `<p>`、`<h1>`-`<h6>`、`<span>`、`<li>` 中**（dom-to-pptx 只识别这些标签做文本框）
- **图片用 `<img>` 标签**（dom-to-pptx 会下载并嵌入）
- **图表不要写 HTML**——用 `data-chart` 属性标记图表占位区，后续用 PptxGenJS 注入：
  ```html
  <div class="slide">
    <h2 class="text-3xl font-bold p-12">季度营收</h2>
    <div data-chart='{"type":"bar","categories":["Q1","Q2","Q3"],"series":[120,245,178]}'
         class="absolute left-12 right-12 top-32 bottom-12"></div>
  </div>
  ```
- **背景**：用 `bg-gradient-to-r from-xxx to-yyy` 或纯色 `bg-[#xxxxxx]`
- **阴影**：`shadow-lg` / `shadow-2xl` 等 Tailwind shadow 类（dom-to-pptx 支持）
- **圆角**：`rounded-lg` / `rounded-2xl` 等
- **字体**：`font-sans` / `font-serif` / Google Fonts 名（`font-['Noto+Sans+SC']` 等），dom-to-pptx 会嵌入

### CSS 能力表（dom-to-pptx v2.1 支持）

| 支持 ✅ | 不支持 ❌（会降级为截图） |
|---------|--------------------------|
| flex / grid 布局 | radial-gradient |
| linear-gradient | text-shadow |
| box-shadow | backdrop-filter / filter |
| border-radius | clip-path |
| 实体 border | CSS transform: scale/rotate/skew |
| background-color (含透明度) | CSS animation / transition |
| opacity | ::before / ::after 复杂形状 |
| @font-face 字体嵌入 | |
| SVG `<img>` 矢量导出 | |

**遇到不支持的特性时**：接受降级——dom-to-pptx 会用 html2canvas 截图嵌入。优先使用支持的 CSS。

## 常见风格配方

| 风格 | 背景 | 强调色 | 字体 | 版式特点 |
|------|------|--------|------|----------|
| 科技/深色 | `bg-gradient-to-br from-slate-900 to-indigo-950` | 青绿 `#06b6d4` / 紫 `#a855f7` | sans-serif (Inter) | 大标题左对齐，窄卡片，发光边框 |
| 简约/白 | `bg-white` | 靛蓝 `#4f46e5` / 灰 `#6b7280` | sans-serif (Inter) | 大量留白，细灰线分隔，图文混排 |
| 商务/蓝 | `bg-gradient-to-br from-blue-900 to-blue-700` | 金 `#f59e0b` / 白 | serif + sans-serif | 居中标题，金线装饰，数据卡片 |
| 创意/暖色 | `bg-gradient-to-br from-amber-50 to-orange-100` | 橙红 `#ea580c` | 圆体 (Quicksand) | 大圆角卡片，渐变装饰块，emoji 点缀 |
| 学术/素雅 | `bg-white` 或 `bg-gray-50` | 深蓝 `#1e40af` | serif (Merriweather) | 章节编号，引用块，图表多 |

## hive-ppt 命令参考

```bash
# 转换 HTML 为 PPTX
hive-ppt convert deck.html output.pptx

# 生成图表页（用于 data-chart 注入流程）
hive-ppt chart chart-config.json chart.pptx

# 合并多个 PPTX
hive-ppt merge base.pptx chart1.pptx chart2.pptx output.pptx

# 验证 PPTX
hive-ppt validate output.pptx
# → { "pass": true/false, "slideCount": N, "hasChart": bool, "issues": [...] }
```