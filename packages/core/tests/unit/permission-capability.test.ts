/**
 * 权限能力测试
 */

import { describe, it, expect } from 'vitest';
import { getToolPermissionLevel, TOOL_PERMISSIONS } from '../../src/tools/permissions.js';

describe('Permission System', () => {
  describe('Tool Permission Levels', () => {
    it('should classify safe tools correctly', () => {
      expect(getToolPermissionLevel('read-file')).toBe('safe');
      expect(getToolPermissionLevel('grep-search')).toBe('safe');
      expect(getToolPermissionLevel('list-dir')).toBe('safe');
    });

    it('should classify restricted tools correctly', () => {
      expect(getToolPermissionLevel('write-file')).toBe('restricted');
      expect(getToolPermissionLevel('run-command')).toBe('restricted');
      expect(getToolPermissionLevel('install-package')).toBe('restricted');
    });

    it('should classify dangerous tools correctly', () => {
      expect(getToolPermissionLevel('delete-file')).toBe('dangerous');
      expect(getToolPermissionLevel('delete-dir')).toBe('dangerous');
      expect(getToolPermissionLevel('run-command-with-root')).toBe('dangerous');
    });

    it('should default unknown tools to safe', () => {
      expect(getToolPermissionLevel('unknown-tool-xyz')).toBe('safe');
    });
  });

  describe('Tool Permission Coverage', () => {
    it('should have all tools classified', () => {
      const allTools = new Set<string>();
      (Object.values(TOOL_PERMISSIONS) as string[][]).forEach(list => {
        list.forEach(tool => allTools.add(tool));
      });

      expect(allTools.size).toBeGreaterThan(0);
      expect(allTools.size).toBe(
        TOOL_PERMISSIONS.safe.length +
          TOOL_PERMISSIONS.restricted.length +
          TOOL_PERMISSIONS.dangerous.length
      );
    });

    it('should have no overlapping tool classifications', () => {
      const safe = new Set(TOOL_PERMISSIONS.safe);
      const restricted = TOOL_PERMISSIONS.restricted as string[];
      const dangerous = TOOL_PERMISSIONS.dangerous as string[];

      restricted.forEach(t => expect(safe.has(t)).toBe(false));
      dangerous.forEach(t => expect(safe.has(t)).toBe(false));
      dangerous.forEach(t => expect(restricted.includes(t)).toBe(false));
    });

    it('should have coverage of common dangerous operations', () => {
      expect(TOOL_PERMISSIONS.dangerous).toContain('delete-file');
      expect(TOOL_PERMISSIONS.dangerous).toContain('delete-dir');
      expect(TOOL_PERMISSIONS.dangerous).toContain('modify-config');
    });

    it('should have coverage of common restricted operations', () => {
      expect(TOOL_PERMISSIONS.restricted).toContain('write-file');
      expect(TOOL_PERMISSIONS.restricted).toContain('run-command');
      expect(TOOL_PERMISSIONS.restricted).toContain('git-push');
    });

    it('should have coverage of common safe operations', () => {
      expect(TOOL_PERMISSIONS.safe).toContain('read-file');
      expect(TOOL_PERMISSIONS.safe).toContain('grep-search');
      expect(TOOL_PERMISSIONS.safe).toContain('list-dir');
    });
  });
});
