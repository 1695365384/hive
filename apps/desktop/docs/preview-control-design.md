# PreviewControl Design — Hive Desktop (Final)

> 预览 = **右侧栏独立面板**。只渲染 HTML / SVG，代码块留在对话内做语法高亮。

---

## 1. 用户决策

| 决策 | 结论 |
|------|------|
| 预览位置 | **右侧栏**（不是底部抽屉） |
| 对话内渲染 | react-markdown + rehype-highlight + remark-gfm |
| 预览范围 | 仅 html/svg（可渲染的内容）→ 推送到右侧栏 |
| 代码块 | 留在对话内做语法高亮，不进预览面板 |
| Mermaid | 客户端渲染（Phase 2） |

---

## 2. 架构

```
Dashboard
├── Sidebar (left — existing chat/config nav)
├── Main + Preview (flex)
│   ├── ChatPage (flex-1)
│   │   └── MessageBubble
│   │       └── TextBlock (react-markdown v2)
│   │           ├── ```html / ```svg  → 代码块 + [▶ Preview] 按钮
│   │           ├── ```js / ```ts / ```py → 语法高亮（无预览）
│   │           └── plain markdown → react-markdown
│   └── PreviewSidebar (w-96, right)  ← NEW
│       └── PreviewCanvas
│           ├── SandboxedIframe (html)
│           └── SvgRenderer (svg)
└── StatusBar (existing)
```

## 3. 预览检测规则

| Fenced Language | 对话内渲染 | Preview 按钮 |
|----------------|-----------|-------------|
| `html` | react-markdown 默认代码块 | ✅ 推送到右侧栏 iframe |
| `svg` | react-markdown 默认代码块 | ✅ 推送到右侧栏 SVG 渲染 |
| `mermaid` (Phase 2) | react-markdown 默认代码块 | ✅ 推送到右侧栏渲染 |
| `js/ts/jsx/tsx/py/go/rs/css` | 语法高亮 (rehype-highlight) | ❌ |
| 普通 Markdown | react-markdown | ❌ |

## 4. PreviewSidebar (右侧栏)

- 固定在 ChatPage 右侧，`w-96` (~384px)
- 与 ChatPage 共用 flex 布局：`ChatPage (flex-1) + PreviewSidebar (w-96)`
- 切换预览时更新内容（当前只有一个活跃预览）
- 右上角关闭按钮
- 空状态：显示 "Select a preview to display"
- 与 LogDrawer 互不冲突（LogDrawer 在 StatusBar 层）

## 5. Zustand Store

```typescript
interface Preview {
  id: string;
  title: string;
  type: 'html' | 'svg';
  content: string;
  sourceMessageId: string;
}

interface PreviewStore {
  previews: Preview[];
  activeId: string | null;
  isOpen: boolean;
  addPreview(p: Preview): void;
  setActive(id: string | null): void;
  openFor(preview: Preview): void;  // add + setActive + isOpen=true
  close(): void;
  clear(): void;
}
```

## 6. 依赖

```bash
npm install react-markdown remark-gfm rehype-highlight highlight.js
```

## 7. 新增文件

```
apps/desktop/src/
├── components/preview/
│   ├── PreviewSidebar.tsx       # 右侧面板
│   ├── PreviewCanvas.tsx        # 预览路由
│   ├── SandboxedIframe.tsx      # HTML iframe (srcdoc + sandbox)
│   ├── SvgRenderer.tsx          # SVG 安全渲染
│   └── detect-preview.ts        # fenced block 检测工具函数
├── stores/
│   └── preview-store.ts
├── pages/
│   └── ChatPage.tsx             # +PreviewSidebar + TextBlock v2
└── components/
    └── TextBlock.tsx (refactor)  # react-markdown + 预览按钮
```

## 8. 实现步骤

1. `preview-store.ts` — Zustand store
2. `detect-preview.ts` — 提取 fenced code block，判断是否 previewable
3. `SandboxedIframe.tsx` — srcdoc + sandbox + 自适应
4. `SvgRenderer.tsx` — SVG 安全渲染
5. `PreviewCanvas.tsx` — 按 type 路由到对应渲染器
6. `PreviewSidebar.tsx` — 右侧栏面板
7. `TextBlock.tsx` — react-markdown 替换（保留 [File:] 兼容）
8. `ChatPage.tsx` — 集成 PreviewSidebar + flex 布局
