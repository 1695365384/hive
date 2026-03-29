/**
 * 插件入口
 *
 * 导入并实例化所有插件，配置从 hive.config.json 读取。
 *
 * 新增插件：import 类，在 plugins 数组里 new 一个即可。
 */

import { FeishuPlugin } from '@hive/plugin-feishu'
import { getConfig } from './config.js'

const { pluginConfigs } = getConfig()

export const plugins = [
  new FeishuPlugin(pluginConfigs['@hive/plugin-feishu'] ?? {}),
]
