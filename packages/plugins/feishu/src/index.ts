import type { Plugin, PluginContext, BusMessage } from '@hive/orchestrator';
import type { FeishuConfig, FeishuMessage, FeishuEvent } from './types.js';
import { FeishuClient } from './Client.js';
import { MessageAdapter } from './Adapter.js';

/**
 * Feishu Plugin - Connects Hive to Feishu (Lark) platform
 *
 * This plugin:
 * - Connects to Feishu servers via WebSocket (not hosting a server)
 * - Transforms messages between Feishu and internal formats
 * - Forwards messages to the message bus
 */
export class FeishuPlugin implements Plugin {
  readonly name = 'feishu';
  readonly version = '1.0.0';

  private client: FeishuClient | null = null;
  private adapter: MessageAdapter | null = null;
  private context: PluginContext | null = null;
  private config: FeishuConfig;

  constructor(config: FeishuConfig) {
    this.config = config;
  }

  /**
   * Initialize plugin
   */
  async init(context: PluginContext): Promise<void> {
    this.context = context;

    this.client = new FeishuClient(this.config);
    this.adapter = new MessageAdapter(this.config);

    // Subscribe to Feishu events
    this.client.on('message', this.handleFeishuMessage.bind(this));

    // Connect to Feishu
    await this.client.connect();

    context.logger.info('Feishu plugin initialized');
  }

  /**
   * Destroy plugin
   */
  async destroy(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
    this.adapter = null;
    this.context?.logger.info('Feishu plugin destroyed');
  }

  /**
   * Handle incoming Feishu message
   */
  private async handleFeishuMessage(event: FeishuEvent): Promise<void> {
    if (!this.adapter || !this.context) return;

    const busMessage = this.adapter.transformIncoming(event.data);

    // Publish to message bus
    await this.context.bus.emit(busMessage.topic, busMessage.payload);

    this.context.logger.debug('Forwarded Feishu message to bus', busMessage.id);
  }

  /**
   * Handle message from bus (to send to Feishu)
   */
  async onMessage(message: BusMessage): Promise<void> {
    if (!this.client || !this.adapter) return;

    // Only handle messages destined for Feishu
    if (message.target !== 'feishu' && !message.topic.startsWith('feishu.')) {
      return;
    }

    const feishuMessage = this.adapter.transformOutgoing(message);
    await this.client.sendMessage({
      msgId: feishuMessage.msgId,
      content: feishuMessage.content
    });
  }

  /**
   * Send message to Feishu
   */
  async sendMessage(to: string, content: string): Promise<void> {
    if (!this.client || !this.context) return;

    await this.client.sendMessage({
      msgId: `out-${Date.now()}`,
      content: { text: content }
    });
  }
}

// Export types
export type { FeishuConfig, FeishuMessage, FeishuEvent, FeishuMessageType, FeishuContent } from './types.js';
export { FeishuClient } from './Client.js';
export { MessageAdapter } from './Adapter.js';
