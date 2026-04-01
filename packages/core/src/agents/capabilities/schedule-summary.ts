/**
 * Schedule summary builder
 *
 * Shared utility for building schedule awareness summaries in system prompts.
 * Used by ChatCapability and WorkflowCapability.
 */

import type { AgentContext } from '../core/types.js';
import type { IScheduleRepository } from '../../scheduler/types.js';

/**
 * Build a formatted summary of existing scheduled tasks.
 * Returns empty string if schedule capability is not available or query fails.
 */
export async function buildScheduleSummary(context: AgentContext): Promise<string> {
  try {
    const scheduleCap = context.getCapability<import('./ScheduleCapability.js').ScheduleCapability>('schedule');
    if (!scheduleCap?.getRepository) return '';

    const repo = scheduleCap.getRepository();
    const schedules = await repo.findAll();

    if (schedules.length === 0) {
      return '\n### Current Scheduled Tasks\n\nNo scheduled tasks configured.';
    }

    const lines = schedules.map(s => {
      const status = s.enabled ? 'enabled' : 'paused';
      const schedule = s.scheduleKind === 'cron'
        ? `cron: ${s.cron}`
        : s.scheduleKind === 'every'
          ? `every ${Math.round((s.intervalMs ?? 0) / 1000)}s`
          : `at: ${s.runAt}`;
      return `- **${s.name}** (${s.scheduleKind}, ${status}, ${schedule})`;
    });

    return `\n### Current Scheduled Tasks\n\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}
