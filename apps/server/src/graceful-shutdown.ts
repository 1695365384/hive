/**
 * Graceful Shutdown
 *
 * Registers process signal handlers for clean shutdown in sidecar mode.
 * Works with Tauri's watch_server() which detects process exit and auto-restarts.
 */

export interface GracefulShutdownOptions {
  close: () => Promise<void>
  forceExitTimeout?: number
  memoryThresholdBytes?: number
}

export function registerGracefulShutdown(options: GracefulShutdownOptions): () => void {
  const {
    close,
    forceExitTimeout = 10_000,
    memoryThresholdBytes = 512 * 1024 * 1024,
  } = options

  let shuttingDown = false

  async function shutdown(reason: string, exitCode: number): Promise<void> {
    if (shuttingDown) return
    shuttingDown = true

    console.log(`[shutdown] Triggered by: ${reason}`)

    // Force-exit timer — ensures we don't hang forever
    const timer = setTimeout(() => {
      console.error(`[shutdown] Force exit after ${forceExitTimeout}ms timeout`)
      process.exit(exitCode || 1)
    }, forceExitTimeout)
    timer.unref() // Don't block process exit

    try {
      await close()
      console.log('[shutdown] Graceful shutdown complete')
    } catch (err) {
      console.error('[shutdown] Error during shutdown:', err)
    }

    process.exit(exitCode)
  }

  // Named function references for proper process.off() removal
  function handleSigterm() { shutdown('SIGTERM', 0) }
  function handleSigint() { shutdown('SIGINT', 0) }
  function handleUncaughtException(err: Error) {
    console.error('[shutdown] Uncaught exception:', err)
    shutdown('uncaughtException', 1)
  }
  function handleUnhandledRejection(reason: unknown) {
    console.error('[shutdown] Unhandled rejection:', reason)
    // Log only — don't crash the process
  }

  // Register handlers
  process.on('SIGTERM', handleSigterm)
  process.on('SIGINT', handleSigint)
  process.on('uncaughtException', handleUncaughtException)
  process.on('unhandledRejection', handleUnhandledRejection)

  // Memory watchdog
  const watcher = setInterval(() => {
    const rss = process.memoryUsage().rss
    if (rss > memoryThresholdBytes) {
      const mb = Math.round(rss / 1024 / 1024)
      const threshold = Math.round(memoryThresholdBytes / 1024 / 1024)
      console.warn(`[watchdog] Memory usage ${mb}MB exceeds threshold ${threshold}MB`)
    }
  }, 30_000)
  watcher.unref()

  // Return deregister function
  return () => {
    process.off('SIGTERM', handleSigterm)
    process.off('SIGINT', handleSigint)
    process.off('uncaughtException', handleUncaughtException)
    process.off('unhandledRejection', handleUnhandledRejection)
    clearInterval(watcher)
  }
}
