/**
 * @hive/orchestrator - Multi-Agent Orchestration Module
 *
 * Provides:
 * - MessageBus: In-memory event-driven communication
 * - Scheduler: Agent instance pool management
 * - PluginHost: Plugin lifecycle management
 */

// Bus
export { MessageBus } from './bus/MessageBus.js';
export type {
  BusMessage,
  BusEventType,
  Subscription,
  Middleware,
  RequestContext,
  MessageBusOptions,
  MessageBusEvents
} from './bus/types.js';

// Scheduler
export { Scheduler } from './scheduler/Scheduler.js';
export { AgentPool } from './scheduler/AgentPool.js';
export type {
  AgentState,
  AgentLike,
  AgentInfo,
  SchedulerEvents,
  SchedulerOptions,
  AgentPoolStats
} from './scheduler/types.js';

// Plugins
export { PluginHost } from './plugins/PluginHost.js';
export type {
  Plugin,
  PluginInfo,
  PluginState,
  PluginContext,
  PluginLogger,
  PluginBusAccess,
  PlatformAdapter,
  PluginHostOptions,
  PluginHostEvents
} from './plugins/types.js';
