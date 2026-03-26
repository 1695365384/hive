import { EventEmitter } from 'events';
import type { AgentLike, AgentInfo, AgentState, SchedulerOptions, BusMessage } from './types.js';
import { AgentPool } from './AgentPool.js';

/**
 * Scheduler - Manages Agent instances and routes messages
 */
export class Scheduler extends EventEmitter {
  private pool: AgentPool;
  private readonly options: Required<SchedulerOptions>;

  constructor(options: SchedulerOptions = {}) {
    super();
    this.pool = new AgentPool();
    this.options = {
      maxConcurrentPerAgent: options.maxConcurrentPerAgent ?? 1,
      idleTimeout: options.idleTimeout ?? 300000, // 5 minutes
      autoStateManagement: options.autoStateManagement ?? true
    };
  }

  /**
   * Register an agent to the scheduler
   * @param agent Agent instance to register
   * @param options Registration options
   * @returns Agent info
   * @throws Error if agent already registered
   */
  register(agent: AgentLike, options?: { name?: string; meta?: Record<string, unknown> }): AgentInfo {
    const info = this.pool.add(agent, options);
    this.emit('agent:registered', info);
    return info;
  }

  /**
   * Unregister an agent from the scheduler
   * @param agentId Agent ID to unregister
   * @returns true if agent was unregistered
   */
  unregister(agentId: string): boolean {
    const removed = this.pool.remove(agentId);
    if (removed) {
      this.emit('agent:unregistered', agentId);
    }
    return removed;
  }

  /**
   * Dispatch a message to a specific agent
   * @param message Message to dispatch (must have target field)
   * @throws Error if target agent not found
   */
  async dispatch(message: BusMessage): Promise<void> {
    if (!message.target) {
      throw new Error('Message must have a target for dispatch');
    }

    const info = this.pool.get(message.target);
    if (!info) {
      const error = new Error(`Agent not found: ${message.target}`);
      this.emit('error', error, 'dispatch');
      throw error;
    }

    // Update state to busy if auto management enabled
    if (this.options.autoStateManagement) {
      this.updateAgentState(info.id, 'busy');
    }

    try {
      // Route message to agent
      await this.routeToAgent(info, message);
      this.emit('message:routed', info.id, message.id);
    } catch (error) {
      if (this.options.autoStateManagement) {
        this.updateAgentState(info.id, 'error', error as Error);
      }
      throw error;
    } finally {
      // Return to idle if still busy
      if (this.options.autoStateManagement && info.state === 'busy') {
        this.updateAgentState(info.id, 'idle');
      }
    }
  }

  /**
   * Broadcast a message to all agents
   * @param message Message to broadcast
   */
  async broadcast(message: BusMessage): Promise<void> {
    const agents = this.pool.getAll();
    const promises = agents.map(info => this.routeToAgent(info, message));
    await Promise.allSettled(promises);
    this.emit('message:broadcast', message.id, agents.length);
  }

  /**
   * Get agent info by ID
   */
  getAgent(agentId: string): AgentInfo | undefined {
    return this.pool.get(agentId);
  }

  /**
   * Get all registered agents
   */
  getAgents(): AgentInfo[] {
    return this.pool.getAll();
  }

  /**
   * Get all idle agents
   */
  getIdleAgents(): AgentInfo[] {
    return this.pool.getIdle();
  }

  /**
   * Get agents by state
   */
  getAgentsByState(state: AgentState): AgentInfo[] {
    return this.pool.getByState(state);
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return this.pool.getStats();
  }

  /**
   * Update agent state manually
   */
  setAgentState(agentId: string, state: AgentState, error?: Error): boolean {
    return this.updateAgentState(agentId, state, error);
  }

  /**
   * Clear all agents
   */
  clear(): void {
    this.pool.clear();
  }

  /**
   * Get pool size
   */
  get size(): number {
    return this.pool.size;
  }

  /**
   * Update agent state and emit event
   */
  private updateAgentState(agentId: string, state: AgentState, error?: Error): boolean {
    const info = this.pool.get(agentId);
    if (!info) return false;

    const oldState = info.state;
    const updated = this.pool.updateState(agentId, state, error);
    if (updated && oldState !== state) {
      this.emit('agent:state-change', agentId, oldState, state);
    }
    return updated;
  }

  /**
   * Route message to a specific agent
   */
  private async routeToAgent(info: AgentInfo, message: BusMessage): Promise<void> {
    const agent = info.agent;

    // Try different methods to send message to agent
    if (typeof agent.chat === 'function') {
      const payload = message.payload as { content?: string; text?: string };
      const prompt = payload?.content ?? payload?.text ?? JSON.stringify(message.payload);
      await agent.chat(prompt);
    } else if (typeof agent.sendMessage === 'function') {
      await agent.sendMessage(message);
    } else {
      // Agent doesn't have a compatible method
      throw new Error(`Agent ${info.id} has no compatible message handler`);
    }
  }
}
