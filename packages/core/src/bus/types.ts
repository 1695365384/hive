/**
 * Message Bus Types
 */

export interface BusMessage<T = unknown> {
  /** Unique message ID */
  id: string;
  /** Topic/channel name */
  topic: string;
  /** Message payload */
  payload: T;
  /** Source identifier (agent, plugin, etc.) */
  source: string;
  /** Target identifier (optional, for directed messages) */
  target?: string;
  /** Correlation ID for request/response patterns */
  correlationId?: string;
  /** Message timestamp */
  timestamp: number;
  /** Metadata */
  meta?: Record<string, unknown>;
}

export type BusEventType = 'message' | 'error' | 'close';

export interface Subscription {
  /** Subscription ID */
  id: string;
  /** Topic pattern (supports wildcards like "agent:*") */
  topic: string;
  /** Handler function */
  handler: (message: BusMessage) => void | Promise<void>;
  /** Whether this subscription is active */
  active: boolean;
}

export interface RequestContext {
  /** The original message */
  message: BusMessage;
  /** Timestamp when request started */
  startTime: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export type Middleware = (
  context: RequestContext,
  next: () => Promise<void>
) => Promise<void>;

export interface MessageBusOptions {
  /** Default timeout for request/response (ms) */
  requestTimeout?: number;
  /** Enable wildcard topic matching */
  enableWildcards?: boolean;
}

export interface MessageBusEvents {
  'message:received': (msg: BusMessage) => void;
  'message:sent': (msg: BusMessage) => void;
  error: (error: Error, context?: string) => void;
}
