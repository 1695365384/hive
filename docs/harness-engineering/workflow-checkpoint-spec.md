# 工作流检查点 & 恢复机制 — 规格说明

## 概述

**问题**: 无人值守长任务中，任何一个节点失败都需要从头开始，浪费大量资源和时间  
**方案**: 在 Coordinator 的三个阶段 (explore → plan → execute) 各个阶段完成时保存检查点，支持断点继续  
**目标**: 
- ✅ 单次失败后通过恢复能在 <1分钟 内快速恢复
- ✅ 避免无必要的重复计算
- ✅ 完整的任务失败审计追踪

---

## 数据模型

### 1. `workflow_checkpoint` 表（SQLite）

```sql
-- 新增表：工作流检查点
CREATE TABLE workflow_checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL UNIQUE,  -- 每个工作流唯一
  phase TEXT NOT NULL,  -- 'explore' | 'plan' | 'execute' | 'done' | 'failed'
  
  -- 阶段输出
  explore_result LONGTEXT,  -- JSON: {findings, links, summary}
  plan_result LONGTEXT,    -- JSON: {tasks, dependencies, timeline}
  execute_result LONGTEXT, -- JSON: {output, artifacts}
  
  -- 元数据
  started_at TIMESTAMP,
  checkpoint_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- 失败恢复
  last_error TEXT,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMP,
  
  -- 成本追踪
  explore_cost REAL DEFAULT 0,
  plan_cost REAL DEFAULT 0,
  execute_cost REAL DEFAULT 0,
  
  -- 资源清理标记
  worker_ids TEXT,  -- JSON array: {explore_worker_id, plan_worker_id, execute_worker_id}
  resources_cleaned BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  INDEX idx_session_phase (session_id, phase),
  INDEX idx_workflow_id (workflow_id)
);
```

### 2. TypeScript 类型

```typescript
// packages/core/src/agents/types/workflow-checkpoint.ts

export interface WorkflowCheckpoint {
  id: string;
  sessionId: string;
  workflowId: string;
  
  // 阶段状态
  phase: 'explore' | 'plan' | 'execute' | 'done' | 'failed';
  
  // 各阶段结果
  exploreResult?: {
    findings: string[];  // 发现列表
    links: string[];     // 链接池
    summary: string;     // 摘要
    rawMessages: Message[];  // 完整对话历史
  };
  
  planResult?: {
    tasks: Task[];       // 任务分解
    dependencies: string;  // markdown 格式的任务依赖图
    timeline: string;    // 预计耗时分析
    rawMessages: Message[];
  };
  
  executeResult?: {
    output: string;      // 最终输出
    artifacts: Artifact[];  // 产物列表
    logs: string;        // 执行日志
    rawMessages: Message[];
  };
  
  // 时间戳
  startedAt: Date;
  checkpointAt: Date;
  completedAt?: Date;
  lastRetryAt?: Date;
  
  // 失败信息
  lastError?: {
    code: string;
    message: string;
    timestamp: Date;
  };
  retryCount: number;
  
  // 成本
  cost: {
    explore: number;
    plan: number;
    execute: number;
    total: number;
  };
  
  // 资源
  workerIds: {
    explore?: string;
    plan?: string;
    execute?: string;
  };
  resourcesCleaned: boolean;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  dependencies: string[];  // task id
  estimatedTime: number;  // minutes
}

export interface Artifact {
  id: string;
  type: 'file' | 'text' | 'url' | 'data';
  name: string;
  content: string;
  mimeType?: string;
  size: number;
}

export interface WorkflowRecoveryOptions {
  resumeFrom?: 'explore' | 'plan' | 'execute';  // 从哪个阶段开始
  skipPhases?: string[];  // 跳过某些阶段
  useCache?: boolean;  // 是否使用已保存的阶段结果
  maxRetries?: number;  // 最大重试次数
}
```

---

## 核心实现

### 1. 新建 `WorkflowCheckpointCapability`

**文件**: `packages/core/src/agents/capabilities/WorkflowCheckpointCapability.ts`

```typescript
import type { AgentCapability, AgentContext } from '../core/types.js';
import type { WorkflowCheckpoint, WorkflowRecoveryOptions } from '../types/workflow-checkpoint.js';

export class WorkflowCheckpointCapability implements AgentCapability {
  readonly name = 'workflow-checkpoint';
  private context!: AgentContext;
  
  // 获取或创建工作流检查点
  async createCheckpoint(input: {
    sessionId: string;
    workflowId: string;
    userQuery: string;
  }): Promise<WorkflowCheckpoint> {
    // 生成唯一的 workflow_id
    // 保存到 database
  }
  
  // 完成某个阶段并保存结果
  async completePhase(input: {
    checkpointId: string;
    phase: 'explore' | 'plan' | 'execute';
    result: any;
    cost: number;
    workerId: string;
  }): Promise<void> {
    // 更新 phase 字段
    // 保存对应阶段的 result
    // 触发 hook: workflow:checkpoint-saved
  }
  
  // 标记失败并保存错误信息
  async markFailed(input: {
    checkpointId: string;
    error: Error;
    phase: string;
  }): Promise<void> {
    // 更新为 failed
    // 保存 error 信息
    // 触发 hook: workflow:failed
  }
  
  // 查询检查点供恢复使用
  async getCheckpoint(workflowId: string): Promise<WorkflowCheckpoint | null> {
    // 从 database 读取
  }
  
  // 清理资源
  async cleanupResources(workflowId: string): Promise<void> {
    // 标记为已清理
  }
  
  initialize(context: AgentContext): void {
    this.context = context;
  }
  
  dispose(): void {
    // cleanup
  }
}
```

---

### 2. 修改 `CoordinatorCapability.dispatch()`

**文件**: `packages/core/src/agents/capabilities/CoordinatorCapability.ts`

```typescript
/**
 * 统一分发 — 支持检查点恢复
 */
async dispatch(options: DispatchOptions & { 
  recoveryMode?: WorkflowRecoveryOptions;
}): Promise<DispatchResult> {
  const checkpointCap = this.context.capabilities.get('workflow-checkpoint') 
    as WorkflowCheckpointCapability;
  
  // 1. 检查是否有现有的检查点
  let checkpoint: WorkflowCheckpoint | null = null;
  if (options.recoveryMode?.resumeFrom) {
    checkpoint = await checkpointCap.getCheckpoint(options.chatId || '');
    if (checkpoint?.phase === 'done' || checkpoint?.phase === 'failed') {
      return this.handleRecovery(checkpoint, options);
    }
  } else {
    // 创建新工作流检查点
    checkpoint = await checkpointCap.createCheckpoint({
      sessionId: options.chatId || '',
      workflowId: generateWorkflowId(),
      userQuery: options.systemPrompt || '',
    });
  }
  
  const result = new DispatchResult();
  result.checkpointId = checkpoint.id;
  
  // 2. 三阶段执行，每阶段完成后保存检查点
  
  // EXPLORE 阶段
  if (!options.recoveryMode?.skipPhases?.includes('explore')) {
    const exploreResult = await this.runExplore(options, checkpoint);
    await checkpointCap.completePhase({
      checkpointId: checkpoint.id,
      phase: 'explore',
      result: exploreResult,
      cost: exploreResult.cost?.total || 0,
      workerId: exploreResult.workerId,
    });
    result.exploreOutput = exploreResult;
  } else if (checkpoint.exploreResult) {
    // 跳过 explore，使用缓存结果
    result.exploreOutput = checkpoint.exploreResult;
  }
  
  // PLAN 阶段
  try {
    if (!options.recoveryMode?.skipPhases?.includes('plan')) {
      const planResult = await this.runPlan(options, checkpoint, result.exploreOutput);
      await checkpointCap.completePhase({
        checkpointId: checkpoint.id,
        phase: 'plan',
        result: planResult,
        cost: planResult.cost?.total || 0,
        workerId: planResult.workerId,
      });
      result.planOutput = planResult;
    } else if (checkpoint.planResult) {
      result.planOutput = checkpoint.planResult;
    }
    
    // EXECUTE 阶段
    if (!options.recoveryMode?.skipPhases?.includes('execute')) {
      const executeResult = await this.runExecute(options, checkpoint, result.planOutput);
      await checkpointCap.completePhase({
        checkpointId: checkpoint.id,
        phase: 'execute',
        result: executeResult,
        cost: executeResult.cost?.total || 0,
        workerId: executeResult.workerId,
      });
      result.executeOutput = executeResult;
      result.text = executeResult.output;
    }
  } catch (error) {
    await checkpointCap.markFailed({
      checkpointId: checkpoint.id,
      error: error as Error,
      phase: result.planOutput ? 'execute' : 'plan',
    });
    throw error;
  }
  
  return result;
}

/**
 * 恢复失败的工作流
 */
private async handleRecovery(
  checkpoint: WorkflowCheckpoint,
  options: DispatchOptions
): Promise<DispatchResult> {
  const checkpointCap = this.context.capabilities.get('workflow-checkpoint') 
    as WorkflowCheckpointCapability;
  
  if (checkpoint.phase === 'failed') {
    const recoveryOptions: WorkflowRecoveryOptions = {
      resumeFrom: this.determineRecoveryPhase(checkpoint),
      maxRetries: (options.recoveryMode?.maxRetries || 0) + 1,
      useCache: true,
    };
    
    // 重新分发，从失败点之后恢复
    return this.dispatch({ ...options, recoveryMode: recoveryOptions });
  }
  
  return this.formatResult(checkpoint);
}

/**
 * 确定应该从哪个阶段开始恢复
 */
private determineRecoveryPhase(checkpoint: WorkflowCheckpoint): string {
  if (!checkpoint.exploreResult) return 'explore';
  if (!checkpoint.planResult) return 'plan';
  return 'execute';
}
```

---

### 3. 修改 `SessionRepository` 支持检查点

**文件**: `packages/core/src/storage/SessionRepository.ts`

```typescript
export interface ISessionRepository {
  // ... 现有方法 ...
  
  // 新增检查点方法
  saveCheckpoint(checkpoint: WorkflowCheckpoint): Promise<void>;
  getCheckpoint(workflowId: string): Promise<WorkflowCheckpoint | null>;
  updateCheckpointPhase(id: string, phase: string, result: any): Promise<void>;
  markCheckpointFailed(id: string, error: any): Promise<void>;
  listCheckpoints(sessionId: string, limit?: number): Promise<WorkflowCheckpoint[]>;
  deleteCheckpoint(id: string): Promise<void>;
}
```

---

## 集成点

### 1. Server 路由修改

**文件**: `apps/server/src/api/chat.ts`

```typescript
// POST /chat
app.post('/chat', async (c) => {
  const body = await c.req.json();
  const { chatId, query, recoveryMode } = body;
  
  // 支持 ?recover=true 或在 body 中指定恢复选项
  const result = await agent.dispatch({
    chatId,
    systemPrompt: query,
    recoveryMode,  // 新增参数
  });
  
  return c.json({
    ...result,
    checkpointId: result.checkpointId,  // 返回给前端用于后续恢复
  });
});

// GET /chat/:chatId/checkpoint
app.get('/chat/:chatId/checkpoint', async (c) => {
  const workflowId = c.req.query('workflowId');
  const checkpoint = await sessionRepo.getCheckpoint(workflowId);
  
  return c.json({
    checkpoint,
    recoveryPhase: checkpoint ? 
      ['explore', 'plan', 'execute'][
        [checkpoint.exploreResult, checkpoint.planResult, checkpoint.executeResult]
          .filter(Boolean).length
      ] : null,
  });
});
```

### 2. Desktop UI 集成

**文件**: `apps/desktop/src/pages/ChatPage.tsx`

```typescript
const handleTaskSubmit = async (query: string) => {
  // 检查是否有现有的未完成工作流
  const lastCheckpoint = await checkAPI(`/chat/${sessionId}/checkpoint`);
  
  if (lastCheckpoint?.checkpoint && lastCheckpoint.checkpoint.phase !== 'done') {
    // 弹出对话框
    const userChoice = await showRecoveryDialog({
      checkpoint: lastCheckpoint.checkpoint,
      phase: lastCheckpoint.recoveryPhase,
    });
    
    if (userChoice === 'resume') {
      // 恢复执行
      await submitChat(query, {
        recoveryMode: {
          resumeFrom: lastCheckpoint.recoveryPhase,
          useCache: true,
        },
      });
    } else if (userChoice === 'restart') {
      // 重新开始
      await submitChat(query);
    }
  } else {
    await submitChat(query);
  }
};
```

---

## Hook 事件

新增 hook 事件用于前端実时反馈：

```typescript
// workflow:checkpoint-created
emit('workflow:checkpoint-created', {
  checkpointId: string;
  workflowId: string;
  phase: string;
});

// workflow:phase-completed
emit('workflow:phase-completed', {
  checkpointId: string;
  phase: 'explore' | 'plan' | 'execute';
  result: any;
  cost: number;
  duration: number;
});

// workflow:phase-failed
emit('workflow:phase-failed', {
  checkpointId: string;
  phase: string;
  error: string;
  retryable: boolean;
  suggestedRecovery: 'retry' | 'resume' | 'restart';
});

// workflow:recovery-started
emit('workflow:recovery-started', {
  checkpointId: string;
  resumeFrom: string;
  retryAttempt: number;
});
```

---

## 测试用例

**文件**: `packages/core/tests/integration/workflow-checkpoint.test.ts`

```typescript
describe('WorkflowCheckpoint — 任务恢复', () => {
  
  it('should save checkpoint after explore phase', async () => {
    // ...
  });
  
  it('should recover from failed plan phase', async () => {
    // ...
  });
  
  it('should skip completed phases on recovery', async () => {
    // ...
  });
  
  it('should track cost per phase', async () => {
    // ...
  });
  
  it('should cleanup resources after workflow done', async () => {
    // ...
  });
});
```

---

## 预期收益

| 指标 | 优化前 | 优化后 |
|------|-------|-------|
| **单次失败重试率** | 100% (全部重来) | <10% (仅重试失败阶段) |
| **失败恢复时间** | 完整流程时间 | <1分钟 + 从检查点继续 |
| **资源浪费** | 30-40% (重复计算) | <5% |
| **用户体验** | "又要等1小时" | "只需再等5分钟" |
| **成本效率** | 低 (重复消耗 token) | 高 (复用检查点) |

