/**
 * Office 文档场景 — 意图识别 + 路由 + 文案（单一来源）
 */

import type { ScenarioCopy, ScenarioDefinition, WorkerSpawnInput } from '../types.js';
import { pickLocalizedLines } from '../scenario-copy.js';
import { hasNoArtifactIntent } from '../intent.js';

const OFFICE_TASK_RE =
  /\b(ppt|pptx|powerpoint|presentation|幻灯片|演示文稿|word|docx|excel|xlsx|spreadsheet|报告|汇报)\b/i;

const OFFICE_CREATION_STRONG_RE =
  /(帮我|请|做一|制作|创建|生成|写一|make\s+me|make\s+a|make\s+an|create\s+a|create\s+an|generate\s+a|build\s+a|produce\s+a)/i;

const OFFICE_CREATION_WEAK_RE = /\b(make|create|generate|build|produce)\b/i;

const OFFICE_INQUIRY_RE =
  /(能|可以|会不会|能不能|支持|会帮|技能|有没有|是否有|could you|can you|do you|have you)/i;

export function isOfficeTask(task: string): boolean {
  return OFFICE_TASK_RE.test(task);
}

function hasOfficeCreationIntent(
  task: string,
  ctx: { isQuestion: boolean; hasInquiryTone: boolean },
): boolean {
  if (OFFICE_CREATION_STRONG_RE.test(task)) return true;
  if (ctx.isQuestion || ctx.hasInquiryTone) return false;
  return OFFICE_CREATION_WEAK_RE.test(task);
}

export function isOfficeInquiryTask(task: string): boolean {
  if (!isOfficeTask(task)) return false;
  const trimmed = task.trim();
  const isQuestion = /[?？]|吗\s*$/.test(trimmed);
  const hasInquiryTone = OFFICE_INQUIRY_RE.test(task);
  const hasCreationIntent = hasOfficeCreationIntent(task, { isQuestion, hasInquiryTone });
  return (isQuestion || hasInquiryTone) && !hasCreationIntent;
}

export function isOfficeCreationTask(task: string): boolean {
  if (!isOfficeTask(task)) return false;
  if (hasNoArtifactIntent(task)) return false;
  if (isOfficeInquiryTask(task)) return false;
  const trimmed = task.trim();
  const isQuestion = /[?？]|吗\s*$/.test(trimmed);
  const hasInquiryTone = OFFICE_INQUIRY_RE.test(task);
  return hasOfficeCreationIntent(task, { isQuestion, hasInquiryTone });
}

export const OFFICE_SCENARIO_ID = 'office-document' as const;

export const OFFICE_SCENARIO_LABELS = {
  scenario: 'Office 文档',
  workerRunning: '正在制作 Office 文档',
  workerDescription: 'PPT 用 dashi-ppt；Word/Excel 用 officecli',
  inquiryNotification: 'Office 能力咨询',
  creationNotification: 'Office 文档制作',
} as const;

const OFFICE_INQUIRY_LINES = {
  zh: [
    '可以。Office 文档已接入本系统：',
    '- **PPT / 演示 / 汇报**：优先 **dashi-ppt**（模板组合 → 可浏览器编辑 HTML → 导出可编辑 PPTX）',
    '- **Word / Excel**：由 office Worker 通过 **officecli** 处理',
    '',
    '你不需要 python-pptx、AppleScript 或手动操作 PowerPoint。直接告诉我：',
    '- 文档类型（PPT / Word / Excel）',
    '- 主题与要点',
    '- 页数或结构要求',
    '',
    '我会立即开始制作。',
  ],
  en: [
    'Yes. Office is integrated:',
    '- **PPT / presentations**: prefer **dashi-ppt** (templated HTML deck → editable preview → editable PPTX export)',
    '- **Word / Excel**: dedicated **office Worker** via **officecli**',
    '',
    'No python-pptx, AppleScript, or manual PowerPoint automation needed. Tell me the topic, outline, and format — I will start immediately.',
  ],
} as const;

const PPT_QUALITY_DIRECTIVE = [
  '## PPT Quality Gate (mandatory)',
  '- Use **dashi-ppt** only: lock template, fill props; never free-form HTML/`hive-ppt`/`ppt-design`.',
  '- Respect every `fillPlan.text[].maxChars` / `copyBudgets`. Short titles; metric/display = number or short phrase.',
  '- One idea per slide. No speech-long paragraphs.',
  '- Ban AI-slop: 赋能/助力/开启新篇章/深度洞察/全面赋能/颠覆式创新, bilingual slogan stacking, emoji spam.',
  '- Override ALL `copyKeys`. Leftover template copy = delivery failure.',
  '- Pass `validate:goal-spec`, `validate:swiss`, `validate:goal-copy`. No overflow/overlap/clipping before send-file.',
].join('\n');

const OFFICE_ROUTING_HINT = [
  '## MANDATORY Routing (Office Task)',
  '',
  'This user message is an **Office document task**.',
  '- You MUST call agent(type="office") exactly once (required deliverable Worker).',
  '- For research-heavy decks (调研 / 市场 / 竞品 / ≥5 pages): call agent(type="explore") first, then agent(type="office") with the research (or call both — system direct-route runs explore then injects notes into office).',
  '- Do NOT call plan or general workers.',
  '- Do NOT run env() or research how to make PPT — tooling is already installed.',
  '- Do NOT mention python-pptx, AppleScript, or manual PowerPoint automation.',
  '- Do NOT answer with capability menus or "what would you like?" — delegate immediately.',
  '- **PPT**: follow installed skill **dashi-ppt** (do NOT officecli-create slides page-by-page).',
  '- **PPT quality**: short concrete copy, respect fillPlan maxChars, no AI-slop, no overflow.',
  '- **Word/Excel**: use **officecli**.',
].join('\n');

const OFFICE_COORDINATOR_BLURB =
  '[Installed Capability] **dashi-ppt** (PPT) + **officecli** (Word/Excel) are available. '
  + 'For PPT/Word/Excel tasks, spawn agent(type="office") — optionally parallel agent(type="explore") for research-heavy decks. '
  + 'PPT must use dashi-ppt when installed; keep copy short, respect fillPlan budgets, ban AI-slop/overflow. '
  + 'Do NOT research python-pptx, AppleScript, or env() for Office tasks.';

export const officeScenarioCopy: ScenarioCopy = {
  inquiryReply(task: string) {
    return pickLocalizedLines(task, OFFICE_INQUIRY_LINES);
  },
  routingHint() {
    return OFFICE_ROUTING_HINT;
  },
  coordinatorBlurb(task: string) {
    return isOfficeTask(task) ? OFFICE_COORDINATOR_BLURB : null;
  },
};

export function getOfficeInquiryReply(task: string): string {
  return officeScenarioCopy.inquiryReply(task);
}

export function buildOfficeRoutingDirective(): string {
  return officeScenarioCopy.routingHint();
}

export type OfficeScenarioAction =
  | { kind: 'inquiry'; reply: string }
  | { kind: 'creation'; prompt: string; description: string }
  | { kind: 'none' };

export function matchesOfficeScenario(task: string): boolean {
  if (hasNoArtifactIntent(task)) return false;
  return isOfficeTask(task);
}

export function resolveOfficeScenarioAction(task: string): OfficeScenarioAction {
  if (!isOfficeTask(task)) {
    return { kind: 'none' };
  }
  if (isOfficeInquiryTask(task)) {
    return { kind: 'inquiry', reply: officeScenarioCopy.inquiryReply(task) };
  }
  if (isOfficeCreationTask(task)) {
    return {
      kind: 'creation',
      prompt: task,
      description: describeOfficeWorker(task),
    };
  }
  return { kind: 'none' };
}

export function buildOfficeWorkerSpawn(task: string, description?: string): WorkerSpawnInput {
  const isPpt = /\b(ppt|pptx|powerpoint|presentation|幻灯片|演示文稿)\b/i.test(task);
  return {
    type: 'office',
    prompt: isPpt ? `${task}\n\n${PPT_QUALITY_DIRECTIVE}` : task,
    description: description ?? describeOfficeWorker(task),
    scenarioId: OFFICE_SCENARIO_ID,
  };
}

function describeOfficeWorker(task: string): string {
  if (/\b(ppt|pptx|powerpoint|presentation|幻灯片|演示文稿)\b/i.test(task)) {
    return '使用 dashi-ppt 制作可编辑 PPT';
  }
  if (/\b(word|docx)\b/i.test(task)) {
    return '使用 officecli 制作 Word';
  }
  if (/\b(excel|xlsx|spreadsheet)\b/i.test(task)) {
    return '使用 officecli 制作 Excel';
  }
  return OFFICE_SCENARIO_LABELS.workerDescription;
}

/**
 * Research-heavy Office tasks → explore then office (notes injected into office prompt).
 * Avoid bare 「研究/research」 topical matches (e.g. 研究机构、research paper theme).
 */
export function needsOfficeResearchAssist(task: string): boolean {
  if (
    /(调研|进行研究|研究一下|研究并|收集资料|竞品|市场分析|行业分析|收集素材|competitor|market\s+analysis|do\s+research|research\s+(and|on|for))/i
      .test(task)
  ) {
    return true;
  }
  // Explicit multi-page creation (not "改第5页…")
  if (/(改|修改|调整|更新).{0,8}\d+\s*页/.test(task)) {
    return false;
  }
  const pageMatch = task.match(/(?:做|制作|创建|生成|写).{0,24}?(\d+)\s*(页|页PPT|slides?|pages?)/i)
    ?? task.match(/(\d+)\s*(页|页PPT|slides?|pages?).{0,12}?(?:的)?(?:PPT|ppt|演示|汇报)/i);
  if (pageMatch && Number(pageMatch[1]) >= 5) {
    return true;
  }
  return false;
}

export function buildOfficeExploreAssistSpawn(task: string): WorkerSpawnInput {
  return {
    type: 'explore',
    prompt: [
      'Research assist for an Office document task.',
      'Collect factual bullets, suggested outline, and key talking points.',
      'Do NOT create PPT/Word/Excel files — read-only research only.',
      'Keep the answer concise (bullets).',
      '',
      `User request:\n${task}`,
    ].join('\n'),
    description: '协作调研：收集大纲与要点',
    scenarioId: OFFICE_SCENARIO_ID,
  };
}

/** Inject explore notes so office Worker can use them (sequential collaborate path). */
export function withOfficeResearchNotes(
  officeSpawn: WorkerSpawnInput,
  researchNotes: string,
): WorkerSpawnInput {
  const notes = researchNotes.trim().slice(0, 6000);
  if (!notes) return officeSpawn;
  return {
    ...officeSpawn,
    prompt: [
      officeSpawn.prompt,
      '',
      '## Research notes from explore Worker (use these facts/outline in the document)',
      notes,
    ].join('\n'),
  };
}

function officeSpawnValidationError(workerType: string): string {
  return [
    `Status: FAILED`,
    `Worker type "${workerType}" is NOT allowed for Office document tasks.`,
    `You MUST use agent(type="office") for the deliverable; optional parallel agent(type="explore") for research.`,
    `Do NOT use plan or general. officecli is already installed.`,
  ].join('\n');
}

export const officeScenario: ScenarioDefinition = {
  id: OFFICE_SCENARIO_ID,
  priority: 100,
  labels: OFFICE_SCENARIO_LABELS,
  copy: officeScenarioCopy,
  allowedWorkers: ['office', 'explore'],
  match: matchesOfficeScenario,
  resolve(task: string) {
    if (hasNoArtifactIntent(task)) {
      return { kind: 'none' };
    }
    const action = resolveOfficeScenarioAction(task);
    if (action.kind === 'inquiry') {
      return { kind: 'inquiry', reply: action.reply };
    }
    if (action.kind === 'creation') {
      const officeSpawn = buildOfficeWorkerSpawn(action.prompt, action.description);
      if (needsOfficeResearchAssist(task)) {
        return {
          kind: 'delegate',
          spawns: [buildOfficeExploreAssistSpawn(task), officeSpawn],
        };
      }
      return {
        kind: 'delegate',
        spawns: [officeSpawn],
      };
    }
    if (isOfficeTask(task)) {
      return { kind: 'hint', directive: officeScenarioCopy.routingHint() };
    }
    return { kind: 'none' };
  },
  validateSpawn(task, spawn) {
    if (!isOfficeTask(task)) return null;
    if (hasNoArtifactIntent(task) && spawn.type === 'office') {
      return [
        'Status: FAILED',
        'User forbade generating files/artifacts.',
        'Do NOT spawn office or create .pptx/.docx/.xlsx. Answer in text only.',
      ].join('\n');
    }
    if (spawn.type === 'office' || spawn.type === 'explore') {
      return null;
    }
    return officeSpawnValidationError(spawn.type);
  },
};
