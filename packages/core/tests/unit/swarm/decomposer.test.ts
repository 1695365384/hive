/**
 * Decomposer + Templates + Aggregator 综合测试
 */

import { describe, it, expect } from 'vitest';
import { CyclicDependencyError } from '../../../src/agents/swarm/types.js';
import {
  matchTemplate,
  topologicalSort,
  detectCycle,
  renderNodePrompt,
  buildGraph,
} from '../../../src/agents/swarm/decomposer.js';
import { BUILTIN_TEMPLATES } from '../../../src/agents/swarm/templates.js';
import { Blackboard } from '../../../src/agents/swarm/blackboard.js';
import { SwarmTracer } from '../../../src/agents/swarm/tracer.js';
import { aggregate, formatMerge } from '../../../src/agents/swarm/aggregator.js';
import type { SwarmNode, NodeResult } from '../../../src/agents/swarm/types.js';

// ============================================
// matchTemplate
// ============================================

describe('matchTemplate', () => {
  it('should match by regex', () => {
    const result = matchTemplate('帮我添加用户认证', BUILTIN_TEMPLATES);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('add-feature');
  });

  it('should match debug template', () => {
    const result = matchTemplate('修复登录 bug', BUILTIN_TEMPLATES);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('debug');
  });

  it('should match code-review template', () => {
    const result = matchTemplate('审查这段代码', BUILTIN_TEMPLATES);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('code-review');
  });

  it('should match refactor template', () => {
    const result = matchTemplate('重构认证模块', BUILTIN_TEMPLATES);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('refactor');
  });

  it('should match by specified template name', () => {
    const result = matchTemplate('随便什么内容', BUILTIN_TEMPLATES, 'code-review');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('code-review');
  });

  it('should return null when no match', () => {
    const result = matchTemplate('今天天气怎么样', BUILTIN_TEMPLATES);
    expect(result).toBeNull();
  });

  it('should return null for unknown template name', () => {
    const result = matchTemplate('test', BUILTIN_TEMPLATES, 'nonexistent');
    expect(result).toBeNull();
  });
});

// ============================================
// topologicalSort
// ============================================

describe('topologicalSort', () => {
  it('should sort a linear chain A → B → C', () => {
    const nodes: Record<string, SwarmNode> = {
      a: { agent: 'explore', prompt: '', depends: [] },
      b: { agent: 'plan', prompt: '', depends: ['a'] },
      c: { agent: 'general', prompt: '', depends: ['b'] },
    };
    const layers = topologicalSort(nodes);
    expect(layers).toEqual([['a'], ['b'], ['c']]);
  });

  it('should sort a diamond DAG', () => {
    const nodes: Record<string, SwarmNode> = {
      a: { agent: 'explore', prompt: '', depends: [] },
      b: { agent: 'explore', prompt: '', depends: ['a'] },
      c: { agent: 'plan', prompt: '', depends: ['a'] },
      d: { agent: 'general', prompt: '', depends: ['b', 'c'] },
    };
    const layers = topologicalSort(nodes);
    expect(layers[0]).toEqual(['a']);
    expect(layers[1].sort()).toEqual(['b', 'c']);
    expect(layers[2]).toEqual(['d']);
  });

  it('should handle fully parallel nodes', () => {
    const nodes: Record<string, SwarmNode> = {
      a: { agent: 'explore', prompt: '', depends: [] },
      b: { agent: 'plan', prompt: '', depends: [] },
      c: { agent: 'general', prompt: '', depends: [] },
    };
    const layers = topologicalSort(nodes);
    expect(layers).toHaveLength(1);
    expect(layers[0].sort()).toEqual(['a', 'b', 'c']);
  });

  it('should handle single node', () => {
    const nodes: Record<string, SwarmNode> = {
      a: { agent: 'explore', prompt: '', depends: [] },
    };
    const layers = topologicalSort(nodes);
    expect(layers).toEqual([['a']]);
  });

  it('should throw CyclicDependencyError for cycle', () => {
    const nodes: Record<string, SwarmNode> = {
      a: { agent: 'explore', prompt: '', depends: ['b'] },
      b: { agent: 'plan', prompt: '', depends: ['c'] },
      c: { agent: 'general', prompt: '', depends: ['a'] },
    };
    expect(() => topologicalSort(nodes)).toThrow(CyclicDependencyError);
  });

  it('should throw for self-loop', () => {
    const nodes: Record<string, SwarmNode> = {
      a: { agent: 'explore', prompt: '', depends: ['a'] },
    };
    expect(() => topologicalSort(nodes)).toThrow(CyclicDependencyError);
  });
});

describe('detectCycle', () => {
  it('should return false for DAG', () => {
    const nodes: Record<string, SwarmNode> = {
      a: { agent: 'explore', prompt: '', depends: [] },
      b: { agent: 'plan', prompt: '', depends: ['a'] },
    };
    expect(detectCycle(nodes)).toBe(false);
  });

  it('should return true for cyclic graph', () => {
    const nodes: Record<string, SwarmNode> = {
      a: { agent: 'explore', prompt: '', depends: ['b'] },
      b: { agent: 'plan', prompt: '', depends: ['a'] },
    };
    expect(detectCycle(nodes)).toBe(true);
  });
});

// ============================================
// renderNodePrompt
// ============================================

describe('renderNodePrompt', () => {
  it('should inject blackboard values into prompt', () => {
    const bb = new Blackboard();
    bb.set('task', 'add auth');
    const node: SwarmNode = { agent: 'explore', prompt: 'Find: {task}', depends: [] };
    expect(renderNodePrompt(node, bb)).toBe('Find: add auth');
  });

  it('should inject dependency results', () => {
    const bb = new Blackboard();
    bb.set('task', 'fix bug');
    bb.set('explore', { text: 'Found bug in auth.ts', success: true });
    const node: SwarmNode = {
      agent: 'plan',
      prompt: 'Analyze: {explore.result}\nTask: {task}',
      depends: ['explore'],
    };
    expect(renderNodePrompt(node, bb)).toBe('Analyze: Found bug in auth.ts\nTask: fix bug');
  });
});

// ============================================
// buildGraph
// ============================================

describe('buildGraph', () => {
  it('should build graph from template', () => {
    const bb = new Blackboard();
    bb.set('task', 'add feature');
    const tracer = new SwarmTracer();
    const template = BUILTIN_TEMPLATES.find(t => t.name === 'add-feature' && t.variant === 'medium')!;
    const graph = buildGraph(template, bb, tracer);

    expect(graph.task).toBe('add feature');
    expect(graph.templateName).toBe('add-feature');
    expect(graph.layers.length).toBe(3);
    expect(graph.layers[0].sort()).toEqual(['explore', 'plan']);
    expect(graph.layers[1]).toEqual(['implement']);
    expect(graph.layers[2].sort()).toEqual(['review', 'test']);
  });

  it('should identify terminal nodes', () => {
    const bb = new Blackboard();
    bb.set('task', 'debug');
    const tracer = new SwarmTracer();
    const template = BUILTIN_TEMPLATES.find(t => t.name === 'debug' && t.variant === 'medium')!;
    const graph = buildGraph(template, bb, tracer);

    expect(graph.terminalNodes).toEqual(['verify']);
  });
});

// ============================================
// BUILTIN_TEMPLATES validation
// ============================================

describe('BUILTIN_TEMPLATES', () => {
  it('should have templates with variants', () => {
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(9);
  });

  it('should have unique name+variant combinations', () => {
    const keys = BUILTIN_TEMPLATES.map(t => `${t.name}:${t.variant ?? 'medium'}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('should cover 4 template families', () => {
    const families = new Set(BUILTIN_TEMPLATES.map(t => t.name));
    expect(families.size).toBe(4);
  });

  it('all templates should have valid DAG (no cycles)', () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      expect(() => topologicalSort(tpl.nodes)).not.toThrow();
    }
  });

  it('all template agents should be valid AgentTypes', () => {
    const validAgents = new Set([
      'explore', 'plan', 'general', 'custom',
    ]);
    for (const tpl of BUILTIN_TEMPLATES) {
      for (const node of Object.values(tpl.nodes)) {
        expect(validAgents.has(node.agent)).toBe(true);
      }
    }
  });
});

// ============================================
// aggregate
// ============================================

describe('aggregate', () => {
  const createNodeResult = (overrides: Partial<NodeResult> = {}): NodeResult => ({
    nodeId: 'test',
    text: 'result',
    tools: [],
    success: true,
    duration: 100,
    ...overrides,
  });

  it('should extract primary result', () => {
    const results = new Map<string, NodeResult>();
    results.set('primary', createNodeResult({ nodeId: 'primary', text: 'main' }));
    const { text, success } = aggregate(
      { primary: 'primary' },
      results,
      ['primary']
    );
    expect(text).toBe('main');
    expect(success).toBe(true);
  });

  it('should merge additional nodes with section format', () => {
    const results = new Map<string, NodeResult>();
    results.set('primary', createNodeResult({ nodeId: 'primary', text: 'main' }));
    results.set('review', createNodeResult({ nodeId: 'review', text: 'looks good' }));
    const { text } = aggregate(
      { primary: 'primary', merge: ['review'], mergeFormat: 'section' },
      results,
      ['primary']
    );
    expect(text).toContain('main');
    expect(text).toContain('## review');
    expect(text).toContain('looks good');
  });

  it('should merge with append format', () => {
    const results = new Map<string, NodeResult>();
    results.set('primary', createNodeResult({ nodeId: 'primary', text: 'main' }));
    results.set('extra', createNodeResult({ nodeId: 'extra', text: 'extra text' }));
    const { text } = aggregate(
      { primary: 'primary', merge: ['extra'], mergeFormat: 'append' },
      results,
      ['primary']
    );
    expect(text).toBe('main\n\nextra text');
  });

  it('should skip merge with summary format', () => {
    const results = new Map<string, NodeResult>();
    results.set('primary', createNodeResult({ nodeId: 'primary', text: 'main' }));
    results.set('extra', createNodeResult({ nodeId: 'extra', text: 'extra' }));
    const { text } = aggregate(
      { primary: 'primary', merge: ['extra'], mergeFormat: 'summary' },
      results,
      ['primary']
    );
    expect(text).toBe('main');
  });

  it('should fallback when primary fails', () => {
    const results = new Map<string, NodeResult>();
    results.set('primary', createNodeResult({
      nodeId: 'primary', success: false, error: 'failed',
    }));
    results.set('fallback', createNodeResult({
      nodeId: 'fallback', text: 'fallback result',
    }));
    const { text, success } = aggregate(
      { primary: 'primary' },
      results,
      ['primary', 'fallback']
    );
    expect(text).toBe('fallback result');
    expect(success).toBe(true);
  });

  it('should return error when all nodes fail', () => {
    const results = new Map<string, NodeResult>();
    results.set('a', createNodeResult({ nodeId: 'a', success: false, error: 'err1' }));
    results.set('b', createNodeResult({ nodeId: 'b', success: false, error: 'err2' }));
    const { text, success, error } = aggregate(
      { primary: 'a' },
      results,
      ['a', 'b']
    );
    expect(text).toBe('');
    expect(success).toBe(false);
    expect(error).toContain('err1');
    expect(error).toContain('err2');
  });

  it('should skip failed merge nodes', () => {
    const results = new Map<string, NodeResult>();
    results.set('primary', createNodeResult({ nodeId: 'primary', text: 'main' }));
    results.set('failed', createNodeResult({ nodeId: 'failed', success: false }));
    const { text } = aggregate(
      { primary: 'primary', merge: ['failed'] },
      results,
      ['primary']
    );
    expect(text).toBe('main'); // no merge content
  });
});

describe('formatMerge', () => {
  it('should format as section', () => {
    expect(formatMerge('section', 'review', 'content')).toContain('## review');
    expect(formatMerge('section', 'review', 'content')).toContain('content');
  });

  it('should format as append', () => {
    expect(formatMerge('append', 'x', 'data')).toBe('\n\ndata');
  });
});
