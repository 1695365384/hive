/**
 * 定时任务类型定义
 */

/**
 * 定时任务执行动作
 */
export type ScheduleAction = 'chat' | 'workflow' | 'dispatch';

/**
 * 定时任务状态
 */
export type ScheduleStatus = 'enabled' | 'paused';

/**
 * 执行记录状态
 */
export type ScheduleRunStatus = 'running' | 'success' | 'failed';

/**
 * 调度模式
 */
export type ScheduleKind = 'cron' | 'every' | 'at';

/**
 * 任务来源
 */
export type ScheduleSource = 'user' | 'auto';

/**
 * 推送通知配置
 */
export interface NotifyConfig {
  /** 推送模式：announce 推送 / none 不推送 */
  mode: 'announce' | 'none';
  /** 推送目标 channel，'last' 表示最后交互的 channel */
  channel?: string;
  /** 推送目标 chatId */
  to?: string;
  /** bestEffort：channel 不可用时静默跳过 */
  bestEffort?: boolean;
}

/**
 * 定时任务定义
 */
export interface Schedule {
  /** 唯一 ID */
  id: string;
  /** 任务名称 */
  name: string;
  /** cron 表达式（scheduleKind='cron' 时生效） */
  cron: string;
  /** 执行 prompt */
  prompt: string;
  /** 执行动作 */
  action: ScheduleAction;
  /** 是否启用 */
  enabled: boolean;
  /** 调度模式 */
  scheduleKind: ScheduleKind;
  /** 间隔毫秒数（scheduleKind='every' 时生效） */
  intervalMs?: number;
  /** 一次性执行时间 ISO 字符串（scheduleKind='at' 时生效） */
  runAt?: string;
  /** 执行后自动删除 */
  deleteAfterRun: boolean;
  /** 连续失败次数 */
  consecutiveErrors: number;
  /** 推送通知配置 */
  notifyConfig?: NotifyConfig;
  /** 任务来源 */
  source: ScheduleSource;
  /** 自动创建者 Agent ID */
  autoCreatedBy?: string;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** 上次执行时间 */
  lastRunAt?: Date;
  /** 下次执行时间 */
  nextRunAt?: Date;
  /** 执行次数 */
  runCount: number;
  /** 自定义元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 执行记录
 */
export interface ScheduleRun {
  /** 唯一 ID */
  id: string;
  /** 关联的定时任务 ID */
  scheduleId: string;
  /** 执行产生的会话 ID */
  sessionId?: string;
  /** 执行状态 */
  status: ScheduleRunStatus;
  /** 开始时间 */
  startedAt: Date;
  /** 完成时间 */
  completedAt?: Date;
  /** 错误信息 */
  error?: string;
}

/**
 * 创建定时任务的输入
 */
export interface CreateScheduleInput {
  /** 任务名称 */
  name: string;
  /** cron 表达式（scheduleKind='cron' 时必填） */
  cron?: string;
  /** 执行 prompt */
  prompt: string;
  /** 执行动作（默认 chat） */
  action?: ScheduleAction;
  /** 调度模式（默认 cron） */
  scheduleKind?: ScheduleKind;
  /** 间隔毫秒数（scheduleKind='every' 时必填） */
  intervalMs?: number;
  /** 一次性执行时间（scheduleKind='at' 时必填） */
  runAt?: string;
  /** 执行后自动删除（默认 false） */
  deleteAfterRun?: boolean;
  /** 推送通知配置 */
  notifyConfig?: NotifyConfig;
  /** 任务来源（默认 user） */
  source?: ScheduleSource;
  /** 自动创建者 Agent ID */
  autoCreatedBy?: string;
}

/**
 * 更新定时任务的输入
 */
export interface UpdateScheduleInput {
  name?: string;
  cron?: string;
  prompt?: string;
  action?: ScheduleAction;
  enabled?: boolean;
  scheduleKind?: ScheduleKind;
  intervalMs?: number;
  runAt?: string;
  deleteAfterRun?: boolean;
  consecutiveErrors?: number;
  notifyConfig?: NotifyConfig | null;
  source?: ScheduleSource;
  /** 下次执行时间（由 Engine 维护） */
  nextRunAt?: Date;
  /** 上次执行时间（由 Engine 维护） */
  lastRunAt?: Date;
}

/**
 * ScheduleEngine 配置
 */
export interface ScheduleEngineConfig {
  /** 引擎关闭时等待运行中任务完成的超时时间（ms），默认 30000 */
  shutdownTimeout?: number;
  /** 连续失败熔断阈值，默认 3 */
  circuitBreakerThreshold?: number;
  /** 连续失败熔断回调 */
  onCircuitBreak?: (event: ScheduleCircuitBreakEvent) => void;
}

/**
 * ScheduleEngine 状态
 */
export interface ScheduleEngineStatus {
  /** 是否已启动 */
  running: boolean;
  /** 已注册的任务总数 */
  registeredCount: number;
  /** 正在执行的任务数 */
  runningCount: number;
  /** 各任务下次触发时间 */
  nextRuns: Array<{ scheduleId: string; nextRunAt: Date | null }>;
}

/**
 * 触发回调参数
 */
export interface TriggerContext {
  /** 定时任务定义 */
  schedule: Schedule;
}

/**
 * 触发回调函数类型
 */
export type TriggerCallback = (ctx: TriggerContext) => Promise<{ sessionId: string; success: boolean; error?: string }>;

/**
 * schedule:completed 事件负载
 */
export interface ScheduleCompletedEvent {
  scheduleId: string;
  result?: string;
  status: 'success' | 'failed';
  consecutiveErrors: number;
  notifyConfig?: NotifyConfig;
  scheduleName: string;
}

/**
 * schedule:circuit-break 事件负载
 */
export interface ScheduleCircuitBreakEvent {
  scheduleId: string;
  name: string;
  consecutiveErrors: number;
}

/**
 * ScheduleEngine 接口
 */
export interface IScheduleEngine {
  start(): Promise<number>;
  stop(): Promise<void>;
  addTask(schedule: Schedule): void;
  pauseTask(taskId: string): boolean;
  resumeTask(taskId: string): Promise<boolean>;
  removeTask(taskId: string): boolean;
  getStatus(): ScheduleEngineStatus;
}

/**
 * ScheduleRepository 接口
 */
export interface IScheduleRepository {
  create(input: CreateScheduleInput): Promise<Schedule>;
  findAll(): Promise<Schedule[]>;
  findById(id: string): Promise<Schedule | null>;
  findEnabled(): Promise<Schedule[]>;
  update(id: string, input: UpdateScheduleInput): Promise<Schedule | null>;
  delete(id: string): Promise<boolean>;
  createRun(run: Omit<ScheduleRun, 'id'>): Promise<ScheduleRun>;
  updateRun(id: string, updates: Partial<Pick<ScheduleRun, 'status' | 'sessionId' | 'completedAt' | 'error'>>): Promise<void>;
  findRunsByScheduleId(scheduleId: string, limit?: number): Promise<ScheduleRun[]>;
}
