/**
 * 定时任务能力
 *
 * 用户通过自然语言对话创建、管理定时任务。
 * 支持 cron / every / at 三种调度模式。
 * Agent 可自主建议任务（关键词预过滤 + LLM 结构化输出 + 用户确认）。
 */

import type { AgentCapability, AgentContext } from '../core/types.js';
import type {
  IScheduleRepository,
  IScheduleEngine,
  Schedule,
  CreateScheduleInput,
  ScheduleKind,
  NotifyConfig,
} from '../../scheduler/types.js';
import { isValidCron, computeNextRunAtMs } from '../../scheduler/cron-utils.js';

// ============================================
// 常量
// ============================================

/** 关键词预过滤触发词 */
const SCHEDULE_KEYWORDS = [
  '每天', '每周', '每隔', '定期', '监控', '提醒', '推送', 'cron', '定时',
  '每天早上', '每天晚上', '每周一', '每小时', '每分钟',
  '明天', '后天', '下午', '凌晨',
];

/** 单用户 auto 任务上限 */
const MAX_AUTO_SCHEDULES = 50;

// ============================================
// 类型定义
// ============================================

/**
 * LLM 结构化输出结果
 */
interface ParsedScheduleIntent {
  name: string;
  scheduleKind: ScheduleKind;
  cron?: string;
  everyMs?: number;
  runAt?: string;
  prompt: string;
  action: 'chat' | 'workflow' | 'dispatch';
  notifyConfig?: NotifyConfig;
  needsConfirmation?: boolean;
  confirmationMessage?: string;
}

/**
 * 校验结果
 */
interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ============================================
// ScheduleCapability
// ============================================

/**
 * 定时任务能力实现
 */
export class ScheduleCapability implements AgentCapability {
  readonly name = 'schedule';
  private context!: AgentContext;
  private repository!: IScheduleRepository;
  private engine?: IScheduleEngine;

  setDependencies(repository: IScheduleRepository, engine?: IScheduleEngine): void {
    this.repository = repository;
    this.engine = engine;
  }

  initialize(context: AgentContext): void {
    this.context = context;
  }

  // ============================================
  // Agent 自主创建（4 层防幻觉）
  // ============================================

  /**
   * Layer 1: 关键词预过滤
   * 返回 true 表示消息可能包含调度意图
   */
  matchesScheduleKeyword(message: string): boolean {
    const lower = message.toLowerCase();
    return SCHEDULE_KEYWORDS.some(keyword => lower.includes(keyword));
  }

  /**
   * 完整的自动调度流程（Layer 1-3）
   * 1. 关键词预过滤 → 2. LLM 结构化输出 → 3. 返回确认卡片
   */
  async autoSchedule(message: string): Promise<string> {
    // Layer 1: 关键词预过滤
    if (!this.matchesScheduleKeyword(message)) {
      return ''; // 不匹配，跳过
    }

    // Layer 2: LLM 结构化输出
    const parsed = await this.parseIntentV2(message);
    const validation = this.validateParsedIntent(parsed);
    if (!validation.valid) {
      return validation.error!;
    }

    // 检查 auto 任务数量上限
    const all = await this.repository.findAll();
    const autoCount = all.filter(s => s.source === 'auto').length;
    if (autoCount >= MAX_AUTO_SCHEDULES) {
      return `您已有 ${MAX_AUTO_SCHEDULES} 个自动创建的定时任务，请先清理后再创建新任务。`;
    }

    // Layer 3: 返回确认卡片（等待用户确认）
    // 存储 pending 状态，供 confirmAutoSchedule 使用
    this.pendingAutoSchedule = {
      name: parsed.name,
      scheduleKind: parsed.scheduleKind,
      cron: parsed.cron,
      intervalMs: parsed.everyMs,
      runAt: parsed.runAt,
      prompt: parsed.prompt,
      action: parsed.action,
      notifyConfig: parsed.notifyConfig,
      deleteAfterRun: parsed.scheduleKind === 'at',
    };

    const scheduleDesc = this.formatScheduleDescription(parsed);
    return `📋 建议创建以下定时任务：\n\n${scheduleDesc}\n\n请确认是否创建？回复"确认"创建，回复其他内容取消。`;
  }

  /**
   * 用户确认后创建 auto 任务
   */
  async confirmAutoSchedule(message: string): Promise<string> {
    if (message !== '确认' && message !== '是' && message !== '好的' && message !== 'yes') {
      return '已取消创建定时任务。';
    }

    // 从上下文中获取待确认的任务（由 pendingAutoSchedule 缓存）
    const pending = this.pendingAutoSchedule;
    if (!pending) {
      return '没有待确认的定时任务。';
    }

    try {
      const schedule = await this.create({
        ...pending,
        source: 'auto',
        autoCreatedBy: 'agent',
      });

      this.pendingAutoSchedule = undefined;

      const nextRunStr = schedule.nextRunAt?.toLocaleString('zh-CN') ?? '未知';
      return `✅ 定时任务已创建：\n- 名称：${schedule.name}\n- 模式：${schedule.scheduleKind}\n- 下次执行：${nextRunStr}`;
    } catch (error) {
      return `创建任务失败：${error instanceof Error ? error.message : '未知错误'}`;
    }
  }

  /** 缓存待确认的自动调度 */
  private pendingAutoSchedule?: Omit<CreateScheduleInput, 'source' | 'autoCreatedBy'>;

  // ============================================
  // 用户主动创建
  // ============================================

  /**
   * 通过自然语言创建定时任务（用户主动）
   */
  async createFromNaturalLanguage(userMessage: string): Promise<string> {
    const parsed = await this.parseIntentV2(userMessage);

    if (parsed.needsConfirmation) {
      return parsed.confirmationMessage!;
    }

    const validation = this.validateParsedIntent(parsed);
    if (!validation.valid) {
      return validation.error!;
    }

    const schedule = await this.create({
      name: parsed.name,
      scheduleKind: parsed.scheduleKind,
      cron: parsed.cron,
      intervalMs: parsed.everyMs,
      runAt: parsed.runAt,
      prompt: parsed.prompt,
      action: parsed.action,
      notifyConfig: parsed.notifyConfig,
      deleteAfterRun: parsed.scheduleKind === 'at',
    });

    if (this.engine && schedule.enabled) {
      this.engine.addTask(schedule);
    }

    const nextRunStr = schedule.nextRunAt?.toLocaleString('zh-CN') ?? '未知';
    return `定时任务已创建：
- 名称：${schedule.name}
- 模式：${schedule.scheduleKind}
- 执行内容：${schedule.prompt}
- 下次执行：${nextRunStr}`;
  }

  // ============================================
  // 直接操作
  // ============================================

  /**
   * 创建定时任务（编程接口，绕过 LLM）
   */
  async create(input: CreateScheduleInput): Promise<Schedule> {
    const schedule = await this.repository.create(input);

    if (this.engine && schedule.enabled) {
      this.engine.addTask(schedule);
    }

    return schedule;
  }

  /**
   * 获取 Repository（供 Agent 直接操作）
   */
  getRepository(): IScheduleRepository {
    return this.repository;
  }

  // ============================================
  // CRUD
  // ============================================

  async list(): Promise<string> {
    const schedules = await this.repository.findAll();

    if (schedules.length === 0) {
      return '暂无定时任务。';
    }

    const lines = schedules.map((s, i) => {
      const status = s.enabled ? '启用' : '暂停';
      const nextRun = s.nextRunAt?.toLocaleString('zh-CN') ?? '未计算';
      const lastRun = s.lastRunAt?.toLocaleString('zh-CN') ?? '从未执行';
      const source = s.source === 'auto' ? ' [自动]' : '';
      return `${i + 1}. **${s.name}** [${status}]${source}
   - 模式: ${s.scheduleKind}
   - 内容: ${s.prompt}
   - 下次执行: ${nextRun}
   - 上次执行: ${lastRun}
   - 执行次数: ${s.runCount}`;
    });

    return `当前定时任务（共 ${schedules.length} 个）：\n\n${lines.join('\n\n')}`;
  }

  async pause(nameOrId: string): Promise<string> {
    const schedule = await this.findByNameOrId(nameOrId);
    if (!schedule) return `未找到任务: "${nameOrId}"`;

    await this.repository.update(schedule.id, { enabled: false });
    this.engine?.pauseTask(schedule.id);
    return `任务 "${schedule.name}" 已暂停。`;
  }

  async resume(nameOrId: string): Promise<string> {
    const schedule = await this.findByNameOrId(nameOrId);
    if (!schedule) return `未找到任务: "${nameOrId}"`;

    await this.repository.update(schedule.id, { enabled: true });
    if (this.engine) await this.engine.resumeTask(schedule.id);
    return `任务 "${schedule.name}" 已恢复。`;
  }

  async remove(nameOrId: string): Promise<string> {
    const schedule = await this.findByNameOrId(nameOrId);
    if (!schedule) return `未找到任务: "${nameOrId}"`;

    this.engine?.removeTask(schedule.id);
    await this.repository.delete(schedule.id);
    return `任务 "${schedule.name}" 已删除。`;
  }

  async history(nameOrId: string): Promise<string> {
    const schedule = await this.findByNameOrId(nameOrId);
    if (!schedule) return `未找到任务: "${nameOrId}"`;

    const runs = await this.repository.findRunsByScheduleId(schedule.id, 20);

    if (runs.length === 0) return `任务 "${schedule.name}" 暂无执行记录。`;

    const lines = runs.map((r, i) => {
      const statusEmoji = r.status === 'success' ? '✅' : r.status === 'failed' ? '❌' : '⏳';
      const completedAt = r.completedAt?.toLocaleString('zh-CN') ?? '执行中...';
      const sessionInfo = r.sessionId ? `会话: ${r.sessionId}` : '';
      const errorInfo = r.error ? `错误: ${r.error}` : '';
      return `${i + 1}. ${statusEmoji} ${completedAt} ${sessionInfo} ${errorInfo}`.trim();
    });

    return `任务 "${schedule.name}" 的执行记录（最近 ${runs.length} 条）：\n\n${lines.join('\n')}`;
  }

  // ============================================
  // LLM 结构化输出（Layer 2）
  // ============================================

  /**
   * 通过 LLM 解析自然语言意图（V2：支持三种调度模式）
   */
  private async parseIntentV2(userMessage: string): Promise<ParsedScheduleIntent> {
    const prompt = `你是一个定时任务解析助手。用户会描述他们想要的定时任务，你需要提取以下信息并以 JSON 格式返回。

用户消息: "${userMessage}"

请返回以下 JSON 格式（不要包含其他内容）：
{
  "name": "简短的任务名称",
  "scheduleKind": "cron 或 every 或 at",
  "cron": "cron 表达式（仅 scheduleKind=cron 时）",
  "everyMs": "间隔毫秒数（仅 scheduleKind=every 时）",
  "runAt": "ISO 时间字符串（仅 scheduleKind=at 时）",
  "prompt": "Agent 执行时使用的 prompt",
  "action": "chat",
  "notifyConfig": { "mode": "announce", "channel": "last", "bestEffort": true },
  "needsConfirmation": false,
  "confirmationMessage": null
}

规则：
- scheduleKind 选择：重复性任务用 cron，固定间隔用 every，一次性定时用 at
- cron 使用 24 小时制 5 字段格式
- everyMs 单位为毫秒（如 5分钟 = 300000，1小时 = 3600000）
- runAt 使用 ISO 格式（如 "2026-03-30T15:00:00.000Z"）
- 如果用户描述的时间不明确，设置 needsConfirmation=true
- notifyConfig.mode 可选 "announce"（推送结果）或 "none"（不推送）
- 一次性任务（at）默认 announce，周期任务默认 none

示例：
- "每天早上9点检查日志" → { scheduleKind: "cron", cron: "0 9 * * *" }
- "每隔5分钟检查服务状态" → { scheduleKind: "every", everyMs: 300000 }
- "明天下午3点提醒我开会" → { scheduleKind: "at", runAt: "2026-03-30T07:00:00.000Z", deleteAfterRun: true }`;

    try {
      const chatCap = this.context.getCapability<AgentCapability>('chat');
      let response: string;

      if (chatCap && typeof (chatCap as unknown as { send: (p: string) => Promise<string> }).send === 'function') {
        response = await (chatCap as unknown as { send: (p: string) => Promise<string> }).send(prompt);
      } else {
        return this.fallbackParseV2(userMessage);
      }

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return this.fallbackParseV2(userMessage);

      const parsed = JSON.parse(jsonMatch[0]) as ParsedScheduleIntent;
      if (!parsed.name || !parsed.prompt) return this.fallbackParseV2(userMessage);

      return parsed;
    } catch {
      return this.fallbackParseV2(userMessage);
    }
  }

  // ============================================
  // Layer 2: JSON Schema 校验
  // ============================================

  /**
   * 校验 LLM 输出的结构化数据
   */
  private validateParsedIntent(parsed: ParsedScheduleIntent): ValidationResult {
    // scheduleKind 合法性
    if (!['cron', 'every', 'at'].includes(parsed.scheduleKind)) {
      return { valid: false, error: `无效的调度模式: ${parsed.scheduleKind}` };
    }

    // cron 模式必须有 cron 表达式
    if (parsed.scheduleKind === 'cron') {
      if (!parsed.cron || !isValidCron(parsed.cron)) {
        return { valid: false, error: `无效的 cron 表达式: "${parsed.cron}"` };
      }
    }

    // every 模式必须有 intervalMs
    if (parsed.scheduleKind === 'every') {
      if (!parsed.everyMs || parsed.everyMs <= 0) {
        return { valid: false, error: '无效的间隔时间，everyMs 必须为正整数' };
      }
      if (parsed.everyMs < 60000) {
        return { valid: false, error: '间隔时间不能小于 1 分钟（60000ms）' };
      }
    }

    // at 模式必须有 runAt
    if (parsed.scheduleKind === 'at') {
      if (!parsed.runAt) {
        return { valid: false, error: '一次性任务必须指定执行时间 (runAt)' };
      }
      const targetTime = new Date(parsed.runAt).getTime();
      if (isNaN(targetTime)) {
        return { valid: false, error: `无效的时间格式: "${parsed.runAt}"` };
      }
    }

    return { valid: true };
  }

  // ============================================
  // 辅助方法
  // ============================================

  /**
   * 格式化调度描述
   */
  private formatScheduleDescription(parsed: ParsedScheduleIntent): string {
    let scheduleInfo: string;
    switch (parsed.scheduleKind) {
      case 'cron':
        scheduleInfo = `Cron: ${parsed.cron}`;
        break;
      case 'every':
        scheduleInfo = `间隔: ${this.formatMs(parsed.everyMs ?? 0)}`;
        break;
      case 'at':
        scheduleInfo = `执行时间: ${parsed.runAt ? new Date(parsed.runAt).toLocaleString('zh-CN') : '未知'}`;
        break;
    }
    return `- 名称：${parsed.name}
- 模式：${parsed.scheduleKind}
- ${scheduleInfo}
- 执行内容：${parsed.prompt}`;
  }

  private formatMs(ms: number): string {
    if (ms < 60000) return `${ms / 1000}秒`;
    if (ms < 3600000) return `${ms / 60000}分钟`;
    if (ms < 86400000) return `${ms / 3600000}小时`;
    return `${ms / 86400000}天`;
  }

  /**
   * 简单的正则回退解析（V2）
   */
  private fallbackParseV2(userMessage: string): ParsedScheduleIntent {
    return {
      name: userMessage.slice(0, 20),
      scheduleKind: 'cron',
      cron: undefined,
      prompt: userMessage,
      action: 'chat',
      needsConfirmation: true,
      confirmationMessage: `无法自动解析调度时间，请明确指定执行时间。例如："每天早上9点检查日志" 或 "每隔5分钟检查服务"。`,
    };
  }

  private async findByNameOrId(nameOrId: string): Promise<Schedule | null> {
    const byId = await this.repository.findById(nameOrId);
    if (byId) return byId;

    const all = await this.repository.findAll();
    const lowerInput = nameOrId.toLowerCase();
    return all.find(s =>
      s.name.toLowerCase().includes(lowerInput) ||
      s.id.toLowerCase().includes(lowerInput)
    ) ?? null;
  }
}

/**
 * Create schedule capability instance
 */
export function createScheduleCapability(): ScheduleCapability {
  return new ScheduleCapability();
}
