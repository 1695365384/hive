import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageBus } from '../../src/bus/MessageBus.js';
import type { BusMessage, Middleware } from '../../src/bus/types.js';

describe('MessageBus', () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  afterEach(() => {
    bus.clear();
  });

  describe('subscribe/publish', () => {
    it('should subscribe to a topic and receive messages', async () => {
      const handler = vi.fn();
      bus.subscribe('test.topic', handler);

      await bus.publish('test.topic', { data: 'hello' });

      expect(handler).toHaveBeenCalledTimes(1);
      const call = handler.mock.calls[0][0] as BusMessage;
      expect(call.topic).toBe('test.topic');
      expect(call.payload).toEqual({ data: 'hello' });
    });

    it('should support multiple subscribers on same topic', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.subscribe('test.topic', handler1);
      bus.subscribe('test.topic', handler2);

      await bus.publish('test.topic', { data: 'hello' });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should not receive messages after unsubscribe', async () => {
      const handler = vi.fn();
      const subId = bus.subscribe('test.topic', handler);

      await bus.publish('test.topic', { data: 'first' });
      expect(handler).toHaveBeenCalledTimes(1);

      bus.unsubscribe(subId);
      await bus.publish('test.topic', { data: 'second' });
      expect(handler).toHaveBeenCalledTimes(1); // Still 1
    });
  });

  describe('wildcard subscriptions', () => {
    it('should match wildcard patterns', async () => {
      const handler = vi.fn();
      bus.subscribe('agent:*', handler);

      await bus.publish('agent:started', { id: '1' });
      await bus.publish('agent:completed', { id: '2' });
      await bus.publish('other:event', { id: '3' });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should match * to all topics', async () => {
      const handler = vi.fn();
      bus.subscribe('*', handler);

      await bus.publish('any.topic', {});
      await bus.publish('another.one', {});

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('request/response', () => {
    it('should support request/response pattern', async () => {
      // Register responder
      bus.respond('math.add', async (msg) => {
        const { a, b } = msg.payload as { a: number; b: number };
        return { result: a + b };
      });

      // Send request
      const response = await bus.request<{ a: number; b: number }, { result: number }>(
        'math.add',
        { a: 2, b: 3 }
      );

      expect(response.payload).toEqual({ result: 5 });
    });

    it('should timeout if no response', async () => {
      await expect(
        bus.request('no.responder', {}, 100)
      ).rejects.toThrow('Request timeout');
    });
  });

  describe('middleware', () => {
    it('should run middleware before handlers', async () => {
      const order: string[] = [];

      bus.use(async (ctx, next) => {
        order.push('middleware1');
        await next();
      });

      bus.use(async (ctx, next) => {
        order.push('middleware2');
        await next();
      });

      bus.subscribe('test', () => {
        order.push('handler');
      });

      await bus.publish('test', {});

      expect(order).toEqual(['middleware1', 'middleware2', 'handler']);
    });

    it('should allow middleware to modify context', async () => {
      const logger: Middleware = async (ctx, next) => {
        (ctx as any).customData = 'modified';
        await next();
      };

      bus.use(logger);

      let receivedContext: any;
      bus.subscribe('test', (msg) => {
        receivedContext = msg;
      });

      await bus.publish('test', {});

      // Middleware should have run
      expect(receivedContext).toBeDefined();
    });
  });

  describe('events', () => {
    it('should emit message:sent event', async () => {
      const handler = vi.fn();
      bus.on('message:sent', handler);

      await bus.publish('test', {});

      expect(handler).toHaveBeenCalled();
    });

    it('should emit error event on handler failure', async () => {
      const errorHandler = vi.fn();
      bus.on('error', errorHandler);

      bus.subscribe('test', () => {
        throw new Error('Handler failed');
      });

      await bus.publish('test', {});

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should remove all subscriptions and middleware', async () => {
      const handler = vi.fn();
      bus.subscribe('test', handler);
      bus.use(async (ctx, next) => await next());

      bus.clear();

      await bus.publish('test', {});
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
