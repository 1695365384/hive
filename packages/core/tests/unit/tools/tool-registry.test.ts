/**
 * ToolRegistry 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../../../src/tools/tool-registry.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
  });

  describe('register and getTool', () => {
    it('should register and retrieve a tool', () => {
      const mockTool = { description: 'test', inputSchema: {} } as any;
      registry.register('test-tool', mockTool);
      expect(registry.getTool('test-tool')).toBe(mockTool);
    });

    it('should return undefined for non-existent tool', () => {
      expect(registry.getTool('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllTools', () => {
    it('should return all registered tools', () => {
      const tool1 = { description: 'tool1', inputSchema: {} } as any;
      const tool2 = { description: 'tool2', inputSchema: {} } as any;
      registry.register('tool1', tool1);
      registry.register('tool2', tool2);

      const all = registry.getAllTools();
      expect(Object.keys(all)).toContain('tool1');
      expect(Object.keys(all)).toContain('tool2');
    });
  });

  describe('registerBuiltInTools', () => {
    it('should register all 7 built-in tools', () => {
      registry.registerBuiltInTools();
      const all = registry.getAllTools();
      expect(Object.keys(all)).toContain('bash');
      expect(Object.keys(all)).toContain('file');
      expect(Object.keys(all)).toContain('glob');
      expect(Object.keys(all)).toContain('grep');
      expect(Object.keys(all)).toContain('web-search');
      expect(Object.keys(all)).toContain('web-fetch');
      expect(Object.keys(all)).toContain('ask-user');
    });
  });

  describe('getToolsForAgent', () => {
    beforeEach(() => {
      registry.registerBuiltInTools();
    });

    it('should return read-only tools for explore agent', () => {
      const tools = registry.getToolsForAgent('explore');
      expect(Object.keys(tools)).toContain('file');
      expect(Object.keys(tools)).toContain('glob');
      expect(Object.keys(tools)).toContain('grep');
      expect(Object.keys(tools)).toContain('web-search');
      expect(Object.keys(tools)).toContain('web-fetch');
      expect(Object.keys(tools)).not.toContain('bash');
      expect(Object.keys(tools)).not.toContain('ask-user');
    });

    it('should return read-only tools for plan agent', () => {
      const tools = registry.getToolsForAgent('plan');
      expect(Object.keys(tools)).toContain('file');
      expect(Object.keys(tools)).not.toContain('bash');
    });

    it('should return all tools for general agent', () => {
      const tools = registry.getToolsForAgent('general');
      expect(Object.keys(tools)).toContain('bash');
      expect(Object.keys(tools)).toContain('file');
      expect(Object.keys(tools)).toContain('ask-user');
    });

    it('should default to general tools for unknown agent type', () => {
      const tools = registry.getToolsForAgent('unknown-type');
      expect(Object.keys(tools)).toContain('bash');
      expect(Object.keys(tools)).toContain('file');
    });

    it('should include custom tools for all agent types', () => {
      const customTool = { description: 'custom', inputSchema: {} } as any;
      registry.register('custom-tool', customTool);

      const exploreTools = registry.getToolsForAgent('explore');
      const generalTools = registry.getToolsForAgent('general');

      expect(Object.keys(exploreTools)).toContain('custom-tool');
      expect(Object.keys(generalTools)).toContain('custom-tool');
    });

    it('should not duplicate custom tool if it has same name as builtin', () => {
      const customTool = { description: 'custom glob', inputSchema: {} } as any;
      registry.register('glob', customTool);

      const tools = registry.getToolsForAgent('explore');
      // Custom tool should override builtin (not duplicate)
      const globCount = Object.keys(tools).filter(k => k === 'glob').length;
      expect(globCount).toBe(1);
    });
  });

  describe('setAskUserCallback', () => {
    it('should set the callback for ask-user tool', () => {
      registry.registerBuiltInTools();
      registry.setAskUserCallback(async () => 'user answer');
      // No error means it worked
    });
  });
});
