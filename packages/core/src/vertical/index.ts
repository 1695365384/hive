/**
 * Vertical Pack 系统 — Barrel Export
 *
 * 用法：
 * ```typescript
 * import { PackManager, type VerticalPack } from '@bundy-lmw/hive-core/vertical';
 * // 或从主入口：
 * import { PackManager, type VerticalPack } from '@bundy-lmw/hive-core';
 * ```
 */

export { PackManager, createPackManager } from './PackManager.js';
export type {
  VerticalPack,
  ToolDefinition,
  HookRegistration,
  SubAgentDefinition,
  SkillDefinition,
  PackSetupContext,
} from './types.js';
export {
  PackError,
  PackCycleError,
  PackDependencyMissingError,
} from './types.js';
