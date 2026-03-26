import { EventEmitter } from 'events';
import type { BusMessage } from '../bus/types.js';
import type { MessageBus } from '../bus/MessageBus.js';
import {
  Plugin,
  PluginInfo,
  PluginState,
  PluginHostOptions,
  PluginContext,
  PluginLogger,
  PluginBusAccess
} from './types.js';

/**
 * Plugin Host - Manages plugin lifecycle
 */
export class PluginHost extends EventEmitter {
  private plugins: Map<string, PluginInfo> = new Map();
  private readonly options: Required<PluginHostOptions>;
  private bus: MessageBus;

  constructor(bus: MessageBus, options: PluginHostOptions = {}) {
    super();
    this.bus = bus;
    this.options = {
      autoLoadDependencies: options.autoLoadDependencies ?? false,
      pluginDir: options.pluginDir ?? './plugins'
    };
  }

  /**
   * Load a plugin
   * @param plugin Plugin instance to load
   * @throws Error if plugin already loaded or dependencies missing
   */
  async load(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin already loaded: ${plugin.name}`);
    }

    // Check dependencies
    const dependencies = plugin.dependencies ?? [];
    if (dependencies.length > 0) {
      const missing = dependencies.filter(dep => !this.plugins.has(dep));
      if (missing.length > 0) {
        if (this.options.autoLoadDependencies) {
          throw new Error(`Cannot auto-load dependencies yet. Missing: ${missing.join(', ')}`);
        }
        throw new Error(`Missing dependency: ${missing.join(', ')}`);
      }
    }

    const context = this.createPluginContext(plugin);
    const info: PluginInfo = {
      name: plugin.name,
      version: plugin.version,
      state: 'loaded',
      instance: plugin,
      context,
      dependencies,
      loadedAt: Date.now()
    };

    try {
      await plugin.init(context);
      this.plugins.set(plugin.name, info);
      this.emit('plugin:loaded' as never, plugin.name);
    } catch (error) {
      info.state = 'error';
      info.error = error as Error;
      this.emit('plugin:error' as never, plugin.name, error as Error);
      throw error;
    }
  }

  /**
   * Unload a plugin
   * @param name Plugin name
   */
  async unload(name: string): Promise<void> {
    const info = this.plugins.get(name);
    if (!info) {
      throw new Error(`Plugin not found: ${name}`);
    }

    // Check if other plugins depend on this one
    const dependents = this.getDependents(name);
    if (dependents.length > 0) {
      throw new Error(`Cannot unload: ${dependents.join(', ')} depend on this plugin`);
    }

    try {
      await info.instance.destroy();
      this.plugins.delete(name);
      this.emit('plugin:unloaded' as never, name);
    } catch (error) {
      info.state = 'error';
      info.error = error as Error;
      this.emit('plugin:error' as never, name, error as Error);
      throw error;
    }
  }

  /**
   * Enable a plugin
   * @param name Plugin name
   */
  async enable(name: string): Promise<void> {
    const info = this.plugins.get(name);
    if (!info) {
      throw new Error(`Plugin not found: ${name}`);
    }

    if (info.state === 'enabled') return;

    info.state = 'enabled';
    this.emit('plugin:enabled' as never, name);
  }

  /**
   * Disable a plugin
   * @param name Plugin name
   */
  async disable(name: string): Promise<void> {
    const info = this.plugins.get(name);
    if (!info) {
      throw new Error(`Plugin not found: ${name}`);
    }

    if (info.state === 'disabled') return;

    info.state = 'disabled';
    this.emit('plugin:disabled' as never, name);
  }

  /**
   * Get plugin info
   * @param name Plugin name
   */
  get(name: string): PluginInfo | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all plugins
   */
  getAll(): PluginInfo[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugins by state
   */
  getByState(state: PluginState): PluginInfo[] {
    return this.getAll().filter(p => p.state === state);
  }

  /**
   * Get enabled plugins
   */
  getEnabled(): PluginInfo[] {
    return this.getByState('enabled');
  }

  /**
   * Check if plugin is loaded
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Dispatch message to all enabled plugins with onMessage hook
   */
  async dispatchMessage(message: BusMessage): Promise<void> {
    const enabled = this.getEnabled();
    const promises = enabled
      .filter(info => info.instance.onMessage)
      .map(info =>
        (async () => {
          try {
            await info.instance.onMessage!(message);
          } catch (error) {
            this.emit('plugin:error' as never, info.name, error as Error);
          }
        })()
      );

    await Promise.allSettled(promises);
  }

  /**
   * Notify plugins about agent start
   */
  async notifyAgentStart(agentId: string): Promise<void> {
    const enabled = this.getEnabled();
    await Promise.allSettled(
      enabled
        .filter(info => info.instance.onAgentStart)
        .map(info => info.instance.onAgentStart!(agentId))
    );
  }

  /**
   * Notify plugins about agent end
   */
  async notifyAgentEnd(agentId: string): Promise<void> {
    const enabled = this.getEnabled();
    await Promise.allSettled(
      enabled
        .filter(info => info.instance.onAgentEnd)
        .map(info => info.instance.onAgentEnd!(agentId))
    );
  }

  /**
   * Clear all plugins
   */
  async clear(): Promise<void> {
    const names = Array.from(this.plugins.keys());
    for (const name of names.reverse()) {
      await this.unload(name).catch(() => {});
    }
  }

  /**
   * Get plugins that depend on a specific plugin
   */
  private getDependents(pluginName: string): string[] {
    return this.getAll()
      .filter(info => info.dependencies.includes(pluginName))
      .map(info => info.name);
  }

  /**
   * Create plugin context
   */
  private createPluginContext(plugin: Plugin): PluginContext {
    const logger: PluginLogger = {
      debug: (msg, ...args) => console.debug(`[${plugin.name}] ${msg}`, ...args),
      info: (msg, ...args) => console.info(`[${plugin.name}] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[${plugin.name}] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[${plugin.name}] ${msg}`, ...args)
    };

    const busAccess: PluginBusAccess = {
      on: (topic, handler) => this.bus.subscribe(topic, handler),
      off: (id) => this.bus.unsubscribe(id),
      emit: (topic, payload) => this.bus.publish(topic, payload, { source: plugin.name }),
      request: (topic, payload) => this.bus.request(topic, payload)
    };

    return {
      name: plugin.name,
      version: plugin.version,
      logger,
      bus: busAccess,
      storage: new Map()
    };
  }
}
