/**
 * Plugin System Types
 */

import type { BusMessage } from '../bus/types.js';

export type PluginState = 'unloaded' | 'loaded' | 'enabled' | 'disabled' | 'error';

export interface PluginContext {
  /** Plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Logger instance */
  logger: PluginLogger;
  /** Access to message bus */
  bus: PluginBusAccess;
  /** Plugin-specific storage */
  storage: Map<string, unknown>;
}

export interface PluginLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface PluginBusAccess {
  /** Subscribe to a topic */
  on(topic: string, handler: (msg: BusMessage) => void | Promise<void>): string;
  /** Unsubscribe */
  off(subscriptionId: string): boolean;
  /** Emit a message */
  emit(topic: string, payload: unknown): Promise<string>;
  /** Request/Response */
  request<T = unknown>(topic: string, payload: unknown): Promise<BusMessage<T>>;
}

export interface Plugin {
  /** Plugin name (must be unique) */
  readonly name: string;
  /** Plugin version */
  readonly version: string;
  /** Plugin dependencies */
  readonly dependencies?: string[];
  /** Initialize plugin */
  init(context: PluginContext): Promise<void>;
  /** Destroy plugin */
  destroy(): Promise<void>;
  /** Handle incoming messages (optional) */
  onMessage?: (message: BusMessage) => void | Promise<void>;
  /** Handle agent start (optional) */
  onAgentStart?: (agentId: string) => void | Promise<void>;
  /** Handle agent end (optional) */
  onAgentEnd?: (agentId: string) => void | Promise<void>;
}

export interface PlatformAdapter extends Plugin {
  /** Platform name (e.g., "feishu", "telegram") */
  readonly platform: string;
  /** Send message to external platform */
  sendMessage(to: string, content: string): Promise<void>;
}

export interface PluginInfo {
  /** Plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Current state */
  state: PluginState;
  /** Plugin instance */
  instance: Plugin;
  /** Plugin context */
  context: PluginContext;
  /** Dependencies */
  dependencies: string[];
  /** Error if state is 'error' */
  error?: Error;
  /** Load time */
  loadedAt?: number;
}

export interface PluginHostOptions {
  /** Auto-load dependencies */
  autoLoadDependencies?: boolean;
  /** Plugin directory for local plugins */
  pluginDir?: string;
}

export interface PluginHostEvents {
  'plugin:loaded': (name: string) => void;
  'plugin:unloaded': (name: string) => void;
  'plugin:enabled': (name: string) => void;
  'plugin:disabled': (name: string) => void;
  'plugin:error': (name: string, error: Error) => void;
}
