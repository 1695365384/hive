import { describe, it, expect } from 'vitest'

/**
 * Tests for ExecutionCapability anti-hallucination defense methods.
 */

// ============================================
// Extract defense logic for testing
// ============================================

function needsVerification(task: string): boolean {
  const trimmed = task.trim();
  return trimmed.length > 5;
}

function formatStepsSummary(steps: Array<{
  toolCalls: Array<{ toolName: string; input: unknown }>;
  text?: string;
}>): string {
  if (steps.length === 0) return '（无工具调用）';

  const lines: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.toolCalls.length > 0) {
      const toolNames = step.toolCalls.map(tc => tc.toolName).join(', ');
      lines.push(`  步骤 ${i + 1}: 调用 ${toolNames}`);
    } else if (step.text) {
      const preview = step.text.length > 100 ? step.text.slice(0, 100) + '...' : step.text;
      lines.push(`  步骤 ${i + 1}: ${preview}`);
    }
  }
  return `执行记录（共 ${steps.length} 步）:\n${lines.join('\n')}`;
}

// ============================================
// Tests
// ============================================

describe('needsVerification', () => {
  it('skips very short messages (greetings, single words)', () => {
    expect(needsVerification('你好')).toBe(false)
    expect(needsVerification('hi')).toBe(false)
    expect(needsVerification('')).toBe(false)
    expect(needsVerification('   ')).toBe(false)
  })

  it('verifies anything longer than 5 chars', () => {
    expect(needsVerification('什么是闭包？')).toBe(true)
    expect(needsVerification('帮我修改配置')).toBe(true)
    expect(needsVerification('update the port')).toBe(true)
    expect(needsVerification('hello world')).toBe(true)
    expect(needsVerification('谢谢啦')).toBe(false)
    expect(needsVerification('好呀')).toBe(false)
  })
})

describe('formatStepsSummary', () => {
  it('returns placeholder for empty steps', () => {
    expect(formatStepsSummary([])).toBe('（无工具调用）')
  })

  it('formats tool call steps', () => {
    const steps = [
      { toolCalls: [{ toolName: 'file-read', input: { path: '/tmp/a' } }] },
      { toolCalls: [{ toolName: 'file-str_replace', input: { path: '/tmp/a', old: 'x', new: 'y' } }] },
    ]
    const summary = formatStepsSummary(steps)
    expect(summary).toContain('执行记录（共 2 步）')
    expect(summary).toContain('步骤 1: 调用 file-read')
    expect(summary).toContain('步骤 2: 调用 file-str_replace')
  })

  it('formats text-only steps', () => {
    const steps = [
      { toolCalls: [], text: 'Let me check the file first.' },
    ]
    const summary = formatStepsSummary(steps)
    expect(summary).toContain('Let me check the file first.')
  })

  it('truncates long text in steps', () => {
    const longText = 'a'.repeat(200)
    const steps = [{ toolCalls: [], text: longText }]
    const summary = formatStepsSummary(steps)
    expect(summary).toContain('...')
    expect(summary.length).toBeLessThan(250)
  })

  it('formats mixed steps (tool calls + text)', () => {
    const steps = [
      { toolCalls: [{ toolName: 'bash', input: { command: 'ls' } }] },
      { toolCalls: [], text: 'Found 3 files.' },
      { toolCalls: [{ toolName: 'bash', input: { command: 'rm -rf /tmp/test' } }] },
    ]
    const summary = formatStepsSummary(steps)
    expect(summary).toContain('执行记录（共 3 步）')
    expect(summary).toContain('步骤 1: 调用 bash')
    expect(summary).toContain('步骤 2: Found 3 files.')
    expect(summary).toContain('步骤 3: 调用 bash')
  })
})
