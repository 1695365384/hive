/**
 * ScenarioSurface — UI entry catalog for explicit scenario triggers.
 *
 * Engine scenes live in ScenarioRegistry (match/resolve).
 * Surfaces are thin: slash aliases, empty-state cards, default prompts.
 * Keep this file free of ScenarioDefinition imports so Desktop Vite can import it.
 */

export type ScenarioSurface = {
  id: string;
  scenarioId?: string;
  slash: string[];
  defaultPrompt: string;
  labelKey: string;
  hintKey: string;
  showInEmptyState: boolean;
};

const SURFACES: readonly ScenarioSurface[] = [
  {
    id: 'ppt',
    scenarioId: 'office-document',
    slash: ['ppt', 'pptx', 'presentation'],
    defaultPrompt:
      '帮我做一份项目汇报 PPT，包含项目背景、进展、风险和下一步计划',
    labelKey: 'ppt',
    hintKey: 'ppt',
    showInEmptyState: true,
  },
  {
    id: 'doc',
    slash: ['doc', 'report', 'weekly'],
    defaultPrompt:
      '帮我写本周周报，主要完成了用户登录模块开发和接口联调',
    labelKey: 'doc',
    hintKey: 'doc',
    showInEmptyState: true,
  },
  {
    id: 'meeting',
    slash: ['meeting', 'notes'],
    defaultPrompt: '帮我整理下面会议纪要的要点和待办事项',
    labelKey: 'meeting',
    hintKey: 'meeting',
    showInEmptyState: true,
  },
  {
    id: 'data',
    slash: ['data', 'excel', 'sheet'],
    defaultPrompt: '帮我分析这份数据，给出关键指标和趋势',
    labelKey: 'data',
    hintKey: 'data',
    showInEmptyState: true,
  },
  {
    id: 'schedule',
    scenarioId: 'recurring-task',
    slash: ['schedule', 'cron', 'remind'],
    defaultPrompt: '每天早上 9 点提醒我喝水',
    labelKey: 'schedule',
    hintKey: 'schedule',
    showInEmptyState: false,
  },
];

export function listScenarioSurfaces(): readonly ScenarioSurface[] {
  return SURFACES;
}

export function listEmptyStateSurfaces(): readonly ScenarioSurface[] {
  return SURFACES.filter((s) => s.showInEmptyState);
}

export function getSurface(id: string): ScenarioSurface | undefined {
  return SURFACES.find((s) => s.id === id);
}

export function getSurfaceByScenarioId(
  scenarioId: string,
): ScenarioSurface | undefined {
  return SURFACES.find((s) => s.scenarioId === scenarioId);
}

export type SlashResolveResult = {
  surfaceId?: string;
  scenarioId?: string;
  prompt: string;
  matched: boolean;
};

export function resolveSlash(input: string): SlashResolveResult {
  const trimmed = input.trim();
  const m = trimmed.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!m) {
    return { matched: false, prompt: trimmed };
  }
  const alias = (m[1] ?? '').toLowerCase();
  const rest = (m[2] ?? '').trim();
  const surface = SURFACES.find((s) =>
    s.slash.some((a) => a.toLowerCase() === alias),
  );
  if (!surface) {
    return { matched: false, prompt: trimmed };
  }
  return {
    matched: true,
    surfaceId: surface.id,
    scenarioId: surface.scenarioId,
    prompt: rest,
  };
}

export function resolveSendPayload(input: {
  text: string;
  surfaceId?: string;
}): {
  prompt: string;
  scenarioId?: string;
  surfaceId?: string;
} {
  if (input.surfaceId) {
    const surface = getSurface(input.surfaceId);
    if (!surface) {
      return { prompt: input.text.trim() };
    }
    const prompt = input.text.trim() || surface.defaultPrompt;
    return {
      prompt,
      scenarioId: surface.scenarioId,
      surfaceId: surface.id,
    };
  }

  const slash = resolveSlash(input.text);
  if (!slash.matched) {
    return { prompt: slash.prompt };
  }
  const surface = slash.surfaceId ? getSurface(slash.surfaceId) : undefined;
  const prompt = slash.prompt || surface?.defaultPrompt || slash.prompt;
  return {
    prompt,
    scenarioId: slash.scenarioId,
    surfaceId: slash.surfaceId,
  };
}

export function isKnownForcedScenarioId(scenarioId: string): boolean {
  return SURFACES.some((s) => s.scenarioId === scenarioId);
}
