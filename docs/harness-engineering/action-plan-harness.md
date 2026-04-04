# Hive 无人值守系统 — 立即行动计划

## 📊 现状评估

**项目**: Hive - 多 Agent 协作框架  
**目标**: 无人值守的自主 Agent 系统  
**当前完成度**: 🟡 **60-70%**

### 核心指标

| 指标 | 当前 | 目标 | 差距 |
|------|------|------|------|
| 任务可靠性 | 60% | 95%+ | 🔴 |
| 故障恢复 | 0 (全部重来) | <1min | 🔴 |
| 离线支持 | ❌ 无 | ✅ 完整 | 🔴 |
| 权限/审计 | ❌ 无 | ✅ 完整 | 🔴 |
| 成本控制 | ❌ 无 | ✅ 完整 | 🔴 |
| 用户反馈 | 简陋 | 实时+ETA | 🟠 |
| 代码成熟度 | 💪 优秀 | 💪 优秀 | ✅ |

---

## 🎯 立即优化路径

### 第一优先级 (必做 — 无人值守的基础)

#### ❌ 问题 1: 单次失败即全部重来
**症状**: Agent 运行 30 分钟失败，需全部重新开始  
**根本原因**: 工作流各阶段无检查点存储  
**解决方案**: WorkflowCheckpoint + 断点/恢复机制

**改进后**:
```
❌ 重新开始 (花30分钟 + 再花30分钟 = 60分钟)
✅ 从检查点恢复 (继续5分钟 = 总35分钟)
```

**投入**: **3-4 天** (最高值得)  
**文档**: `docs/superpowers/specs/workflow-checkpoint-spec.md`

---

#### ❌ 问题 2: 完全无权限管理
**症状**: Agent 可能误删文件、调用 root 权限  
**根本原因**: 工具调用无拦截、无审计  
**解决方案**: PermissionCapability + 操作审计

**改进后**:
```
❌ 无法溯源: "谁删了这个文件？什么时候？"
✅ 完整审计: 所有操作都有记录 + 权限等级 + 用户确认
```

**投入**: **2-3 天**  
**快速赢**: 在 Hook 中添加权限拦截 (4h)  
**参考**: `docs/superpowers/specs/harness-quick-wins.md#1️⃣-权限--操作审计`

---

#### ❌ 问题 3: 无成本控制
**症状**: 无拘束的 Agent 可能一天消费 $500+ 而不自知  
**根本原因**: 无预算检查、无成本追踪  
**解决方案**: CostBudgetCapability + 实时显示

**改进后**:
```
❌ 无法预测成本,事后才知道超支
✅ 实时显示 $2.45 / $50 预算，超额自动停止
```

**投入**: **1-2 天** (最快收益)  
**参考**: `docs/superpowers/specs/harness-quick-wins.md#2️⃣-成本控制--预算管理`

---

### 第二优先级 (要做 — 用户体验)

#### 🟠 问题 4: 用户长时间无反馈
**症状**: 1 小时任务期间用户完全不知道进度  
**根本原因**: 没有进度、ETA、中间成果推送  
**解决方案**: ProgressCapability + 实时流推送

**改进后**:
```
❌ 16:32 "处理中..." → 17:30 "完成" (用户盲目等待)
✅ 16:32 "处理中..." 
   16:35 "Explore 完成，发现15个相关资源"
   16:45 "Plan 完成，拆解为8个任务"
   17:00 "Execute 进行中 (60% 完成)"
   17:10 "完成!"
```

**投入**: **1-2 天**  
**参考**: `docs/superpowers/specs/harness-quick-wins.md#3️⃣-实时进度反馈--中间成果推送`

---

#### 🟠 问题 5: 无离线队列支持
**症状**: Desktop 应用关闭即停止所有后台工作  
**根本原因**: 完全依赖 WebSocket 在线连接  
**解决方案**: LocalTaskQueue + Server 端定时扫描

**改进后**:
```
❌ 用户关闭 Desktop → 任务中止 → 上班回来什么都没做
✅ 用户关闭 Desktop → 任务转入本地队列 → 后台在线运行 → 回来时已完成
```

**投入**: **2-3 天**  
**关键**: 需要 Tauri 应用保活 + Server 端 LocalTaskQueue 扫描

---

<br/>

## 📅 推荐 4 周实施计划

### Week 1 — 基础安全 & 成本控制

**目标**: 让无人值守模式"安全可控"

| 日期 | 任务 | 工程量 | 优先级 |
|------|------|--------|--------|
| Mon-Tue | PermissionCapability + 工具权限分类 | 2d | 🔴 |
| Wed | CostBudgetCapability + 成本预算 | 1d | 🔴 |
| Thu | 集成测试 + 前端 UI | 1d | 🔴 |
| Fri | 预留 (Bug fix / 优化) | 1d | 🟡 |

**周产出**:
- ✅ 所有工具都有权限标记
- ✅ 操作审计日志完整
- ✅ 支持预算控制和成本实时显示
- ✅ 无人值守模式"可控"

---

### Week 2 — 可靠性保障

**目标**: 让失败的任务"快速恢复"

| 日期 | 任务 | 工程量 | 优先级 |
|------|------|--------|--------|
| Mon-Wed | WorkflowCheckpoint 数据库 + 恢复逻辑 | 3d | 🔴 |
| Thu | API + Desktop UI | 1d | 🔴 |
| Fri | 集成测试 + 文档 | 1d | 🔴 |

**周产出**:
- ✅ 完整的检查点恢复机制
- ✅ 工作流各阶段可快速恢复
- ✅ 故障恢复时间 <1 分钟

---

### Week 3 — 用户体验

**目标**: 让用户"心里有数"

| 日期 | 任务 | 工程量 | 优先级 |
|------|------|--------|--------|
| Mon-Tue | ProgressCapability + 进度追踪 | 2d | 🟠 |
| Wed | 中间成果推送 + WebSocket 集成 | 1d | 🟠 |
| Thu | Desktop UI (进度条、ETA、中间成果) | 1d | 🟠 |
| Fri | 集成测试 | 1d | 🟠 |

**周产出**:
- ✅ 实时进度百分比显示
- ✅ ETA 预测和中间成果推送
- ✅ 用户体验显著提升

---

### Week 4 — 离线支持 & 收尾

**目标**: 让系统"随处可用"

| 日期 | 任务 | 工程量 | 优先级 |
|------|------|--------|--------|
| Mon-Tue | LocalTaskQueue 队列系统 | 2d | 🟠 |
| Wed | Tauri 后台保活 + Server 定时扫描 | 1d | 🟠 |
| Thu | 集成测试 | 1d | 🟠 |
| Fri | 最终验收 + 文档补充 | 1d | 🟡 |

**周产出**:
- ✅ 离线任务队列支持
- ✅ Desktop 后台运行模式
- ✅ 无人值守系统"基本完整"

---

## 🎯 Phase 1 起步方案 (如果时间紧张)

如果只有 **1 周**，优先做这 3 样：

### Day 1-2: WorkflowCheckpoint (我们已准备好规格)
- 新增 `workflow_checkpoints` 表
- `WorkflowCheckpointCapability` 能力
- 在 `CoordinatorCapability.dispatch()` 中集成

**收益**: 🔴 **失败恢复能力** (最重要)

---

### Day 3: CostBudgetCapability
- 新增 `cost_budgets` 及 `cost_logs` 表
- 在工具调用前检查预算
- 前端显示成本

**收益**: 🔴 **成本可控** (无人值守必须)

---

### Day 4-5: PermissionCapability
- 工具权限分类
- Hook 拦截 + 审计日志
- 危险工具确认对话框

**收益**: 🔴 **操作安全** (无人值守必须)

---

### 结果
```
3 天后:
✅ 任务失败可快速恢复 (<1min)
✅ 成本可控 (设置预算、实时监控)
✅ 操作安全 (权限拦截、完整审计)

无人值守系统从"危险"升级到"安全可控" 🛡️
```

---

## 📋 具体行动清单

### 立即开始 (今天/明天)

- [ ] 读完 `workflow-checkpoint-spec.md` (30min)
- [ ] 读完 `harness-quick-wins.md` (1h)
- [ ] 在 `packages/core/src/agents/capabilities/` 下创建 3 个新文件:
  - [ ] `WorkflowCheckpointCapability.ts`
  - [ ] `PermissionCapability.ts`
  - [ ] `CostBudgetCapability.ts`
- [ ] 在 `packages/core/tests/integration/` 下创建对应的测试文件

---

### 第 1 周目标

- [ ] WorkflowCheckpoint 核心逻辑完成 + 测试通过
- [ ] CostBudgetCapability 集成到 dispatch()
- [ ] PermissionCapability 工具权限分类完成
- [ ] Desktop UI 能展示成本实时统计

---

### 第 2 周目标

- [ ] 检查点恢复机制完整
- [ ] 权限审计 API 完成
- [ ] ProgressCapability 基础实现

---

## 💡 快速参考

### 现有但需要增强的地方

1. **SessionManager** (已有 ✅)
   - 现状: 会话消息持久化 + 自动压缩
   - 增强: 需要保存工作流阶段状态

2. **TimeoutCapability** (已有 ✅)
   - 现状: 4 层超时 + 心跳检测
   - 增强: 超时时触发 checkpoint 保存

3. **CoordinatorCapability** (已有 ✅)
   - 现状: 三阶段工作流拆解
   - 增强: 集成 checkpoint + recovery

4. **HookRegistry** (已有 ✅)
   - 现状: 事件发布订阅系统
   - 增强: 用于权限决策、成本告警等

### 需要新建的东西

1. **WorkflowCheckpointCapability** 
2. **PermissionCapability** (权限拦截)
3. **CostBudgetCapability** (成本控制)
4. **ProgressCapability** (进度追踪)
5. **LocalTaskQueue** (离线队列)

### 需要修改的地方

1. **数据库 schema**: 新增 5 个表
2. **CoordinatorCapability**: 集成 checkpoint + recovery
3. **Agent.initialize()**: 注册新能力
4. **Hook Registry**: 增加新的 Hook 事件类型
5. **Desktop UI**: 新增权限、成本、进度、队列等面板

---

## 📊 成功指标

### 第 1 周后
- ✅ 所有工具都有权限标记
- ✅ 成本显示在 UI 上
- ✅ 操作审计日志可查询

### 第 2 周后
- ✅ 失败任务可在 <1min 内恢复
- ✅ 用户可查看工作流检查点历史

### 第 3 周后
- ✅ 用户收到实时进度更新 + ETA

### 第 4 周后
- ✅ 无人值守系统可离线运行
- ✅ 整体可用度从 60% → 95%+

---

## 🚀 最终检查清单

完成优化后，你的项目将满足:

- [ ] **无人值守** ✅ 用户交代任务后可离开
- [ ] **可靠** ✅ 单点失败可快速恢复
- [ ] **安全** ✅ 完整权限管理和审计
- [ ] **可控** ✅ 成本有预算限制
- [ ] **透明** ✅ 用户实时反馈和进度
- [ ] **清洁** ✅ 资源自动清理
- [ ] **可扩展** ✅ 能力系统支持添加新功能

**这就是生产级的无人值守 Agent 系统！** 🎉

