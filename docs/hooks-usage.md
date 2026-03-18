# Agent Hooks 使用指南

## 概述

Hooks 机制提供了一种解耦模块协作的方式，允许在关键生命周期点注册回调函数。

## Hook 类型

| Hook 类型 | 触发时机 | 用途 |
|-----------|----------|------|
| `session:start` | 会话开始 | 初始化、日志记录 |
| `session:end` | 会话结束 | 清理、统计 |
| `session:error` | 会话错误 | 错误处理、告警 |
| `tool:before` | 工具执行前 | 参数验证/修改、权限检查 |
| `tool:after` | 工具执行后 | 结果处理、格式化 |
| `capability:init` | 能力初始化 | 依赖注入、配置 |
| `capability:dispose` | 能力销毁 | 资源清理 |
| `workflow:phase` | 工作流阶段变化 | 进度跟踪、通知 |

## 基本用法

### 1. 注册 Hook

```typescript
import { Agent } from '@anthropic/claude-agent-sdk';

const agent = new Agent();

// 简单注册
agent.context.hookRegistry.on('session:start', async (ctx) => {
  console.log(`Session started: ${ctx.sessionId}`);
});

// 带优先级注册
agent.context.hookRegistry.on('tool:before', async (ctx) => {
  console.log(`Tool called: ${ctx.toolName}`);
  return { proceed: true };
}, { priority: 'high' });

// 一次性 hook
agent.context.hookRegistry.once('session:end', async (ctx) => {
  console.log(`Session ended after ${ctx.duration}ms`);
});
```

### 2. 工具监控和安全检查

```typescript
// 日志记录
agent.context.hookRegistry.on('tool:before', async (ctx) => {
  console.log(`[${new Date().toISOString()}] Tool: ${ctx.toolName}`, ctx.input);
  return { proceed: true };
});

// 安全检查（高优先级）
agent.context.hookRegistry.on('tool:before', async (ctx) => {
  if (ctx.toolName === 'Bash') {
    const command = ctx.input.command as string;
    if (command?.includes('rm -rf')) {
      return {
        proceed: false,
        error: new Error('Blocked dangerous command'),
      };
    }
  }
  return { proceed: true };
}, { priority: 'highest' });
```

### 3. 参数修改

```typescript
// 为所有 Bash 命令添加默认超时
agent.context.hookRegistry.on('tool:before', async (ctx) => {
  if (ctx.toolName === 'Bash' && !ctx.input.timeout) {
    return {
      proceed: true,
      modifiedData: {
        input: { ...ctx.input, timeout: 30000 },
      },
    };
  }
  return { proceed: true };
});
```

### 4. 工作流进度跟踪

```typescript
agent.context.hookRegistry.on('workflow:phase', async (ctx) => {
  console.log(`[${ctx.phase}] ${ctx.message}`);
  if (ctx.previousPhase) {
    console.log(`  Previous: ${ctx.previousPhase}`);
  }
});
```

### 5. 性能监控

```typescript
// 记录工具执行时间
agent.context.hookRegistry.on('tool:after', async (ctx) => {
  console.log(`Tool ${ctx.toolName} took ${ctx.duration}ms`);
  if (!ctx.success) {
    console.error(`  Error: ${ctx.error?.message}`);
  }
});
```

## 优先级

Hooks 按优先级降序执行（高优先级先执行）：

| 优先级 | 数值 |
|--------|------|
| `highest` | 100 |
| `high` | 75 |
| `normal` | 50 |
| `low` | 25 |
| `lowest` | 0 |

## 中止执行

当 hook 返回 `{ proceed: false }` 时，后续 hooks 和原始操作都不会执行：

```typescript
agent.context.hookRegistry.on('tool:before', async (ctx) => {
  if (isBlocked(ctx.toolName)) {
    return {
      proceed: false,
      error: new Error(`Tool ${ctx.toolName} is not allowed`),
    };
  }
  return { proceed: true };
}, { priority: 'highest' });
```

## 注销 Hook

```typescript
// 注册并保存 ID
const hookId = agent.context.hookRegistry.on('session:start', handler);

// 后续注销
agent.context.hookRegistry.off(hookId);
```

## 完整示例

```typescript
import { Agent } from '@anthropic/claude-agent-sdk';

async function main() {
  const agent = new Agent();

  // 1. 会话日志
  agent.context.hookRegistry.on('session:start', async (ctx) => {
    console.log(`\n=== Session Started: ${ctx.sessionId} ===`);
    if (ctx.prompt) {
      console.log(`Prompt: ${ctx.prompt.slice(0, 100)}...`);
    }
  });

  // 2. 工具安全检查
  agent.context.hookRegistry.on('tool:before', async (ctx) => {
    // 阻止危险命令
    if (ctx.toolName === 'Bash') {
      const cmd = ctx.input.command as string;
      const dangerous = ['rm -rf', 'sudo', 'mkfs'];
      if (dangerous.some(d => cmd?.includes(d))) {
        return { proceed: false, error: new Error('Blocked dangerous command') };
      }
    }
    return { proceed: true };
  }, { priority: 'highest', description: 'Security check' });

  // 3. 工具执行日志
  agent.context.hookRegistry.on('tool:before', async (ctx) => {
    console.log(`[Tool] ${ctx.toolName}`);
  });

  // 4. 性能统计
  agent.context.hookRegistry.on('tool:after', async (ctx) => {
    console.log(`[Done] ${ctx.toolName} (${ctx.duration}ms)`);
  });

  // 5. 会话结束统计
  agent.context.hookRegistry.on('session:end', async (ctx) => {
    console.log(`\n=== Session Ended ===`);
    console.log(`Success: ${ctx.success}`);
    console.log(`Duration: ${ctx.duration}ms`);
  });

  // 执行对话
  await agent.chat('Hello, world!');
}

main().catch(console.error);
```

## API 参考

### HookRegistry

| 方法 | 说明 |
|------|------|
| `on(type, handler, options?)` | 注册 hook，返回 ID |
| `once(type, handler, priority?)` | 注册一次性 hook |
| `off(id)` | 注销 hook |
| `clear(type)` | 清除指定类型的所有 hooks |
| `clearAll()` | 清除所有 hooks |
| `emit(type, context)` | 异步触发 hook |
| `emitSync(type, context)` | 同步触发 hook |
| `emitToolBefore(context)` | 触发 tool:before（支持修改） |
| `count(type)` | 获取指定类型的 hooks 数量 |
| `totalCount()` | 获取所有 hooks 总数 |
| `has(type)` | 检查是否有指定类型的 hooks |
| `getHooks(type)` | 获取指定类型的所有 hooks |
