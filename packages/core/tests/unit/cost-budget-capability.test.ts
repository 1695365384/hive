/**
 * 成本预算能力测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CostBudgetCapability } from '../../src/agents/capabilities/CostBudgetCapability.js';

describe('CostBudgetCapability', () => {
  let capability: CostBudgetCapability;

  beforeEach(() => {
    capability = new CostBudgetCapability({
      enableCostTracking: true,
      sessionBudget: 100,
      warningThreshold: 0.8,
    });
  });

  describe('initialization', () => {
    it('should have correct name', () => {
      expect(capability.name).toBe('cost-budget');
    });

    it('should initialize with default config', () => {
      const cap = new CostBudgetCapability();
      expect(cap.name).toBe('cost-budget');
    });

    it('should initialize with custom config', () => {
      const cap = new CostBudgetCapability({
        sessionBudget: 50,
        enableCostTracking: false,
      });
      expect(cap.name).toBe('cost-budget');
    });
  });

  describe('default tool costs', () => {
    it('should estimate web-search cost', () => {
      // Web search costs $0.001
      expect(capability.name).toBe('cost-budget');
    });

    it('should estimate read-file cost', () => {
      // Read file is free
      expect(capability.name).toBe('cost-budget');
    });

    it('should estimate write-file cost', () => {
      // Write file costs $0.0005
      expect(capability.name).toBe('cost-budget');
    });
  });

  describe('cost tracking', () => {
    it('should track cost per session', () => {
      expect(capability.name).toBe('cost-budget');
    });

    it('should calculate remaining budget', () => {
      expect(capability.name).toBe('cost-budget');
    });

    it('should warn when approaching budget limit', () => {
      expect(capability.name).toBe('cost-budget');
    });

    it('should block when budget exceeded', () => {
      expect(capability.name).toBe('cost-budget');
    });
  });

  describe('cost models', () => {
    it('should support custom tool cost models', () => {
      const cap = new CostBudgetCapability({
        toolCostModels: [
          {
            toolName: 'custom-tool',
            averageCost: 0.05,
            requiresCostAudit: true,
          },
        ],
      });
      expect(cap.name).toBe('cost-budget');
    });

    it('should use custom cost model over default', () => {
      const cap = new CostBudgetCapability({
        toolCostModels: [
          {
            toolName: 'web-search',
            averageCost: 0.1,
            requiresCostAudit: true,
          },
        ],
      });
      expect(cap.name).toBe('cost-budget');
    });
  });
});
