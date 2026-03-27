/**
 * 日志接口
 *
 * 跨模块共享的基础类型，不依赖任何其他模块。
 */

export interface ILogger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

/**
 * No-op logger that silently discards all messages.
 * Used as default when no logger is provided.
 */
export const noopLogger: ILogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
}
