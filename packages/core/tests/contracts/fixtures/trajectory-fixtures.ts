/**
 * Scripted LLM 响应 fixture — 用于轨迹契约测试
 */

export interface TrajectoryFixture {
  id: string;
  task: string;
  steps: Array<{
    toolName: string;
    input: Record<string, unknown>;
    output?: unknown;
    finalText?: string;
  }>;
  expectedWorkerTypes?: string[];
  expectAgentCalls?: number;
}

export const OFFICE_PPT_FIXTURE: TrajectoryFixture = {
  id: 'office-ppt',
  task: '帮我做一个关于 AI 的 PPT，3 页',
  steps: [
    {
      toolName: 'agent',
      input: {
        type: 'office',
        prompt: 'Create a 3-slide PPT about AI trends',
        description: 'Office worker for AI PPT',
      },
      output: 'Created /tmp/ai-deck.pptx (3 slides)',
      finalText: 'PPT 已生成：/tmp/ai-deck.pptx',
    },
  ],
  expectedWorkerTypes: ['office'],
  expectAgentCalls: 1,
};

export const SCHEDULE_CRON_FIXTURE: TrajectoryFixture = {
  id: 'schedule-cron',
  task: '每天早上 9 点提醒我喝水',
  steps: [
    {
      toolName: 'agent',
      input: {
        type: 'schedule',
        prompt: 'Create a daily 9am reminder to drink water',
        description: 'Schedule worker',
      },
      output: 'Schedule created: daily-water',
      finalText: '已创建定时提醒',
    },
  ],
  expectedWorkerTypes: ['schedule'],
  expectAgentCalls: 1,
};

export const EXPLORE_ONLY_FIXTURE: TrajectoryFixture = {
  id: 'explore-only',
  task: '找出所有认证相关文件',
  steps: [
    {
      toolName: 'agent',
      input: {
        type: 'explore',
        prompt: 'Find all authentication-related files',
        description: 'Explore worker',
      },
      output: 'Found auth.ts, middleware/auth.ts',
      finalText: '找到 2 个认证相关文件',
    },
  ],
  expectedWorkerTypes: ['explore'],
  expectAgentCalls: 1,
};

export const DIRECT_ANSWER_FIXTURE: TrajectoryFixture = {
  id: 'direct-answer',
  task: '你好',
  steps: [],
  expectedWorkerTypes: [],
  expectAgentCalls: 0,
};

export const TRAJECTORY_FIXTURES: TrajectoryFixture[] = [
  OFFICE_PPT_FIXTURE,
  SCHEDULE_CRON_FIXTURE,
  EXPLORE_ONLY_FIXTURE,
  DIRECT_ANSWER_FIXTURE,
];
