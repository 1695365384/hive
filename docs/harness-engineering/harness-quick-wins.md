# 快速改进方案 — Harness 工程 3 大支柱

## 📌 快速导航

这份文档包含 **3 个可在 1-2 周内完成的高优先级改进**，每个都能显著提升无人值守系统的可靠性。

---

## 1️⃣ 权限 & 操作审计 — PermissionCapability

### 问题
```
用户: "用强化学习优化我的网站"
Agent: ✅ 开始执行...
       🔴 调用了 root 权限删除文件
       💥 误删用户整个 repo
```

**无审计 = 无道德制衡**

---

### 快速改进方案 (2-3天)

#### 第一步: 工具分类 & 权限定义

**文件**: `packages/core/src/tools/permissions.ts`

```typescript
// 工具权限等级定义
export const TOOL_PERMISSIONS = {
  // 🟢 SAFE - 安全工具，可直接调用
  'safe': [
    'read-file',
    'grep-search',
    'list-dir',
    'web-fetch',
  ],
  
  // 🟡 RESTRICTED - 需要记录审计日志
  'restricted': [
    'write-file',
    'create-dir',
    'run-command',
    'git-push',
    'install-package',
  ],
  
  // 🔴 DANGEROUS - 需要人工审核或预算确认
  'dangerous': [
    'delete-file',
    'delete-dir',
    'kill-process',
    'modify-config',
    'publish-release',
    'run-command-with-root',
  ],
} as const;

export const TOOL_DESCRIPTIONS: Record<string, string> = {
  'delete-file': '删除文件系统中的文件 (无法恢复)',
  'modify-config': '修改系统/应用配置文件',
  'run-command-with-root': '使用 root 权限执行命令',
  // ...
};
```

#### 第二步: 审计日志表

**SQL**:

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- 主体信息
  agent_id TEXT,
  user_id TEXT,  -- 如果有则记录
  
  -- 操作信息
  tool_name TEXT NOT NULL,
  tool_permission TEXT NOT NULL,  -- 'safe' | 'restricted' | 'dangerous'
  tool_input LONGTEXT,  -- JSON
  tool_output LONGTEXT,  -- JSON
  
  -- 决策信息
  decision TEXT,  -- 'allowed' | 'denied' | 'user_confirmed'
  decision_reason TEXT,
  confirmation_prompt TEXT,  -- dangerous 工具的确认信息
  user_confirmed_at TIMESTAMP,  -- 用户确认时间
  
  -- 成本信息 (如果有)
  cost_impact REAL,  -- 这个操作会造成的成本
  
  -- 执行结果
  execution_status TEXT,  -- 'success' | 'failed' | 'blocked'
  execution_error TEXT,
  duration_ms INTEGER,
  
  INDEX idx_session_timestamp (session_id, timestamp),
  INDEX idx_tool_permission (tool_permission),
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);
```

#### 第三步: 在工具调用前拦截

**文件**: `packages/core/src/hooks/implementations/PermissionHook.ts`

```typescript
export class PermissionHook implements HookListener<ToolBeforeHookContext> {
  async handle(ctx: ToolBeforeHookContext): Promise<HookDecision> {
    const toolName = ctx.toolName;
    const permission = this.getToolPermission(toolName);
    
    // 🟢 SAFE: 直接通过
    if (permission === 'safe') {
      return { proceed: true };
    }
    
    // 🟡 RESTRICTED: 记录审计日志
    if (permission === 'restricted') {
      await this.auditLog({
        toolName,
        permission,
        input: ctx.toolInput,
        decision: 'allowed',
        decisionReason: 'Restricted tool - automatic logging',
      });
      return { proceed: true };
    }
    
    // 🔴 DANGEROUS: 需要人工确认或预算检查
    if (permission === 'dangerous') {
      const confirm = await this.askUserConfirmation({
        toolName,
        description: TOOL_DESCRIPTIONS[toolName],
        input: ctx.toolInput,
      });
      
      if (!confirm) {
        await this.auditLog({
          toolName,
          permission,
          input: ctx.toolInput,
          decision: 'denied',
          decisionReason: 'User rejected after confirmation',
        });
        return { proceed: false, error: `User rejected execution of dangerous tool: ${toolName}` };
      }
      
      return { proceed: true };
    }
    
    return { proceed: false, error: `Unknown permission level for ${toolName}` };
  }
  
  private getToolPermission(toolName: string): 'safe' | 'restricted' | 'dangerous' {
    for (const [level, tools] of Object.entries(TOOL_PERMISSIONS)) {
      if (tools.includes(toolName)) {
        return level as any;
      }
    }
    return 'safe';
  }
  
  private async auditLog(info: any): Promise<void> {
    // 保存到 SQLite
  }
  
  private async askUserConfirmation(info: any): Promise<boolean> {
    // 通过 WebSocket 或 API 询问用户
    // 在无人值守模式下，可以配置为自动拒绝或发送邮件通知
  }
}
```

#### 第四步: Hook 注册

**在 Agent 初始化时**:

```typescript
const permissionHook = new PermissionHook(auditRepository);
agent.context.hookRegistry.on('tool:before', permissionHook.handle.bind(permissionHook), {
  priority: 'highest',  // 最高优先级，在任何工具执行前运行
});
```

#### 第五步: 审计查询 API

**Server 路由**: `apps/server/src/api/audit.ts`

```typescript
// GET /audit/logs?sessionId=xxx&toolPermission=dangerous&limit=50
app.get('/audit/logs', async (c) => {
  const { sessionId, toolPermission, limit = 50, offset = 0 } = c.req.query();
  
  const logs = await auditRepository.query({
    sessionId,
    toolPermission,
    limit,
    offset,
  });
  
  return c.json({ logs, total: logs.length });
});

// GET /audit/stats?sessionId=xxx
app.get('/audit/stats', async (c) => {
  const { sessionId } = c.req.query();
  
  const stats = await auditRepository.getStats(sessionId);
  
  return c.json({
    totalActions: stats.totalActions,
    byPermission: {
      safe: stats.safeCount,
      restricted: stats.restrictedCount,
      dangerous: stats.dangerousCount,
    },
    deniedActions: stats.deniedCount,
    userConfirmedDangerous: stats.userConfirmedCount,
  });
});
```

#### 第六步: Desktop UI 集成

**新增打开权限/审计面板按钮**:

```typescript
// Desktop: Settings → Audit Log
<AuditPanel sessionId={sessionId} />

// 显示危险操作确认对话框
<ToolConfirmationDialog
  toolName="delete-file"
  description="Delete file system files permanently"
  input={{ path: "/home/user/project/src" }}
  onConfirm={() => confirmTool()}
  onDeny={() => denyTool()}
/>
```

---

### 实施时间: **2-3 天**

✅ 快速赢:
1. 工具分类 (1h)
2. 审计日志表 + Hook (4h)
3. API + Desktop UI (3h)
4. 测试 (2h)

---

## 2️⃣ 成本控制 & 预算管理 — CostBudgetCapability

### 问题

```
用户设置预算: $50/月
Agent 运行 1 天: 已消费 $48
Agent 继续运行: $50 → $102 超支 💥
```

---

### 快速改进 (1-2天)

#### 核心数据库表

```sql
-- 成本预算与消费追踪
CREATE TABLE cost_budgets (
  id TEXT PRIMARY KEY,
  session_id TEXT,  -- 会话级预算
  user_id TEXT,   -- 用户级预算
  
  budget_type TEXT,  -- 'session' | 'user' | 'daily' | 'monthly'
  hard_limit REAL,   -- 硬限制，超过自动停止
  soft_limit REAL,   -- 软限制，达到时告警
  
  current_cost REAL DEFAULT 0,
  last_alert_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(session_id, budget_type),
  UNIQUE(user_id, budget_type)
);

-- 成本消费日志
CREATE TABLE cost_logs (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  
  provider_id TEXT,
  model_id TEXT,
  workflow_phase TEXT,  -- explore | plan | execute
  tool_name TEXT,
  
  input_tokens INTEGER,
  output_tokens INTEGER,
  
  cost_input REAL,
  cost_output REAL,
  cost_total REAL,
  
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY(budget_id) REFERENCES cost_budgets(id),
  INDEX idx_session_budget (session_id, created_at)
);
```

#### CostBudgetCapability

```typescript
export class CostBudgetCapability implements AgentCapability {
  readonly name = 'cost-budget';
  
  private budgets = new Map<string, CostBudget>();
  
  /**
   * 检查成本是否超过预算
   */
  async checkBudget(input: {
    sessionId: string;
    estimatedCost: number;  // 预计消费
  }): Promise<{
    allowed: boolean;
    reason?: string;
    remainingBudget: number;
  }> {
    const budget = await this.getBudgetForSession(input.sessionId);
    
    if (!budget) {
      return { allowed: true, remainingBudget: Infinity };
    }
    
    const remaining = budget.hardLimit - budget.currentCost;
    
    if (budget.currentCost + input.estimatedCost > budget.hardLimit) {
      await this.triggerBudgetExceeded({
        sessionId: input.sessionId,
        currentCost: budget.currentCost,
        estimatedNewCost: input.estimatedCost,
        hardLimit: budget.hardLimit,
      });
      
      return {
        allowed: false,
        reason: `Budget exceeded. Current: $${budget.currentCost}, estimated: $${input.estimatedCost}, limit: $${budget.hardLimit}`,
        remainingBudget: remaining,
      };
    }
    
    if (budget.currentCost + input.estimatedCost > budget.softLimit) {
      await this.triggerBudgetWarning({
        sessionId: input.sessionId,
        currentCost: budget.currentCost,
        softLimit: budget.softLimit,
      });
    }
    
    return { allowed: true, remainingBudget: remaining - input.estimatedCost };
  }
  
  /**
   * 记录成本消费
   */
  async recordCost(input: {
    sessionId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    phase: string;
  }): Promise<void> {
    await this.repository.logCost(input);
    
    // 更新当前消费
    const budget = await this.getBudgetForSession(input.sessionId);
    if (budget) {
      budget.currentCost += input.cost;
    }
  }
  
  /**
   * 获取消费摘要
   */
  async getCostSummary(sessionId: string): Promise<{
    total: number;
    byProvider: Record<string, number>;
    byPhase: Record<string, number>;
    byModel: Record<string, number>;
  }> {
    return this.repository.summarizeCosts(sessionId);
  }
}
```

#### Hook 集成 - 在 dispatch 开始前检查

```typescript
// 在 CoordinatorCapability.dispatch() 中：
const costCap = this.context.capabilities.get('cost-budget') 
  as CostBudgetCapability;

const estimatedCost = this.estimateCostForPhase(phase);
const budgetCheck = await costCap.checkBudget({
  sessionId: options.chatId,
  estimatedCost,
});

if (!budgetCheck.allowed) {
  throw new Error(`Budget limit exceeded: ${budgetCheck.reason}`);
}
```

#### 前端显示

```typescript
// Desktop: 聊天窗口底部显示成本实时统计
<CostIndicator
  totalCost={$2.45}
  budget={$50}
  progress={(2.45 / 50) * 100 + '%'}
  byPhase={{ explore: $0.50, plan: $0.80, execute: $1.15 }}
/>
```

**实施时间**: **1-2 天**

---

## 3️⃣ 实时进度反馈 & 中间成果推送 — ProgressCapability

### 问题

```
16:32 用户: "为我的项目写测试用例"
16:33 Desktop: "处理中..." ⏳
...
17:30 "完成！" ✅
```

用户盲目等待 1 小时。

---

### 快速改进 (1-2天)

#### 进度数据表

```sql
CREATE TABLE workflow_progress (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  checkpoint_id TEXT,
  
  phase TEXT,  -- explore | plan | execute
  
  -- 进度指标
  progress_percent INTEGER,  -- 0-100
  current_step TEXT,  -- 当前执行步骤名称
  estimated_total_steps INTEGER,
  completed_steps INTEGER,
  
  -- ETA 预测
  started_at TIMESTAMP,
  estimated_completion_at TIMESTAMP,
  
  -- 中间成果
  intermediate_results LONGTEXT,  -- JSON array
  
  -- 成本追踪
  cost_so_far REAL,
  estimated_total_cost REAL,
  
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY(session_id) REFERENCES sessions(id),
  INDEX idx_session_phase (session_id, phase)
);

-- 中间成果表
CREATE TABLE intermediate_artifacts (
  id TEXT PRIMARY KEY,
  progress_id TEXT,
  
  artifact_type TEXT,  -- 'finding', 'suggestion', 'draft', 'analysis'
  title TEXT,
  content LONGTEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY(progress_id) REFERENCES workflow_progress(id)
);
```

#### ProgressCapability

```typescript
export class ProgressCapability implements AgentCapability {
  readonly name = 'progress';
  
  async updateProgress(input: {
    sessionId: string;
    phase: string;
    currentStep: string;
    progressPercent: number;
    estimatedRemaining?: number;  // 分钟
  }): Promise<void> {
    const estimatedCompletion = new Date(
      Date.now() + (input.estimatedRemaining || 5) * 60 * 1000
    );
    
    await this.repository.updateProgress({
      sessionId: input.sessionId,
      phase: input.phase,
      progressPercent: input.progressPercent,
      currentStep: input.currentStep,
      estimatedCompletionAt: estimatedCompletion,
    });
    
    // 推送 hook，前端实时更新
    this.context.hookRegistry.emit('workflow:progress-updated', {
      sessionId: input.sessionId,
      progress: input.progressPercent,
      phase: input.phase,
      currentStep: input.currentStep,
      eta: estimatedCompletion.toISOString(),
    });
  }
  
  async pushIntermediateArtifact(input: {
    sessionId: string;
    type: 'finding' | 'suggestion' | 'draft' | 'analysis';
    title: string;
    content: string;
  }): Promise<void> {
    await this.repository.addArtifact({
      sessionId: input.sessionId,
      ...input,
    });
    
    // 实时推送给前端
    this.context.hookRegistry.emit('artifact:new', {
      sessionId: input.sessionId,
      artifact: input,
    });
  }
}
```

#### 集成到工作流各阶段

```typescript
// Explore 阶段示例
const progressCap = context.capabilities.get('progress') as ProgressCapability;

for (const link of linksToExplore) {
  await progressCap.updateProgress({
    sessionId,
    phase: 'explore',
    currentStep: `Fetching: ${link}`,
    progressPercent: Math.round((current / total) * 33),  // 33% = explore phase
  });
  
  const result = await fetchAndAnalyze(link);
  
  await progressCap.pushIntermediateArtifact({
    sessionId,
    type: 'finding',
    title: extractTitle(result),
    content: result.summary,
  });
}
```

#### WebSocket 实时推送

```typescript
// Server: 当 workflow:progress-updated 发出时
hookRegistry.on('workflow:progress-updated', (event) => {
  broadcast({
    type: 'progress',
    data: event,
  });
});

// Desktop: 接收并更新 UI
ws.on('progress', (data) => {
  setProgress({
    percent: data.progress,
    phase: data.phase,
    currentStep: data.currentStep,
    eta: new Date(data.eta),
  });
});
```

#### Desktop UI

```tsx
<ProgressPanel>
  <PhaseIndicator phase="explore" percent={35} />
  <CurrentStep>{currentStep}</CurrentStep>
  <ETA>{eta.toLocaleTimeString()}</ETA>
  <IntermediateResults>
    {artifacts.map(a => (
      <ArtifactCard key={a.id} artifact={a} />
    ))}
  </IntermediateResults>
</ProgressPanel>
```

**实施时间**: **1-2 天**

---

## 📋 优先级清单

| 功能 | 优先级 | 工程时间 | 收益 |
|------|--------|---------|------|
| PermissionCapability | 🔴 HIGH | 2-3d | 无人值守安全性 |
| CostBudgetCapability | 🔴 HIGH | 1-2d | 成本可控 |
| ProgressCapability | 🟠 MEDIUM | 1-2d | 用户信心 |
| WorkflowCheckpoint | 🔴 CRITICAL | 3-4d | 可靠性 |
| LocalTaskQueue | 🟠 MEDIUM | 2-3d | 离线支持 |

---

## 🚀 建议实施顺序

**Week 1**:
1. PermissionCapability (Mon-Tue)
2. CostBudgetCapability (Wed)
3. ProgressCapability (Thu-Fri)

**Week 2**:
4. WorkflowCheckpoint (Mon-Wed)
5. LocalTaskQueue (Thu-Fri)

---

## 验收标准

### PermissionCapability ✅
- [ ] 所有工具都有权限标记
- [ ] 危险工具调用前有确认
- [ ] 所有操作都被审计记录
- [ ] 可查询审计日志

### CostBudgetCapability ✅
- [ ] 支持设置硬限制& 软限制
- [ ] 超过预算时自动停止
- [ ] 成本实时显示在 UI
- [ ] 有成本预警

### ProgressCapability ✅
- [ ] 各阶段进度百分比显示
- [ ] ETA 预测准确率 >80%
- [ ] 中间成果推送及时
- [ ] 用户满意度提升

