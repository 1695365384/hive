/**
 * Dispatch 分类器测试
 */

import { describe, it, expect } from 'vitest';
import { regexClassify, parseDispatchClassification } from '../../../src/agents/dispatch/classifier.js';

describe('regexClassify', () => {
  it('should classify short ASCII questions as chat', () => {
    const result = regexClassify('What is the weather today?');
    expect(result.layer).toBe('chat');
    expect(result.taskType).toBe('general');
    expect(result.complexity).toBe('simple');
    expect(result.confidence).toBe(0.3);
  });

  it('should classify code tasks as workflow (Chinese add-feature)', () => {
    const result = regexClassify('添加用户认证模块');
    expect(result.layer).toBe('workflow');
    expect(result.taskType).toBe('code-task');
  });

  it('should classify bug fix tasks as workflow (Chinese)', () => {
    const result = regexClassify('修复登录页面的 bug');
    expect(result.layer).toBe('workflow');
    expect(result.taskType).toBe('code-task');
  });

  it('should classify code review tasks as workflow', () => {
    const result = regexClassify('审查这段代码的质量');
    expect(result.layer).toBe('workflow');
    expect(result.taskType).toBe('code-task');
  });

  it('should classify refactoring tasks as workflow', () => {
    const result = regexClassify('重构这个模块的架构');
    expect(result.layer).toBe('workflow');
    expect(result.taskType).toBe('code-task');
  });

  it('should default to chat for unknown patterns', () => {
    const result = regexClassify('随便说点什么');
    expect(result.layer).toBe('chat');
    expect(result.confidence).toBe(0.2);
  });

  it('should classify English code tasks as workflow', () => {
    const result = regexClassify('Implement user authentication');
    expect(result.layer).toBe('workflow');
    expect(result.taskType).toBe('code-task');
  });

  it('should classify English debug tasks as workflow', () => {
    const result = regexClassify('Fix bug in login handler');
    expect(result.layer).toBe('workflow');
    expect(result.taskType).toBe('code-task');
  });

  it('should classify English refactor tasks as workflow', () => {
    const result = regexClassify('Refactor the authentication module');
    expect(result.layer).toBe('workflow');
    expect(result.taskType).toBe('code-task');
  });

  it('should classify conversation as chat', () => {
    const result = regexClassify('你好，最近怎么样');
    expect(result.layer).toBe('chat');
  });

  it('should classify multi-step tasks as workflow', () => {
    const result = regexClassify('先实现功能然后运行测试接着部署');
    expect(result.layer).toBe('workflow');
  });
});

describe('parseDispatchClassification', () => {
  it('should parse valid JSON with all fields', () => {
    const json = JSON.stringify({
      layer: 'workflow',
      taskType: 'code-task',
      complexity: 'complex',
      confidence: 0.85,
      reason: 'Code task',
    });
    const result = parseDispatchClassification(json);
    expect(result.layer).toBe('workflow');
    expect(result.taskType).toBe('code-task');
    expect(result.complexity).toBe('complex');
    expect(result.confidence).toBe(0.85);
    expect(result.reason).toBe('Code task');
  });

  it('should parse chat layer', () => {
    const json = JSON.stringify({
      layer: 'chat',
      taskType: 'general',
      complexity: 'simple',
      confidence: 0.9,
      reason: 'Simple question',
    });
    const result = parseDispatchClassification(json);
    expect(result.layer).toBe('chat');
    expect(result.taskType).toBe('general');
    expect(result.complexity).toBe('simple');
  });

  it('should default invalid layer to chat', () => {
    const json = JSON.stringify({ layer: 'invalid', confidence: 0.5, reason: 'test' });
    const result = parseDispatchClassification(json);
    expect(result.layer).toBe('chat');
  });

  it('should default invalid taskType to general', () => {
    const json = JSON.stringify({ layer: 'workflow', taskType: 'nonexistent', reason: 'test' });
    const result = parseDispatchClassification(json);
    expect(result.taskType).toBe('general');
  });

  it('should default invalid complexity to moderate', () => {
    const json = JSON.stringify({ layer: 'workflow', complexity: 'unknown', reason: 'test' });
    const result = parseDispatchClassification(json);
    expect(result.complexity).toBe('moderate');
  });

  it('should clamp confidence to [0, 1]', () => {
    const high = parseDispatchClassification(JSON.stringify({ confidence: 2.5, reason: 'test' }));
    expect(high.confidence).toBe(1);
    const low = parseDispatchClassification(JSON.stringify({ confidence: -1, reason: 'test' }));
    expect(low.confidence).toBe(0);
  });

  it('should return defaults for non-JSON input', () => {
    const result = parseDispatchClassification('not json at all');
    expect(result.layer).toBe('chat');
    expect(result.taskType).toBe('general');
    expect(result.complexity).toBe('moderate');
  });

  it('should ignore unknown fields gracefully', () => {
    const json = JSON.stringify({ layer: 'chat', unknownField: 'value', reason: 'test' });
    const result = parseDispatchClassification(json);
    expect(result.layer).toBe('chat');
  });
});
