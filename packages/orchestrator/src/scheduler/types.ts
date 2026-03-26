/**
 * Scheduler Types
 */

import type { BusMessage } from '../bus/types.js';

export type AgentState = 'idle' | 'busy' | 'error' | 'offline';

/**
 * Minimal Agent interface for scheduler
 * This decouples orchestrator from @hive/core
 */
export interface AgentLike {
  /** Agent unique identifier */
  id?: string;
  /** Session context */
  context?: {
    sessionId?: string;
  };
  /** Chat method for sending messages */
  chat?: (prompt: string) => Promise<unknown>;
  /** Alternative message handler */
  sendMessage?: (msg: unknown) => Promise<unknown>;
}

export interface AgentInfo {
  /** Agent unique identifier */
  id: string;
  /** Agent name */
  name?: string;
  /** Current state */
  state: AgentState;
  /** Agent instance reference */
  agent: AgentLike;
  /** Registration timestamp */
  registeredAt: number;
  /** Last activity timestamp */
  lastActivity?: number;
  /** Error info if state is 'error' */
  error?: Error;
  /** Custom metadata */
  meta?: Record<string, unknown>;
}

export interface SchedulerEvents {
  'agent:registered': (info: AgentInfo) => void;
  'agent:unregistered': (agentId: string) => void;
  'agent:state-change': (agentId: string, oldState: AgentState, newState: AgentState) => void;
  'message:routed': (agentId: string, messageId: string) => void;
  'message:broadcast': (messageId: string, agentCount: number) => void;
  'error': (error: Error, context?: string) => void;
}

export interface SchedulerOptions {
  /** Max concurrent tasks per agent */
  maxConcurrentPerAgent?: number;
  /** Agent idle timeout (ms) before marking as offline */
  idleTimeout?: number;
  /** Enable auto state management */
  autoStateManagement?: boolean;
}

export interface AgentPoolStats {
  total: number;
  idle: number;
  busy: number;
  error: number;
  offline: number;
}

// Re-export BusMessage for scheduler to use
export type { BusMessage };
