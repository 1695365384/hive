/**
 * @hive/plugin-feishu
 *
 * 飞书消息通道插件。
 */

export { FeishuPlugin, createFeishuPlugin } from './plugin.js'
export { FeishuChannel } from './channel.js'
export type {
  FeishuAppConfig,
  FeishuPluginConfig,
  FeishuMessageEvent,
  FeishuChallengeRequest,
  FeishuChallengeResponse,
  IFeishuChannel,
} from './types.js'
