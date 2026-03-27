/**
 * 心跳调度器
 *
 * 周期性调用 Agent.runHeartbeatOnce() 执行健康巡检，
 * 通过 MessageBus 推送巡检结果。
 */

import type { Agent } from '@hive/core'
import type { HeartbeatConfig } from './config.js'
import type { MessageBus } from '@hive/orchestrator'

export interface HeartbeatSchedulerOptions {
  agent: Agent
  config: HeartbeatConfig
  bus: MessageBus
}

export class HeartbeatScheduler {
  private agent: Agent
  private config: HeartbeatConfig
  private bus: MessageBus
  private timer?: ReturnType<typeof setInterval>
  private running: boolean = false

  constructor(options: HeartbeatSchedulerOptions) {
    this.agent = options.agent
    this.config = options.config
    this.bus = options.bus
  }

  /**
   * 启动心跳调度
   */
  start(): void {
    if (this.running) {
      return
    }

    this.running = true
    const intervalMs = this.config.intervalMs

    // 立即执行一次，然后按间隔调度
    this.tick().catch((err) => {
      console.error('[heartbeat] Initial tick failed:', err)
    })

    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[heartbeat] Tick failed:', err)
      })
    }, intervalMs)

    console.log(`[heartbeat] Scheduler started (interval: ${intervalMs}ms)`)
  }

  /**
   * 停止心跳调度
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    this.running = false
    console.log('[heartbeat] Scheduler stopped')
  }

  /**
   * 是否正在运行
   */
  isRunning(): boolean {
    return this.running
  }

  /**
   * 单次心跳巡检
   */
  async tick(): Promise<void> {
    const startTime = Date.now()

    try {
      const result = await this.agent.runHeartbeatOnce({
        model: this.config.model,
        prompt: this.config.prompt,
      })

      const duration = Date.now() - startTime

      this.bus.publish('heartbeat:tick', {
        timestamp: new Date(),
        isOk: result.isOk,
        hasAlert: result.hasAlert,
        content: result.content,
        duration,
      })

      if (result.hasAlert) {
        console.warn(`[heartbeat] Alert detected (${duration}ms): ${result.content.slice(0, 200)}`)
      } else {
        console.log(`[heartbeat] OK (${duration}ms)`)
      }
    } catch (error) {
      const duration = Date.now() - startTime

      this.bus.publish('heartbeat:tick', {
        timestamp: new Date(),
        isOk: false,
        hasAlert: true,
        content: `Heartbeat check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration,
        error: true,
      })

      console.error(`[heartbeat] Tick failed (${duration}ms):`, error)
    }
  }
}
