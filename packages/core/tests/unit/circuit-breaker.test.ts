/**
 * P0.3: BLOCKED 错误熔断器测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createBlockedCircuitBreaker, isBlockedCode } from '../../src/tools/harness/circuit-breaker.js';

describe('isBlockedCode', () => {
  it('returns true for BLOCKED codes', () => {
    expect(isBlockedCode('DANGEROUS_CMD')).toBe(true);
    expect(isBlockedCode('COMMAND_BLOCKED')).toBe(true);
    expect(isBlockedCode('SENSITIVE_FILE')).toBe(true);
    expect(isBlockedCode('UNKNOWN_COMMAND')).toBe(true);
  });

  it('returns false for non-BLOCKED codes', () => {
    expect(isBlockedCode('OK')).toBe(false);
    expect(isBlockedCode('TIMEOUT')).toBe(false);
    expect(isBlockedCode('NOT_FOUND')).toBe(false);
    expect(isBlockedCode('MATCH_FAILED')).toBe(false);
  });
});

describe('createBlockedCircuitBreaker', () => {
  let breaker: ReturnType<typeof createBlockedCircuitBreaker>;

  beforeEach(() => {
    breaker = createBlockedCircuitBreaker();
  });

  it('returns null on first BLOCKED event', () => {
    const msg = breaker.record('bash-tool', 'DANGEROUS_CMD', { command: 'rm -rf /' });
    expect(msg).toBeNull();
  });

  it('returns circuit-open message on repeated same BLOCKED event', () => {
    breaker.record('bash-tool', 'DANGEROUS_CMD', { command: 'rm' });
    const msg = breaker.record('bash-tool', 'DANGEROUS_CMD', { command: 'rm' });
    expect(msg).not.toBeNull();
    expect(msg).toContain('CIRCUIT OPEN');
    expect(msg).toContain('DO NOT retry');
  });

  it('returns null for non-BLOCKED errors', () => {
    const msg = breaker.record('file-tool', 'NOT_FOUND', {});
    expect(msg).toBeNull();
  });

  it('reset clears all state', () => {
    breaker.record('bash-tool', 'DANGEROUS_CMD', { command: 'rm' });
    breaker.reset();
    // After reset, first occurrence again returns null
    const msg = breaker.record('bash-tool', 'DANGEROUS_CMD', { command: 'rm' });
    expect(msg).toBeNull();
  });

  it('different commands (different fingerprints) are tracked independently', () => {
    // First occurrence of each — both should return null
    const msg1 = breaker.record('bash-tool', 'DANGEROUS_CMD', { command: 'rm' });
    const msg2 = breaker.record('bash-tool', 'DANGEROUS_CMD', { command: 'mkfs' });
    expect(msg1).toBeNull();
    expect(msg2).toBeNull();

    // Second occurrence of rm — should open circuit
    const msg3 = breaker.record('bash-tool', 'DANGEROUS_CMD', { command: 'rm' });
    expect(msg3).not.toBeNull();

    // First occurrence of mkfs already happened, second triggers circuit
    const msg4 = breaker.record('bash-tool', 'DANGEROUS_CMD', { command: 'mkfs' });
    expect(msg4).not.toBeNull();
  });
});
