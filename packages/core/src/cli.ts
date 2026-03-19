/**
 * CLI 入口 - 快速测试 Agent 能力
 *
 * 启动：npm run cli
 * 调试模式：DEBUG=1 npm run cli
 */

import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAgent } from './agents/index.js';
import type { ThoroughnessLevel } from './agents/types.js';

// 调试模式
const DEBUG = process.env.DEBUG === '1' || process.argv.includes('--debug');

function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.log('\x1b[90m[DEBUG]\x1b[0m', ...args);
  }
}

function log(...args: unknown[]): void {
  console.log(...args);
}

function logPhase(phase: string, message: string): void {
  const timestamp = new Date().toISOString().substring(11, 19);
  console.log(`\x1b[36m[${timestamp}][${phase}]\x1b[0m ${message}`);
}

function logSuccess(message: string): void {
  console.log(`\x1b[32m✅ ${message}\x1b[0m`);
}

function logError(message: string, error?: Error): void {
  console.log(`\x1b[31m❌ ${message}\x1b[0m`);
  if (error && DEBUG) {
    console.log('\x1b[31m堆栈信息:\x1b[0m', error.stack);
  }
}

function logInfo(message: string): void {
  console.log(`\x1b[34mℹ️  ${message}\x1b[0m`);
}

type CliMode = 'chat' | 'explore' | 'plan' | 'general' | 'workflow';

interface CliState {
  mode: CliMode;
  cwd: string;
  stream: boolean;
  thoroughness: ThoroughnessLevel;
  verbose: boolean;
}

const agent = getAgent();

const state: CliState = {
  mode: 'workflow',
  cwd: process.cwd(),
  stream: true,
  thoroughness: 'medium',
  verbose: true,
};

function printBanner(): void {
  console.log('\n🤖 Claude Agent CLI 已启动\n');

  // 显示提供商信息
  const provider = agent.currentProvider;
  if (provider) {
    logSuccess(`当前提供商: ${provider.name}`);
    debug('提供商详情:', {
      id: provider.id,
      baseUrl: provider.baseUrl,
      model: provider.model,
      hasApiKey: !!provider.apiKey,
    });
  } else {
    logError('未找到提供商配置');
    logInfo('请确保 providers.json 配置正确或设置环境变量');
  }

  // 显示 CC-Switch 状态
  if (agent.isCCSwitchInstalled()) {
    logInfo('CC-Switch 已安装');
  } else {
    debug('CC-Switch 未安装，使用本地配置或环境变量');
  }

  console.log('\n命令: 直接输入任务 | /help 帮助 | /exit 退出\n');
  printState();
}

function printState(): void {
  console.log(`\x1b[2m当前: mode=${state.mode}, verbose=${state.verbose}, cwd=${state.cwd}\x1b[0m\n`);
}

function printHelp(): void {
  console.log(`
可用命令：
  /help                              显示帮助
  /exit                              退出
  /loop <task>                       执行一次 workflow
  /mode <chat|explore|plan|general|workflow>
                                     切换执行模式
  /verbose <on|off>                  详细日志开关
  /debug                             显示调试信息
  /provider <name> [apiKey]          切换提供商
  /providers                         列出可用提供商
  /status                            显示详细状态
  /state                             查看当前状态
`);
}

function parseCommand(input: string): { cmd: string; args: string[] } {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  return {
    cmd: parts[0].toLowerCase(),
    args: parts.slice(1),
  };
}

async function runWithCwd<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd();
  const targetCwd = resolve(cwd);

  if (!existsSync(targetCwd) || !statSync(targetCwd).isDirectory()) {
    throw new Error(`工作目录不存在或不是目录: ${targetCwd}`);
  }

  debug(`切换工作目录: ${originalCwd} -> ${targetCwd}`);
  process.chdir(targetCwd);
  try {
    return await fn();
  } finally {
    process.chdir(originalCwd);
  }
}

async function executePrompt(prompt: string): Promise<void> {
  const trimmed = prompt.trim();
  if (!trimmed) return;

  // 显示执行前的信息
  const provider = agent.currentProvider;
  logPhase('START', `任务: ${trimmed.substring(0, 50)}${trimmed.length > 50 ? '...' : ''}`);

  if (provider) {
    debug(`使用提供商: ${provider.name} (${provider.baseUrl})`);
  }

  const startTime = Date.now();

  try {
    switch (state.mode) {
      case 'chat': {
        if (state.stream) {
          await runWithCwd(state.cwd, async () => {
            process.stdout.write('\n\x1b[33mAssistant>\x1b[0m ');
            await agent.chatStream(trimmed, {
              cwd: state.cwd,
              onText: (text) => process.stdout.write(text),
              onTool: (tool) => {
                if (state.verbose) logPhase('TOOL', tool);
              },
            });
            process.stdout.write('\n\n');
          });
        } else {
          const result = await runWithCwd(state.cwd, async () => {
            return agent.chat(trimmed, { cwd: state.cwd });
          });
          console.log(`\n\x1b[33mAssistant>\x1b[0m ${result}\n`);
        }
        break;
      }

      case 'explore': {
        logPhase('EXPLORE', `thoroughness: ${state.thoroughness}`);
        const result = await runWithCwd(state.cwd, async () => {
          return agent.explore(trimmed, state.thoroughness);
        });
        console.log(`\n\x1b[33mAssistant (explore)>\x1b[0m ${result}\n`);
        break;
      }

      case 'plan': {
        logPhase('PLAN', '研究代码库...');
        const result = await runWithCwd(state.cwd, async () => {
          return agent.plan(trimmed);
        });
        console.log(`\n\x1b[33mAssistant (plan)>\x1b[0m ${result}\n`);
        break;
      }

      case 'general': {
        logPhase('GENERAL', '执行任务...');
        const result = await runWithCwd(state.cwd, async () => {
          return agent.general(trimmed);
        });
        console.log(`\n\x1b[33mAssistant (general)>\x1b[0m ${result}\n`);
        break;
      }

      case 'workflow': {
        console.log('');
        const phases: string[] = [];
        const toolCalls: string[] = [];
        let currentPhase = '';

        const result = await runWithCwd(state.cwd, async () => {
          return agent.runWorkflow(trimmed, {
            cwd: state.cwd,
            onPhase: (phase, message) => {
              phases.push(phase);
              currentPhase = phase;
              logPhase(phase.toUpperCase(), message);
            },
            onTool: (tool) => {
              toolCalls.push(tool);
              if (state.verbose) {
                const timestamp = new Date().toISOString().substring(11, 19);
                console.log(`  \x1b[35m[${timestamp}][TOOL]\x1b[0m ${tool}`);
              }
            },
            onText: (text) => {
              if (currentPhase === 'execute') {
                process.stdout.write(text);
              }
            },
          });
        });

        const duration = Date.now() - startTime;

        console.log('\n');
        console.log('\x1b[2m──────────────────────────────────────\x1b[0m');

        if (!result.success) {
          logError(`Workflow 执行失败: ${result.error || '未知错误'}`);
          if (result.exploreResult?.error) {
            logError(`探索错误: ${result.exploreResult.error}`);
          }
          if (result.executeResult?.error) {
            logError(`执行错误: ${result.executeResult.error}`);
          }
        } else {
          logSuccess('Workflow 执行成功');
        }

        // 显示执行摘要
        console.log('\n\x1b[1m📊 执行摘要\x1b[0m');
        console.log(`  任务类型: ${result.analysis.type}`);
        console.log(`  需要探索: ${result.analysis.needsExploration ? '是' : '否'}`);
        console.log(`  需要计划: ${result.analysis.needsPlanning ? '是' : '否'}`);
        console.log(`  推荐Agent: ${result.analysis.recommendedAgents.join(', ') || '(无)'}`);
        console.log(`  执行阶段: ${phases.join(' → ')}`);
        console.log(`  工具调用: ${toolCalls.length} 次`);
        console.log(`  耗时: ${(duration / 1000).toFixed(2)}s`);

        if (toolCalls.length > 0 && state.verbose) {
          console.log(`\n\x1b[1m🔧 工具调用详情\x1b[0m`);
          const toolCounts: Record<string, number> = {};
          for (const tool of toolCalls) {
            toolCounts[tool] = (toolCounts[tool] || 0) + 1;
          }
          for (const [tool, count] of Object.entries(toolCounts)) {
            console.log(`  ${tool}: ${count} 次`);
          }
        }

        console.log('\x1b[2m──────────────────────────────────────\x1b[0m\n');

        const finalText = result.executeResult?.text || result.exploreResult?.text || '';
        if (finalText) {
          console.log(`\x1b[33m📝 结果:\x1b[0m ${finalText.substring(0, 200)}${finalText.length > 200 ? '...' : ''}\n`);
        }
        break;
      }
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logError(`执行失败: ${err.message}`, err);
    debug('错误详情:', err);
  }
}

async function handleCommand(line: string): Promise<boolean> {
  const { cmd, args } = parseCommand(line);

  switch (cmd) {
    case '/help':
      printHelp();
      return true;

    case '/exit':
    case '/quit':
      return false;

    case '/debug': {
      console.log('\n\x1b[1m🔍 调试信息\x1b[0m');
      const provider = agent.currentProvider;
      if (provider) {
        console.log('当前提供商:');
        console.log(`  ID: ${provider.id}`);
        console.log(`  名称: ${provider.name}`);
        console.log(`  Base URL: ${provider.baseUrl}`);
        console.log(`  API Key: ${provider.apiKey ? provider.apiKey.substring(0, 10) + '...' : '(未设置)'}`);
        console.log(`  Model: ${provider.model || '(默认)'}`);
      } else {
        console.log('  未配置提供商');
      }
      console.log(`\nCC-Switch: ${agent.isCCSwitchInstalled() ? '已安装' : '未安装'}`);
      console.log(`工作目录: ${state.cwd}`);
      console.log('');
      return true;
    }

    case '/status': {
      console.log('\n\x1b[1m📊 系统状态\x1b[0m');
      console.log(`模式: ${state.mode}`);
      console.log(`详细日志: ${state.verbose ? '开启' : '关闭'}`);
      console.log(`调试模式: ${DEBUG ? '开启' : '关闭'}`);
      console.log(`工作目录: ${state.cwd}`);

      const provider = agent.currentProvider;
      if (provider) {
        console.log(`\n当前提供商: ${provider.name}`);
        console.log(`  Base URL: ${provider.baseUrl}`);
        console.log(`  Model: ${provider.model || '(默认)'}`);
      }
      console.log('');
      return true;
    }

    case '/loop': {
      const task = args.join(' ').trim();
      if (!task) {
        console.log('❌ 请提供任务，例如: /loop 分析这个项目');
        return true;
      }
      const originalMode = state.mode;
      state.mode = 'workflow';
      await executePrompt(task);
      state.mode = originalMode;
      return true;
    }

    case '/mode': {
      const mode = args[0] as CliMode | undefined;
      if (!mode || !['chat', 'explore', 'plan', 'general', 'workflow'].includes(mode)) {
        console.log('❌ mode 无效，可选: chat | explore | plan | general | workflow');
        return true;
      }
      state.mode = mode;
      logInfo(`模式已切换: ${mode}`);
      return true;
    }

    case '/verbose': {
      const value = args[0]?.toLowerCase();
      if (!value || !['on', 'off'].includes(value)) {
        console.log(`当前: verbose=${state.verbose ? 'on' : 'off'}`);
        return true;
      }
      state.verbose = value === 'on';
      logInfo(`详细日志: ${state.verbose ? '开启' : '关闭'}`);
      return true;
    }

    case '/stream': {
      const value = args[0]?.toLowerCase();
      if (!value || !['on', 'off'].includes(value)) {
        console.log('❌ stream 无效，可选: on | off');
        return true;
      }
      state.stream = value === 'on';
      printState();
      return true;
    }

    case '/thoroughness': {
      const value = args[0] as ThoroughnessLevel | undefined;
      if (!value || !['quick', 'medium', 'very-thorough'].includes(value)) {
        console.log('❌ thoroughness 无效，可选: quick | medium | very-thorough');
        return true;
      }
      state.thoroughness = value;
      printState();
      return true;
    }

    case '/cwd': {
      const nextCwd = args.join(' ').trim();
      if (!nextCwd) {
        console.log('❌ 请提供路径，例如: /cwd ./src');
        return true;
      }
      const resolved = resolve(nextCwd);
      if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
        console.log(`❌ 目录不存在: ${resolved}`);
        return true;
      }
      state.cwd = resolved;
      printState();
      return true;
    }

    case '/provider': {
      const name = args[0];
      const apiKey = args[1];
      if (!name) {
        console.log('❌ 请提供 provider 名称，例如: /provider glm');
        return true;
      }
      const ok = agent.useProvider(name, apiKey);
      if (ok) {
        logSuccess(`已切换 provider: ${name}`);
        const newProvider = agent.currentProvider;
        if (newProvider) {
          debug(`Base URL: ${newProvider.baseUrl}`);
        }
      } else {
        logError(`切换 provider 失败: ${name}`);
      }
      return true;
    }

    case '/providers': {
      const providers = agent.listProviders();
      if (providers.length === 0) {
        console.log('暂无可用 provider');
        return true;
      }

      console.log('\n\x1b[1m📋 可用提供商\x1b[0m\n');
      for (const p of providers) {
        const active = agent.currentProvider?.id === p.id;
        const hasKey = !!p.apiKey;
        const keyStatus = hasKey ? '🔑' : '⚠️ 无Key';
        const activeMarker = active ? '\x1b[32m (active)\x1b[0m' : '';
        console.log(`  ${active ? '●' : '○'} ${p.name}${activeMarker} ${keyStatus}`);
        if (DEBUG || state.verbose) {
          console.log(`    └─ ${p.baseUrl}`);
        }
      }
      console.log('');
      return true;
    }

    case '/state':
      printState();
      return true;

    default:
      console.log('❌ 未知命令，输入 /help 查看可用命令。');
      return true;
  }
}

async function main(): Promise<void> {
  printBanner();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const line = await rl.question('\x1b[32mYou>\x1b[0m ');
      const trimmed = line.trim();

      if (!trimmed) continue;

      if (trimmed.startsWith('/')) {
        const shouldContinue = await handleCommand(trimmed);
        if (!shouldContinue) break;
        continue;
      }

      await executePrompt(trimmed);
    }
  } finally {
    rl.close();
  }

  console.log('\n👋 已退出 CLI\n');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CLI 启动失败: ${message}`);
  if (DEBUG && error instanceof Error) {
    console.error(error.stack);
  }
  process.exit(1);
});
