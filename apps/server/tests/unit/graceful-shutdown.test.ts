import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { registerGracefulShutdown } from '../../src/graceful-shutdown.js'

describe('registerGracefulShutdown', () => {
  let closeFn: ReturnType<typeof vi.fn>
  let deregister: ReturnType<typeof registerGracefulShutdown>

  beforeEach(() => {
    closeFn = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    deregister?.()
    vi.restoreAllMocks()
  })

  it('should call close on SIGTERM', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })

    deregister = registerGracefulShutdown({ close: closeFn, forceExitTimeout: 1000 })

    process.emit('SIGTERM')

    // shutdown is async — wait for microtasks
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(closeFn).toHaveBeenCalledTimes(1)
    expect(exitSpy).toHaveBeenCalledWith(0)
    exitSpy.mockRestore()
  })

  it('should call close on SIGINT', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })

    deregister = registerGracefulShutdown({ close: closeFn, forceExitTimeout: 1000 })

    process.emit('SIGINT')

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(closeFn).toHaveBeenCalledTimes(1)
    exitSpy.mockRestore()
  })

  it('should call close and exit with code 1 on uncaughtException', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })

    deregister = registerGracefulShutdown({ close: closeFn, forceExitTimeout: 1000 })

    const err = new Error('test crash')
    process.emit('uncaughtException', err)

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(console.error).toHaveBeenCalledWith('[shutdown] Uncaught exception:', err)
    expect(closeFn).toHaveBeenCalledTimes(1)
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('should log but NOT crash on unhandledRejection', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})

    deregister = registerGracefulShutdown({ close: closeFn, forceExitTimeout: 1000 })

    process.emit('unhandledRejection', new Error('async fail'))

    expect(console.error).toHaveBeenCalled()
    expect(closeFn).not.toHaveBeenCalled()
    expect(exitSpy).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })

  it('should not trigger shutdown twice', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })

    deregister = registerGracefulShutdown({ close: closeFn, forceExitTimeout: 1000 })

    process.emit('SIGTERM')
    process.emit('SIGTERM')

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(closeFn).toHaveBeenCalledTimes(1)
    exitSpy.mockRestore()
  })

  it('should force exit if close takes too long', async () => {
    const slowClose = vi.fn().mockImplementation(() => new Promise(() => {})) // never resolves
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})

    deregister = registerGracefulShutdown({ close: slowClose, forceExitTimeout: 100 })

    process.emit('SIGTERM')

    // Wait for force exit timeout
    await new Promise(resolve => setTimeout(resolve, 200))

    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('should return a deregister function', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })

    deregister = registerGracefulShutdown({ close: closeFn, forceExitTimeout: 1000 })
    deregister() // deregister

    process.emit('SIGTERM')

    // After deregister, signal handler should not call close
    expect(closeFn).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })
})
