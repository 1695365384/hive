/**
 * @hive/plugin-feishu
 *
 * 飞书消息通道插件。
 *
 * 用法：
 *   import { FeishuPlugin } from '@hive/plugin-feishu'
 *   const plugin = new FeishuPlugin({ apps: [{ appId: '...', appSecret: '...' }] })
 */

export { FeishuPlugin } from './plugin.js'
export { FeishuPlugin as default } from './plugin.js'
export { FeishuChannel } from './channel.js'
export type {
  FeishuAppConfig,
  FeishuPluginConfig,
  FeishuMessageEvent,
  FeishuChallengeRequest,
  FeishuChallengeResponse,
  IFeishuChannel,
} from './types.js'
