/**
 * WsDomainHandler — Domain Handler 抽象基类
 *
 * 所有域 Handler 继承此类，通过 register() 返回自己的 handler map。
 * 共享依赖通过 HandlerContext 注入。
 */

import type { HandlerContext, MethodHandler } from '../handler-context.js'

export abstract class WsDomainHandler {
  protected ctx: HandlerContext

  constructor(ctx: HandlerContext) {
    this.ctx = ctx
  }

  /** 返回 method → handler 映射，由 AdminWsRouter 合并注册 */
  abstract register(): Map<string, MethodHandler>
}
