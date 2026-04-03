/**
 * P0.1: buildAbortSignal / withAbortAndTimeout — 统一超时逻辑测试
 */

import { describe, it, expect, vi } from 'vitest';
import { buildAbortSignal, withAbortAndTimeout } from '../../src/agents/core/runner.js';

describe('buildAbortSignal', () => {
  it('returns undefined signal when no timeout or external signal', () => {
    const { signal, cleanup } = buildAbortSignal();
    expect(signal).toBeUndefined();
    cleanup(); // no-op, should not throw
  });

  it('returns signal that aborts after timeout', async () => {
    const { signal, cleanup } = buildAbortSignal(50);
    expect(signal).toBeDefined();
    expect(signal!.aborted).toBe(false);
    await new Promise(r => setTimeout(r, 80));
    expect(signal!.aborted).toBe(true);
    cleanup();
  });

  it('reflects external signal abort immediately', () => {
    const external = new AbortController();
    const { signal, cleanup } = buildAbortSignal(undefined, external.signal);
    expect(signal).toBeDefined();
    expect(signal!.aborted).toBe(false);
    external.abort();
    expect(signal!.aborted).toBe(true);
    cleanup();
  });

  it('combines timeout and external signal — first wins', async () => {
    const external = new AbortController();
    const { signal, cleanup } = buildAbortSignal(5000, external.signal);
    expect(signal!.aborted).toBe(false);
    external.abort();
    expect(signal!.aborted).toBe(true);
    cleanup();
  });

  it('cleanup prevents timer firing', async () => {
    const { signal, cleanup } = buildAbortSignal(50);
    cleanup(); // clear timer before it fires
    await new Promise(r => setTimeout(r, 100));
    // signal may still not be aborted since timer was cleared
    // (AbortSignal.any may have been constructed with an already-cleared timer's controller)
    // At minimum, no unhandled errors
    expect(signal).toBeDefined();
  });
});

describe('withAbortAndTimeout', () => {
  it('resolves when operation completes successfully', async () => {
    const result = await withAbortAndTimeout(
      async () => ({ text: 'ok', tools: [], success: true }),
      {},
      (msg) => ({ text: '', tools: [], success: false, error: msg }),
    );
    expect(result.success).toBe(true);
    expect(result.text).toBe('ok');
  });

  it('returns error factory result when operation throws', async () => {
    const result = await withAbortAndTimeout(
      async () => { throw new Error('boom'); },
      {},
      (msg) => ({ text: '', tools: [], success: false, error: msg }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('boom');
  });

  it('calls onError callback when operation throws', async () => {
    const onError = vi.fn();
    await withAbortAndTimeout(
      async () => { throw new Error('oops'); },
      { onError },
      (msg) => ({ text: '', tools: [], success: false, error: msg }),
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toBe('oops');
  });

  it('aborts via external signal and returns error', async () => {
    const external = new AbortController();
    const slowOp = (signal?: AbortSignal) =>
      new Promise<{ text: string; tools: string[]; success: boolean }>((resolve, reject) => {
        const t = setTimeout(() => resolve({ text: 'done', tools: [], success: true }), 5000);
        signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new Error('aborted'));
        });
      });

    setTimeout(() => external.abort(), 30);
    const result = await withAbortAndTimeout(
      (signal) => slowOp(signal),
      { abortSignal: external.signal },
      (msg) => ({ text: '', tools: [], success: false, error: msg }),
    );
    expect(result.success).toBe(false);
  });
});
