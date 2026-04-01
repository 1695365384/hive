/**
 * 全局 Agent 实例和便捷函数
 */

import type { AgentInitOptions } from './types.js';
import type { DispatchOptions } from '../capabilities/ExecutionCapability.js';
import { Agent } from './Agent.js';

/** 全局 Agent 实例 */
let globalAgent: Agent | null = null;

/** 获取全局 Agent 实例 */
export function getAgent(): Agent {
  if (!globalAgent) {
    globalAgent = new Agent();
  }
  return globalAgent;
}

/** 创建新的 Agent 实例 */
export function createAgent(options: AgentInitOptions = {}): Agent {
  return new Agent(options);
}

/** 快速对话 */
export async function ask(prompt: string, options?: DispatchOptions): Promise<string> {
  return (await getAgent().dispatch(prompt, options)).text;
}
