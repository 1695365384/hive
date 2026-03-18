/**
 * 预设模块入口
 *
 * 提供各厂商的预设配置
 */

import type { ProviderPreset } from '../types.js';
import { ANTHROPIC_PRESETS } from './anthropic.js';
import { OPENAI_PRESETS } from './openai.js';
import { CHINESE_PRESETS } from './chinese.js';
import { GATEWAY_PRESETS } from './gateway.js';
import { Provider } from '../Provider.js';

// 导出所有预设
export { ANTHROPIC_PRESETS } from './anthropic.js';
export { OPENAI_PRESETS } from './openai.js';
export { CHINESE_PRESETS } from './chinese.js';
export { GATEWAY_PRESETS } from './gateway.js';

/**
 * 所有预设（按优先级合并）
 */
export const ALL_PRESETS: ProviderPreset[] = [
  ...ANTHROPIC_PRESETS,
  ...OPENAI_PRESETS,
  ...CHINESE_PRESETS,
  ...GATEWAY_PRESETS,
];

/**
 * 获取所有预设
 */
export function getPresets(): ProviderPreset[] {
  return ALL_PRESETS;
}

/**
 * 按类别获取预设
 */
export function getPresetsByCategory(
  category: ProviderPreset['category']
): ProviderPreset[] {
  return ALL_PRESETS.filter(p => p.category === category);
}

/**
 * 获取预设
 */
export function getPreset(id: string): ProviderPreset | undefined {
  return ALL_PRESETS.find(p => p.id === id);
}

/**
 * 应用预设
 */
export function applyPreset(preset: ProviderPreset, apiKey: string): Provider {
  return new Provider({
    id: preset.id,
    name: preset.name,
    baseUrl: preset.baseUrl,
    apiKey,
    model: preset.defaultModel,
  });
}

/**
 * 搜索预设
 */
export function searchPresets(query: string): ProviderPreset[] {
  const lower = query.toLowerCase();
  return ALL_PRESETS.filter(p =>
    p.id.includes(lower) ||
    p.name.toLowerCase().includes(lower) ||
    p.description?.toLowerCase().includes(lower)
  );
}
