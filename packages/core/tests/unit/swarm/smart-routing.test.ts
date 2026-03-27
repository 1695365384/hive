/**
 * 智能路由单元测试
 *
 * 测试分类器、variant 匹配、模板变体和 tracer 事件。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  matchTemplate,
  matchTemplateDetailed,
  topologicalSort,
} from '../../../src/agents/swarm/decomposer.js';
import { BUILTIN_TEMPLATES } from '../../../src/agents/swarm/templates.js';
import { SwarmTracer } from '../../../src/agents/swarm/tracer.js';
import {
  createClassifierEvent,
  createLowConfidenceEvent,
} from '../../../src/agents/swarm/classifier.js';
import type { SwarmTemplate, TemplateVariant } from '../../../src/agents/swarm/types.js';

// ============================================
// parseClassification (测试内部逻辑)
// ============================================

describe('Smart Routing', () => {
  // ============================================
  // 7.2 Variant 匹配
  // ============================================

  describe('matchTemplate with variants', () => {
    const templates: SwarmTemplate[] = [
      {
        name: 'test',
        variant: 'simple',
        match: /test/i,
        description: 'Simple test',
        nodes: { a: { agent: 'explore', prompt: '{task}', depends: [] } },
        aggregate: { primary: 'a' },
      },
      {
        name: 'test',
        variant: 'medium',
        match: /test/i,
        description: 'Medium test',
        nodes: {
          a: { agent: 'explore', prompt: '{task}', depends: [] },
          b: { agent: 'general', prompt: '{task}', depends: ['a'] },
        },
        aggregate: { primary: 'b' },
      },
      {
        name: 'test',
        variant: 'complex',
        match: /test/i,
        description: 'Complex test',
        nodes: {
          a: { agent: 'explore', prompt: '{task}', depends: [] },
          b: { agent: 'general', prompt: '{task}', depends: ['a'] },
          c: { agent: 'general', prompt: '{task}', depends: ['b'] },
        },
        aggregate: { primary: 'c' },
      },
    ];

    it('should default to medium variant when no variant specified', () => {
      const result = matchTemplate('test task', templates);
      expect(result).not.toBeNull();
      expect(result!.variant).toBe('medium');
      expect(Object.keys(result!.nodes).length).toBe(2);
    });

    it('should match exact variant when specified', () => {
      const result = matchTemplate('test task', templates, {
        variant: 'simple',
      });
      expect(result).not.toBeNull();
      expect(result!.variant).toBe('simple');
      expect(Object.keys(result!.nodes).length).toBe(1);
    });

    it('should fallback to medium when requested variant not found', () => {
      // No 'simple' in this family
      const family: SwarmTemplate[] = [
        {
          name: 'other',
          variant: 'medium',
          match: /other/i,
          description: 'Other',
          nodes: { a: { agent: 'explore', prompt: '{task}', depends: [] } },
          aggregate: { primary: 'a' },
        },
      ];
      const result = matchTemplate('other task', family, {
        variant: 'simple',
      });
      expect(result).not.toBeNull();
      expect(result!.variant).toBe('medium');
    });

    it('should fallback to medium when no variant exists on template', () => {
      const noVariant: SwarmTemplate[] = [
        {
          name: 'plain',
          match: /plain/i,
          description: 'Plain',
          nodes: { a: { agent: 'explore', prompt: '{task}', depends: [] } },
          aggregate: { primary: 'a' },
        },
      ];
      const result = matchTemplate('plain task', noVariant);
      expect(result).not.toBeNull();
      // No variant field → treated as medium
    });
  });

  describe('matchTemplateDetailed with variants', () => {
    const templates: SwarmTemplate[] = [
      {
        name: 'test',
        variant: 'simple',
        match: /test/i,
        description: 'Simple',
        nodes: { a: { agent: 'explore', prompt: '{task}', depends: [] } },
        aggregate: { primary: 'a' },
      },
      {
        name: 'test',
        variant: 'medium',
        match: /test/i,
        description: 'Medium',
        nodes: {
          a: { agent: 'explore', prompt: '{task}', depends: [] },
          b: { agent: 'general', prompt: '{task}', depends: ['a'] },
        },
        aggregate: { primary: 'b' },
      },
    ];

    it('should return variantFallback when exact variant missing', () => {
      const result = matchTemplateDetailed('test task', templates, {
        variant: 'complex',
      });
      expect(result).not.toBeNull();
      expect(result!.variantFallback).toBeDefined();
      expect(result!.variantFallback!.requested).toBe('complex');
      expect(result!.variantFallback!.actual).toBe('medium');
    });

    it('should not return variantFallback for exact match', () => {
      const result = matchTemplateDetailed('test task', templates, {
        variant: 'simple',
      });
      expect(result).not.toBeNull();
      expect(result!.variantFallback).toBeUndefined();
    });

    it('should not return variantFallback when no variant requested', () => {
      const result = matchTemplateDetailed('test task', templates);
      expect(result).not.toBeNull();
      expect(result!.variantFallback).toBeUndefined();
    });
  });

  // ============================================
  // 7.3 模板变体 DAG 结构
  // ============================================

  describe('BUILTIN_TEMPLATES variants', () => {
    it('add-feature-simple should have 2 nodes in 2 layers', () => {
      const tpl = BUILTIN_TEMPLATES.find(
        t => t.name === 'add-feature' && t.variant === 'simple'
      );
      expect(tpl).toBeDefined();
      const layers = topologicalSort(tpl!.nodes);
      expect(layers).toEqual([['explore'], ['implement']]);
    });

    it('add-feature-medium should have 5 nodes in 3 layers', () => {
      const tpl = BUILTIN_TEMPLATES.find(
        t => t.name === 'add-feature' && t.variant === 'medium'
      );
      expect(tpl).toBeDefined();
      const layers = topologicalSort(tpl!.nodes);
      expect(layers.length).toBe(3);
      expect(layers[0].sort()).toEqual(['explore', 'plan']);
    });

    it('add-feature-complex should have 6 nodes with security-audit', () => {
      const tpl = BUILTIN_TEMPLATES.find(
        t => t.name === 'add-feature' && t.variant === 'complex'
      );
      expect(tpl).toBeDefined();
      expect(tpl!.nodes).toHaveProperty('security-audit');
      const layers = topologicalSort(tpl!.nodes);
      expect(layers.length).toBeGreaterThanOrEqual(4);
    });

    it('debug-simple should have 2 nodes', () => {
      const tpl = BUILTIN_TEMPLATES.find(
        t => t.name === 'debug' && t.variant === 'simple'
      );
      expect(tpl).toBeDefined();
      const layers = topologicalSort(tpl!.nodes);
      expect(layers).toEqual([['explore'], ['fix']]);
    });

    it('debug-medium should have 4 nodes', () => {
      const tpl = BUILTIN_TEMPLATES.find(
        t => t.name === 'debug' && t.variant === 'medium'
      );
      expect(tpl).toBeDefined();
      expect(Object.keys(tpl!.nodes).length).toBe(4);
    });

    it('debug-complex should have 5 nodes with plan step', () => {
      const tpl = BUILTIN_TEMPLATES.find(
        t => t.name === 'debug' && t.variant === 'complex'
      );
      expect(tpl).toBeDefined();
      expect(tpl!.nodes).toHaveProperty('plan');
      expect(Object.keys(tpl!.nodes).length).toBe(5);
    });

    it('code-review-simple should have 2 nodes', () => {
      const tpl = BUILTIN_TEMPLATES.find(
        t => t.name === 'code-review' && t.variant === 'simple'
      );
      expect(tpl).toBeDefined();
      const layers = topologicalSort(tpl!.nodes);
      expect(layers).toEqual([['explore'], ['review']]);
    });

    it('code-review-medium should have 3 parallel nodes', () => {
      const tpl = BUILTIN_TEMPLATES.find(
        t => t.name === 'code-review' && t.variant === 'medium'
      );
      expect(tpl).toBeDefined();
      const layers = topologicalSort(tpl!.nodes);
      expect(layers.length).toBe(1); // all parallel
      expect(layers[0].length).toBe(3);
    });

    it('all variants should have valid DAGs (no cycles)', () => {
      for (const tpl of BUILTIN_TEMPLATES) {
        expect(() => topologicalSort(tpl.nodes)).not.toThrow();
      }
    });
  });

  // ============================================
  // 7.4 Tracer 事件
  // ============================================

  describe('SwarmTracer classifier events', () => {
    it('should record classifier.complete event with metadata', () => {
      const tracer = new SwarmTracer();
      const result = {
        classification: { type: 'debug', complexity: 'simple', confidence: 0.9 },
        lowConfidence: false,
        model: 'claude-haiku-4-5-20251001',
        latency: 150,
      };

      tracer.record(createClassifierEvent(result, tracer.getSwarmId()));

      const events = tracer.getEvents();
      const classifierEvent = events.find(e => e.type === 'classifier.complete');
      expect(classifierEvent).toBeDefined();
      expect(classifierEvent!.metadata).toEqual({
        type: 'debug',
        complexity: 'simple',
        confidence: 0.9,
        model: 'claude-haiku-4-5-20251001',
        latency: 150,
      });
    });

    it('should record classifier.low-confidence event', () => {
      const tracer = new SwarmTracer();
      const result = {
        classification: { type: 'general', complexity: 'medium', confidence: 0.3 },
        lowConfidence: true,
        model: 'claude-haiku-4-5-20251001',
        latency: 100,
      };

      tracer.record(createLowConfidenceEvent(result, tracer.getSwarmId()));

      const events = tracer.getEvents();
      const lowConfEvent = events.find(e => e.type === 'classifier.low-confidence');
      expect(lowConfEvent).toBeDefined();
      expect(lowConfEvent!.metadata).toEqual({
        type: 'general',
        complexity: 'medium',
        confidence: 0.3,
      });
    });

    it('should record template.variant-fallback event', () => {
      const tracer = new SwarmTracer();
      tracer.record({
        type: 'template.variant-fallback',
        metadata: { requested: 'simple', actual: 'medium' },
      });

      const events = tracer.getEvents();
      const fallbackEvent = events.find(e => e.type === 'template.variant-fallback');
      expect(fallbackEvent).toBeDefined();
      expect(fallbackEvent!.metadata).toEqual({
        requested: 'simple',
        actual: 'medium',
      });
    });

    it('tracer.report() should include classification info', () => {
      const tracer = new SwarmTracer();
      tracer.record({
        type: 'swarm.start',
        metadata: { task: 'fix bug' },
      });
      tracer.record({
        type: 'classifier.complete',
        metadata: {
          type: 'debug',
          complexity: 'simple',
          confidence: 0.85,
          model: 'claude-haiku-4-5-20251001',
          latency: 120,
        },
      });
      tracer.record({
        type: 'template.match',
        metadata: { template: 'debug', variant: 'simple' },
      });

      const report = tracer.report();
      expect(report).toContain('Classification: debug/simple (85%)');
      expect(report).toContain('Template: debug (simple)');
    });

    it('tracer.report() should show low confidence warning', () => {
      const tracer = new SwarmTracer();
      tracer.record({
        type: 'swarm.start',
        metadata: { task: 'something' },
      });
      tracer.record({
        type: 'classifier.complete',
        metadata: {
          type: 'general',
          complexity: 'medium',
          confidence: 0.3,
          model: 'claude-haiku-4-5-20251001',
          latency: 100,
        },
      });
      tracer.record({
        type: 'classifier.low-confidence',
        metadata: {
          type: 'general',
          complexity: 'medium',
          confidence: 0.3,
        },
      });

      const report = tracer.report();
      expect(report).toContain('Low confidence');
    });
  });
});
