# sidebar-icons

## Summary

为侧边栏所有菜单项添加图标，解决 Chat 有图标而 Status/Config/Plugins 无图标导致的视觉对齐不一致问题。

## Problem

`Dashboard.tsx` 中 `navItems` 的 `icon` 字段为可选，仅 Chat 项设置了 `MessageSquare` 图标。由于菜单项使用 `flex items-center gap-2.5` 布局，无图标的菜单项文字会紧贴左侧，与有图标的 Chat 项视觉不对齐。

## Solution

从 `lucide-react`（已安装 v1.7.0）为每个菜单项选择语义匹配图标：

| 菜单项 | 图标 | 语义 |
|--------|------|------|
| Chat | `MessageSquare` (已有) | 消息对话 |
| Status | `Activity` | 系统状态/心跳 |
| Config | `Settings` | 配置/设置 |
| Plugins | `Puzzle` | 插件/扩展拼图 |

将 `icon` 字段从可选改为必选，确保所有菜单项视觉一致。

## Scope

- **改动文件**: `apps/desktop/src/pages/Dashboard.tsx`（仅此一个文件）
- **改动行数**: ~5 行（import 3 个图标 + navItems 补充 3 个 icon 属性 + 类型调整）
- **影响范围**: 仅 UI 表现，无功能变更

## Risks

- 低风险：纯 UI 变更，不涉及逻辑
- 图标选择是主观的，可能需要调整

## References

- Issue: #79
- 图标库: lucide-react v1.7.0
