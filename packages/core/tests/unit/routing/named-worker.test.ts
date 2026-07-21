import { describe, it, expect } from 'vitest';
import {
  createDefaultTaskRouter,
  NAMED_WORKER_SCENARIO_ID,
  detectNamedWorkerType,
  validateWorkerSpawn,
  hasNoArtifactIntent,
  isOfficeCreationTask,
} from '../../../src/routing/index.js';

describe('named-worker scenario', () => {
  const router = createDefaultTaskRouter();

  it('detects Chinese and English explicit worker names', () => {
    expect(detectNamedWorkerType('请用 librarian 查 React 官方文档')).toBe('librarian');
    expect(detectNamedWorkerType('使用 metis 先澄清歧义')).toBe('metis');
    expect(detectNamedWorkerType('use oracle to diagnose the race')).toBe('oracle');
    expect(detectNamedWorkerType('agent(type="momus") review this plan')).toBe('momus');
    expect(detectNamedWorkerType('librarian 检索 AI SDK docs')).toBe('librarian');
    expect(detectNamedWorkerType('随便看看代码')).toBeNull();
  });

  it('hard-delegates to the named worker type', () => {
    const decision = router.resolve('请用 librarian 查 Zod v4 官方文档并给引用');
    expect(decision.action).toBe('delegate');
    if (decision.action === 'delegate') {
      expect(decision.scenarioId).toBe(NAMED_WORKER_SCENARIO_ID);
      expect(decision.spawns).toHaveLength(1);
      expect(decision.spawns[0]!.type).toBe('librarian');
    }
  });

  it('beats office scenario when user names librarian', () => {
    const decision = router.resolve('请用 librarian 查怎么做 PPT');
    expect(decision.action).toBe('delegate');
    if (decision.action === 'delegate') {
      expect(decision.spawns[0]!.type).toBe('librarian');
      expect(decision.scenarioId).toBe(NAMED_WORKER_SCENARIO_ID);
    }
  });

  it('rejects wrong worker type via validateSpawn', () => {
    const error = validateWorkerSpawn('请用 librarian 查文档', {
      type: 'explore',
      prompt: 'search',
    });
    expect(error).toContain('Status: FAILED');
    expect(error).toContain('librarian');
  });

  it('allows the named worker type', () => {
    const error = validateWorkerSpawn('请用 librarian 查文档', {
      type: 'librarian',
      prompt: 'search',
    });
    expect(error).toBeNull();
  });
});

describe('hasNoArtifactIntent', () => {
  it('detects Chinese and English no-file constraints', () => {
    expect(hasNoArtifactIntent('只解释架构，不要生成文件')).toBe(true);
    expect(hasNoArtifactIntent('Explain the architecture. Do not generate files.')).toBe(true);
    expect(hasNoArtifactIntent('text only please')).toBe(true);
    expect(hasNoArtifactIntent('帮我做一个 PPT')).toBe(false);
  });

  it('blocks office creation when user forbids artifacts', () => {
    expect(isOfficeCreationTask('帮我做一个 PPT，但不要生成文件')).toBe(false);
    expect(isOfficeCreationTask('帮我做一个 PPT')).toBe(true);
  });

  it('does not delegate office when no-artifact intent is present', () => {
    const router = createDefaultTaskRouter();
    const decision = router.resolve('帮我做一个关于 AI 的 PPT，不要生成文件，只解释怎么做');
    // May be inquiry/hint/pass/named — but must not force office deliverable
    if (decision.action === 'delegate') {
      expect(decision.spawns.every((s) => s.type !== 'office')).toBe(true);
    }
  });
});
