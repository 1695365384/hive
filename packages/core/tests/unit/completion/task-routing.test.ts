import { describe, it, expect } from 'vitest';
import {
  isOfficeTask,
  isOfficeCreationTask,
  isOfficeInquiryTask,
  getTaskRoutingDirective,
  getOfficeInquiryReply,
} from '../../../src/agents/completion/task-routing.js';

describe('task-routing', () => {
  it('detects office tasks in Chinese and English', () => {
    expect(isOfficeTask('帮我做一个关于 AI 的 PPT')).toBe(true);
    expect(isOfficeTask('可以！我能帮你制作和处理 PowerPoint 演示文稿')).toBe(true);
    expect(isOfficeTask('write a quarterly report in Word')).toBe(true);
    expect(isOfficeTask('hello')).toBe(false);
  });

  it('distinguishes inquiry vs creation', () => {
    expect(isOfficeInquiryTask('你能做PPT吗')).toBe(true);
    expect(isOfficeInquiryTask('Can you make PowerPoint presentations?')).toBe(true);
    expect(isOfficeInquiryTask('Can you make me a PPT about AI?')).toBe(false);
    expect(isOfficeCreationTask('你能做PPT吗')).toBe(false);
    expect(isOfficeCreationTask('帮我做一个关于 AI 的 PPT')).toBe(true);
    expect(isOfficeCreationTask('做一个 quarterly report pptx')).toBe(true);
    expect(isOfficeCreationTask('Can you make me a PPT about AI?')).toBe(true);
  });

  it('returns mandatory office routing directive', () => {
    const directive = getTaskRoutingDirective('做一个 PPT');
    expect(directive).toContain('type="office"');
    expect(directive).toContain('officecli');
    expect(directive).toContain('Do NOT call explore');
  });

  it('inquiry reply mentions officecli', () => {
    const reply = getOfficeInquiryReply('你能做PPT吗');
    expect(reply).toContain('officecli');
    expect(reply).toContain('office Worker');
  });
});
