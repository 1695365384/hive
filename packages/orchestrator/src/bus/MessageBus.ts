import { EventEmitter } from 'events';
import {
  BusMessage,
  Subscription,
  Middleware,
  RequestContext,
  MessageBusOptions
} from './types.js';

let messageIdCounter = 0;
let subscriptionIdCounter = 0;

/**
 * In-memory message bus with support for:
 * - Pub/Sub pattern
 * - Request/Response pattern
 * - Broadcast
 * - Wildcard subscriptions
 * - Middleware pipeline
 */
export class MessageBus extends EventEmitter {
  private subscriptions: Map<string, Subscription> = new Map();
  private middlewares: Middleware[] = [];
  private readonly options: Required<MessageBusOptions>;

  constructor(options: MessageBusOptions = {}) {
    super();
    this.options = {
      requestTimeout: options.requestTimeout ?? 5000,
      enableWildcards: options.enableWildcards ?? true
    };
  }

  /**
   * Subscribe to a topic
   * @param topic Topic pattern (supports wildcards like "agent:*")
   * @param handler Message handler
   * @returns Subscription ID for unsubscribing
   */
  subscribe<T = unknown>(
    topic: string,
    handler: (message: BusMessage<T>) => void | Promise<void>
  ): string {
    const id = `sub-${++subscriptionIdCounter}`;
    const subscription: Subscription = {
      id,
      topic,
      handler: handler as (message: BusMessage) => void | Promise<void>,
      active: true
    };
    this.subscriptions.set(id, subscription);
    return id;
  }

  /**
   * Unsubscribe from a topic
   * @param subscriptionId Subscription ID returned from subscribe()
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Publish a message to a topic
   * @param topic Topic name
   * @param payload Message payload
   * @param options Additional message options
   */
  async publish<T = unknown>(
    topic: string,
    payload: T,
    options?: Partial<Omit<BusMessage, 'id' | 'topic' | 'payload' | 'timestamp'>>
  ): Promise<string> {
    const message: BusMessage<T> = {
      id: `msg-${++messageIdCounter}`,
      topic,
      payload,
      source: options?.source ?? 'unknown',
      target: options?.target,
      correlationId: options?.correlationId,
      timestamp: Date.now(),
      meta: options?.meta
    };

    await this.dispatchMessage(message);
    return message.id;
  }

  /**
   * Request/Response pattern - send a request and wait for response
   * @param topic Topic to send request to
   * @param payload Request payload
   * @param timeout Timeout in milliseconds
   */
  async request<TRequest = unknown, TResponse = unknown>(
    topic: string,
    payload: TRequest,
    timeout?: number
  ): Promise<BusMessage<TResponse>> {
    const correlationId = `req-${++messageIdCounter}`;
    const actualTimeout = timeout ?? this.options.requestTimeout;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.unsubscribe(responseSubscriptionId);
        reject(new Error(`Request timeout after ${actualTimeout}ms`));
      }, actualTimeout);

      const responseTopic = `${topic}.response`;
      const responseSubscriptionId = this.subscribe<TResponse>(
        responseTopic,
        async (message) => {
          if (message.correlationId === correlationId) {
            clearTimeout(timer);
            this.unsubscribe(responseSubscriptionId);
            resolve(message);
          }
        }
      );

      // Send the request
      this.publish(topic, payload, { correlationId }).catch(reject);
    });
  }

  /**
   * Register a responder for a topic (for request/response pattern)
   * @param topic Topic to respond to
   * @param handler Response handler
   */
  respond<TRequest = unknown, TResponse = unknown>(
    topic: string,
    handler: (message: BusMessage<TRequest>) => Promise<TResponse>
  ): () => void {
    const subscriptionId = this.subscribe<TRequest>(topic, async (message) => {
      if (!message.correlationId) return;

      try {
        const response = await handler(message);
        await this.publish<TResponse>(`${topic}.response`, response, {
          correlationId: message.correlationId,
          source: 'responder'
        });
      } catch (error) {
        this.emit('error', error as Error, 'responder');
      }
    });

    // Return unsubscribe function
    return () => this.unsubscribe(subscriptionId);
  }

  /**
   * Broadcast a message to all subscribers
   * @param payload Message payload
   * @param source Source identifier
   */
  async broadcast<T = unknown>(payload: T, source?: string): Promise<string> {
    return this.publish('*', payload, { source });
  }

  /**
   * Add middleware to the pipeline
   * @param middleware Middleware function
   */
  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Remove all subscriptions and middlewares
   */
  clear(): void {
    this.subscriptions.clear();
    this.middlewares = [];
  }

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values()).filter(s => s.active);
  }

  /**
   * Dispatch message through middleware pipeline to subscribers
   */
  private async dispatchMessage(message: BusMessage): Promise<void> {
    const context: RequestContext = {
      message,
      startTime: Date.now()
    };

    // Run through middleware pipeline
    await this.runMiddleware(context, async () => {
      await this.deliverToSubscribers(message);
    });

    this.emit('message:sent', message);
  }

  /**
   * Run middleware pipeline
   */
  private async runMiddleware(context: RequestContext, final: () => Promise<void>): Promise<void> {
    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      if (i >= this.middlewares.length) {
        await final();
        return;
      }

      await this.middlewares[i](context, () => dispatch(i + 1));
    };

    await dispatch(0);
  }

  /**
   * Deliver message to matching subscribers
   */
  private async deliverToSubscribers(message: BusMessage): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const subscription of this.subscriptions.values()) {
      if (!subscription.active) continue;
      if (!this.matchesTopic(subscription.topic, message.topic)) continue;

      promises.push(
        (async () => {
          try {
            await subscription.handler(message);
          } catch (error) {
            this.emit('error', error as Error, `subscription:${subscription.id}`);
          }
        })()
      );
    }

    await Promise.all(promises);
  }

  /**
   * Check if topic pattern matches actual topic
   * Supports wildcards: "agent:*" matches "agent:started", "agent:completed", etc.
   */
  private matchesTopic(pattern: string, topic: string): boolean {
    if (pattern === '*') return true;
    if (pattern === topic) return true;

    if (this.options.enableWildcards && pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(topic);
    }

    return false;
  }
}
