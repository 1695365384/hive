# 🔧 Harness Engineering — Hive 无人值守系统改进方案

> 将一个有坚实架构的 Agent 系统转变成**生产级无人值守系统**的完整改进指南。

## 📖 从这里开始

### 🚀 5 分钟快速了解
→ [HARNESS-SUMMARY.md](./HARNESS-SUMMARY.md)

**包含**:
- 📊 项目现状评分卡
- 🔴 8 大缺陷速记
- 💡 3 个改变游戏规则的改进
- 🎯 立即行动清单

---

## 📚 完整文档导航

### 1. 🗺️ 导航文档 — GUIDE.md
快速查找、按角色推荐、速查表、常见问题

### 2. 📋 行动计划 — action-plan-harness.md
- 4 周详细时间表
- 周目标和成功指标
- 具体行动清单
- **适合**: PM、技术主管、项目规划

### 3. 📘 核心改进规格

#### a) 工作流检查点 — workflow-checkpoint-spec.md
**问题**: 失败即全部重来  
**解决**: 检查点恢复机制  
**工作量**: 3-4 天  
**内容**: 完整的数据模型 + 代码示例 + 集成点  
**适合**: 后端工程师

#### b) 快速改进 — harness-quick-wins.md
**包含 3 个改进**:
- PermissionCapability (权限管理)
- CostBudgetCapability (成本控制)
- ProgressCapability (进度反馈)

**工作量**: 1-2 天/功能  
**适合**: 后端工程师、快速上手

---

## 🎯 按角色推荐

### 👨‍💼 PM / 技术主管
```
HARNESS-SUMMARY (20 min)
    ↓
action-plan-harness (第一周部分, 30 min)
    ↓
与团队讨论优先级 ✓
```

### 👨‍💻 后端工程师 (要实施)
```
HARNESS-SUMMARY (20 min)
    ↓
action-plan-harness (第一周, 1 h)
    ↓
选择优先功能:
  - WorkflowCheckpoint? → workflow-checkpoint-spec.md
  - Permission/Cost/Progress? → harness-quick-wins.md
    ↓
开始编码 ✓
```

### 🔍 架构师 (想深入理解)
```
GUIDE.md (速查表, 20 min)
    ↓
所有规格文档 (深入学习)
    ↓
提出架构建议 ✓
```

---

## 📊 快速参考

### 项目现状
- ✅ 架构: ⭐⭐⭐⭐⭐ (坚实)
- 🔴 可靠性: ⭐⭐⭐ (需改进)
- 🔴 安全性: ⭐ (需改进)
- 🔴 成本控制: ⭐ (缺失)
- 🟠 用户体验: ⭐⭐ (可优化)
- **总体完成度**: 60-70% → 🎯 95%+

### 核心缺陷 (8 大)
1. 🔴 无检查点恢复 - 失败全部重来
2. 🔴 无权限管理 - 可能误操作
3. 🔴 无成本控制 - 账单爆炸
4. 🔴 无离线队列 - 关闭即停止
5. 🟠 无进度反馈 - 用户盲目等待
6. 🟠 资源泄漏 - Worker 未清理
7. 🟡 无版本控制 - 无法回滚
8. 🟡 无速率优化 - 浪费成本

### 改进方案 (4 个核心)
| 功能 | 优先级 | 工作量 | 收益 |
|------|--------|--------|------|
| WorkflowCheckpoint | 🔴 | 3-4d | 故障恢复 |
| PermissionCapability | 🔴 | 2-3d | 权限控制 |
| CostBudgetCapability | 🔴 | 1-2d | 成本控制 |
| ProgressCapability | 🟠 | 1-2d | 用户体验 |

---

## 🗂️ 文件结构

```
docs/harness-engineering/
├── README.md                       (你在这里)
├── GUIDE.md                        🗺️ 导航文档
├── HARNESS-SUMMARY.md              📊 执行摘要
├── action-plan-harness.md          📅 4 周行动计划
├── workflow-checkpoint-spec.md     📘 检查点完整规格
└── harness-quick-wins.md           ⚡ 快速改进指南
```

---

## 🚀 立即行动 (3 步)

### Step 1: 理解现状 (20 min)
读 [HARNESS-SUMMARY.md](./HARNESS-SUMMARY.md)

### Step 2: 规划工作 (30 min)
查看 [action-plan-harness.md](./action-plan-harness.md) 的第一周

### Step 3: 深入学习 (2-3 h)
根据选中的功能读对应规格:
- WorkflowCheckpoint → [workflow-checkpoint-spec.md](./workflow-checkpoint-spec.md)
- Permission/Cost/Progress → [harness-quick-wins.md](./harness-quick-wins.md)

### Step 4: 开始编码 ✨

---

## 📞 导航快速链接

- 🤔 **不知道从哪里开始?** → [GUIDE.md](./GUIDE.md) 中的角色推荐
- 🔍 **遇到某个问题?** → [GUIDE.md](./GUIDE.md) 的速查表
- ⏱️ **时间紧张?** → [HARNESS-SUMMARY.md](./HARNESS-SUMMARY.md) + Week 1 of [action-plan-harness.md](./action-plan-harness.md)
- 💻 **准备编码?** → 选择功能，读对应规格文档

---

## ✅ 期望收益

完成这些改进后:

| 指标 | 当前 | 目标 | 提升 |
|------|------|------|------|
| 任务可靠性 | 60% | 95%+ | +58% |
| 故障恢复时间 | 全部重来 | <1 min | 🚀 |
| 操作可追溯 | 无 | 100% | 💯 |
| 成本可控 | 无 | 硬限制 | ✅ |
| 用户反馈 | 无 | 实时 + ETA | 📊 |

**结果**: 从"实验性 Agent"升级到"生产级无人值守系统"。

---

**准备好了？** 开始阅读 [HARNESS-SUMMARY.md](./HARNESS-SUMMARY.md) 🚀
