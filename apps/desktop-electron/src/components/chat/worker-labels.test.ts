import { describe, it, expect } from 'vitest';
import { formatWorkerTitle, formatScenarioLabel, getDesktopScenarioLabels } from './worker-labels';

/** 与 core SCENARIO_LABEL_CONTRACT 同步 */
const CORE_SCENARIO_LABELS = {
  'office-document': 'Office 文档',
  'recurring-task': '定时任务',
} as const;

describe('formatWorkerTitle', () => {
  it('prefers description over worker type', () => {
    expect(formatWorkerTitle('office', '使用 officecli 制作 PPT')).toBe('使用 officecli 制作 PPT');
  });

  it('maps office worker type to user-facing label', () => {
    expect(formatWorkerTitle('office')).toBe('Office 文档');
    expect(formatWorkerTitle('explore')).toBe('探索');
    expect(formatWorkerTitle('librarian')).toBe('文献检索');
    expect(formatWorkerTitle('metis')).toBe('计划顾问');
    expect(formatWorkerTitle('momus')).toBe('计划评审');
    expect(formatWorkerTitle('oracle')).toBe('架构诊断');
  });

  it('uses scenario label when description is absent', () => {
    expect(formatWorkerTitle('office', undefined, 'office-document')).toBe('Office 文档');
  });
});

describe('formatScenarioLabel', () => {
  it('maps known scenario ids', () => {
    expect(formatScenarioLabel('office-document')).toBe('Office 文档');
    expect(formatScenarioLabel('recurring-task')).toBe('定时任务');
  });
});

describe('scenario label contract (desktop ↔ core)', () => {
  it('matches core routing scenario labels', () => {
    expect(getDesktopScenarioLabels()).toEqual(CORE_SCENARIO_LABELS);
  });
});
