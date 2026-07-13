/**
 * 任务类型检测 — 向后兼容 re-export
 *
 * 意图识别与文案已迁入 routing/scenarios/*.scenario.ts
 */

export {
  isOfficeTask,
  isOfficeInquiryTask,
  isOfficeCreationTask,
  getOfficeInquiryReply,
  buildOfficeRoutingDirective,
} from '../../routing/scenarios/office.scenario.js';

export {
  isScheduleTask,
  isScheduleInquiryTask,
  isScheduleCreationTask,
  getScheduleInquiryReply,
  buildScheduleRoutingDirective,
} from '../../routing/scenarios/schedule.scenario.js';

import { isOfficeTask, buildOfficeRoutingDirective } from '../../routing/scenarios/office.scenario.js';
import { isScheduleTask, buildScheduleRoutingDirective } from '../../routing/scenarios/schedule.scenario.js';

/**
 * @deprecated 优先使用 TaskRouter.getRoutingHint()
 */
export function getTaskRoutingDirective(task: string): string | null {
  if (isOfficeTask(task)) {
    return buildOfficeRoutingDirective();
  }
  if (isScheduleTask(task)) {
    return buildScheduleRoutingDirective();
  }
  return null;
}
