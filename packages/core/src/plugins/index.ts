/**
 * Hive Plugin System
 *
 * 提供插件和通道的标准接口定义。
 */

export {
  // 通道消息类型
  type ChannelMessage,
  type ChannelMessageType,
  type ChannelMessageSender,
  type ChannelMessageRecipient,

  // 通道发送
  type ChannelSendOptions,
  type ChannelSendResult,

  // 通道接口
  type ChannelCapabilities,
  type IChannel,

  // 插件上下文
  type IMessageBus,
  type ILogger,
  type PluginContext,

  // 插件接口
  type PluginMetadata,
  type IPlugin,

  // 插件加载
  type PluginLoadOptions,
  type IPluginLoader,
} from './types.js'
