# Hive Harness Engineering — 文档导航

## 🎯 快速查找

### 我应该先读什么？

1. **时间紧张? (5 分钟)**  
   → [HARNESS-SUMMARY.md](./HARNESS-SUMMARY.md)

2. **想了解核心改进? (30 分钟)**  
   → [HARNESS-SUMMARY.md](./HARNESS-SUMMARY.md) + 本文档

3. **要开始实施? (2-3 小时)**  
   → [action-plan-harness.md](./action-plan-harness.md) (选择第 1 周的任务)

4. **深入学习某个改进? (按功能选择)**
   - 工作流恢复 → [workflow-checkpoint-spec.md](./workflow-checkpoint-spec.md)
   - 权限/成本/进度 → [harness-quick-wins.md](./harness-quick-wins.md)

---

## 📚 文档详录

### 1. HARNESS-SUMMARY.md (执行摘要)
**长度**: 2 页  
**难度**: ⭐ 初级  
**读者**: 所有人  
**内容**:
- 📊 快速评分卡 (架构/可靠性/安全/体验)
- 🔴 8 大问题速记表
- 💡 3 个改变游戏规则的改进
- 📅 最小可行性改进方案 (2 周)
- 🚀 立即行动清单

**何时读**: 现在就读  
**能学到**: 项目现状、关键缺陷、优先级

---

### 2. workflow-checkpoint-spec.md (完整规格)
**长度**: 20 页  
**难度**: ⭐⭐⭐⭐ 高级  
**读者**: 后端工程师  
**内容**:
- 📋 数据模型 (SQL schema + TypeScript 类型)
- 🎯 核心实现 (WorkflowCheckpointCapability)
- 🔗 集成点 (CoordinatorCapability 修改)
- 🧪 测试用例
- 💰 预期收益 (对比表)

**何时读**: 准备实施第 1 周任务时  
**工作量**: 3-4 天完成  
**核心价值**: **失败恢复能力** — 无人值守的基础

**关键代码片段**:
```sql
-- 新增表
CREATE TABLE workflow_checkpoints (
  id, session_id, workflow_id, phase,
  explore_result, plan_result, execute_result,
  ...
);
```

---

### 3. harness-quick-wins.md (快速改进指南)
**长度**: 15 页  
**难度**: ⭐⭐⭐ 中级  
**读者**: 后端工程师  
**内容**:

#### 3.1 PermissionCapability (权限管理)
- 工具分级 (safe/restricted/dangerous)
- 操作审计日志表
- Hook 拦截实现
- 📊 预期: 操作100%可追溯

#### 3.2 CostBudgetCapability (成本控制)
- 成本预算表
- 预算检查逻辑
- Server API + UI 集成
- 📊 预期: 超支零风险

#### 3.3 ProgressCapability (进度反馈)
- 进度数据表
- 中间成果推送
- WebSocket 集成
- 📊 预期: 用户体验大幅提升

**何时读**: 第 1 周 (权限/成本) 或第 3 周 (进度)  
**工作量**: 1-2 天/功能  
**快速赢**: 每个功能都有 1-2 天的快速版本

---

### 4. action-plan-harness.md (行动计划)
**长度**: 10 页  
**难度**: ⭐⭐ 中级  
**读者**: PM 或技术主管  
**内容**:
- 📊 现状评估 (完成度 60-70%)
- 🎯 立即优化路径 (第一/二优先级)
- 📅 4 周实施计划 (详细日程)
- 📋 具体行动清单 (今天/第1周/第2周)
- 🎯 成功指标 (周/阶段目标)

**何时读**: 计划项目时间表时  
**工作量**: 参考 4 周计划  
**管理价值**: 清晰的里程碑和交付物

---

## 🎯 按角色推荐阅读顺序

### 👨‍💼 Project Manager / Tech Lead
```
1. 阅读 HARNESS-SUMMARY.md (20 min)
   ↓
2. 浏览 action-plan-harness.md (第一周部分) (30 min)
   ↓
3. 与团队讨论优先级 ✓
```

### 👨‍💻 Backend Engineer (要开始实施)
```
1. 阅读 HARNESS-SUMMARY.md (20 min)
   ↓
2. 细读 action-plan-harness.md (第一周) (1 h)
   ↓
3. 选择优先任务:
     - WorkflowCheckpoint? → 读 workflow-checkpoint-spec.md
     - Permission/Cost/Progress? → 读 harness-quick-wins.md
   ↓
4. 开始编码 ✓
```

### 👨‍💼 Product Manager (想了解改进效果)
```
1. 阅读 HARNESS-SUMMARY.md (20 min)
   ↓
2. 重点关注: "3 个改变游戏规则的改进" 章节
   ↓
3. 查看 action-plan-harness.md 中的"成功指标" 表格
   ↓
4. 与 users 沟通期望 ✓
```

---

## 🔥 速查表 (遇到问题时)

### "为什么我的任务失败后要全部重来？"
→ [workflow-checkpoint-spec.md](./workflow-checkpoint-spec.md)#问题  
→ 解决方案: WorkflowCheckpoint 能力

### "我怎么知道 Agent 在做什么？为什么这么久没反馈？"
→ [harness-quick-wins.md](./harness-quick-wins.md)#3️⃣  
→ 解决方案: ProgressCapability + 进度实时推送

### "如果 Agent 误删了文件怎么办？有没有审计日志？"
→ [harness-quick-wins.md](./harness-quick-wins.md)#1️⃣  
→ 解决方案: PermissionCapability + 操作审计

### "一天账单就花了 $500，这太可怕了"
→ [harness-quick-wins.md](./harness-quick-wins.md)#2️⃣  
→ 解决方案: CostBudgetCapability + 硬限制

### "我想知道应该从哪里开始？有没有时间表？"
→ [action-plan-harness.md](./action-plan-harness.md)#📅-推荐-4-周实施计划  
→ 4 周的详细日程和行动清单

---

## 🚀 立即行动 (3 步)

### Step 1: 理解现状 (20 min)
读 [HARNESS-SUMMARY.md](./HARNESS-SUMMARY.md)

### Step 2: 制定计划 (1 h)  
选择 Phase 1 的任务 (来自 [action-plan-harness.md](./action-plan-harness.md))

### Step 3: 开始编码 (3-4 days)
根据对应规格开始实施

---

## 📈 文档关系图

```
HARNESS-SUMMARY (总览)
        ↓
        ├─→ action-plan-harness (时间计划)
        │        ├─→ Week 1: 权限/成本 → harness-quick-wins
        │        ├─→ Week 2-4: 其他功能 → 对应规格
        │
        ├─→ workflow-checkpoint-spec (详细实现)
        │        ↑ (深入学习时需要)
        │
        ├─→ harness-quick-wins (快速参考)
                 ├─→ PermissionCapability
                 ├─→ CostBudgetCapability
                 └─→ ProgressCapability
```

---

## 💾 文件清单

```
docs/superpowers/specs/
├── HARNESS-SUMMARY.md                    ⭐ 从这里开始
├── workflow-checkpoint-spec.md           📚 详细规格 (CheckPoint)
├── harness-quick-wins.md                 📚 详细规格 (权限/成本/进度)
├── action-plan-harness.md                📚 行动计划和时间表
└── GUIDE.md                               📍 你正在读这个文件
```

---

## 📞 常见问题

**Q: 这些改进对我的项目有多重要？**  
A: 🔴 **严重** — 没有这些，无人值守模式就不可用。

**Q: 需要多少时间？**  
A: 🟡 **4 周** (全部完成) 或 🟢 **1-2 周** (最小可行版本)

**Q: 难度大吗？**  
A: 🟡 **中等** — 需要修改 5-6 个 Capability，新增 5-6 个数据表，整合 Hook 系统。

**Q: 我可以跳过某些改进吗？**  
A: 🔴 **不建议** — 权限/成本/恢复这 3 个是底线。进度反馈可以后做。

**Q: 能不能给我一个 2 周的精简版本？**  
A: ✅ **可以** — 见 [action-plan-harness.md](./action-plan-harness.md)#🎯-phase-1-起步方案

---

## 🎓 学习路径

### 快速上手 (2 小时)
```
HARNESS-SUMMARY → 理解问题
action-plan-harness (Week 1) → 了解每个改进
harness-quick-wins (粗略浏览) → 知道位置
```

### 准备实施 (增加 4 小时)
```
选择某个改进 (如 WorkflowCheckpoint)
仔细读完对应的规格文档
准备编码
```

### 深度掌握 (增加 2-3 天)
```
按规格实施每个改进
写测试用例
集成和调试
```

---

## ✅ 完成清单

完成阅读后：
- [ ] 理解了 8 大缺陷
- [ ] 明确了 4 周的改进重点
- [ ] 知道了每个改进的位置
- [ ] 准备好开始某个功能

**下一步**: 选择 Phase 1 的一个任务，开始编码！

