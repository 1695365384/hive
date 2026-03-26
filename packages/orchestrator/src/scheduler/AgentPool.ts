import type { AgentLike, AgentInfo, AgentState, AgentPoolStats } from './types.js';

/**
 * Agent Pool - Manages a collection of Agent instances
 */
export class AgentPool {
  private agents: Map<string, AgentInfo> = new Map();

  /**
   * Add an agent to the pool
   * @throws Error if agent with same ID already exists
   */
  add(agent: AgentLike, options?: { name?: string; meta?: Record<string, unknown> }): AgentInfo {
    const agentId = this.getAgentId(agent);

    if (this.agents.has(agentId)) {
      throw new Error(`Agent already registered: ${agentId}`);
    }

    const info: AgentInfo = {
      id: agentId,
      name: options?.name,
      state: 'idle',
      agent,
      registeredAt: Date.now(),
      meta: options?.meta
    };

    this.agents.set(agentId, info);
    return info;
  }

  /**
   * Remove an agent from the pool
   * @returns true if agent was removed, false if not found
   */
  remove(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  /**
   * Get agent info by ID
   */
  get(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents in the pool
   */
  getAll(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by state
   */
  getByState(state: AgentState): AgentInfo[] {
    return this.getAll().filter(info => info.state === state);
  }

  /**
   * Get idle agents
   */
  getIdle(): AgentInfo[] {
    return this.getByState('idle');
  }

  /**
   * Update agent state
   */
  updateState(agentId: string, state: AgentState, error?: Error): boolean {
    const info = this.agents.get(agentId);
    if (!info) return false;

    info.state = state;
    info.lastActivity = Date.now();
    if (error) {
      info.error = error;
    }
    return true;
  }

  /**
   * Get pool statistics
   */
  getStats(): AgentPoolStats {
    const agents = this.getAll();
    return {
      total: agents.length,
      idle: agents.filter(a => a.state === 'idle').length,
      busy: agents.filter(a => a.state === 'busy').length,
      error: agents.filter(a => a.state === 'error').length,
      offline: agents.filter(a => a.state === 'offline').length
    };
  }

  /**
   * Check if agent exists
   */
  has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * Clear all agents from pool
   */
  clear(): void {
    this.agents.clear();
  }

  /**
   * Get pool size
   */
  get size(): number {
    return this.agents.size;
  }

  /**
   * Extract agent ID from agent instance
   */
  private getAgentId(agent: AgentLike): string {
    if (agent.id) {
      return agent.id;
    }
    if (agent.context?.sessionId) {
      return agent.context.sessionId;
    }
    // Fallback to a generated ID based on instance
    return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
