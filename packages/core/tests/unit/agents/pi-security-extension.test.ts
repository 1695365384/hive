import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { evaluatePiToolSecurity } from '../../../src/agents/core/pi-security-extension.js';
import {
  setAllowedRoots,
  _resetAllowedRoots,
} from '../../../src/tools/built-in/utils/security.js';
import {
  createSessionFsContext,
  runWithSessionFs,
} from '../../../src/workspace/session-fs.js';

describe('evaluatePiToolSecurity', () => {
  const workspace = resolve('/tmp/hive-jail-workspace-test');

  beforeEach(() => {
    setAllowedRoots([workspace]);
  });

  afterEach(() => {
    _resetAllowedRoots();
  });

  it('blocks read outside allowed roots', async () => {
    const sessionFs = createSessionFsContext('jail-test', workspace);
    await runWithSessionFs(sessionFs, async () => {
      const verdict = evaluatePiToolSecurity('read', {
        path: '/etc/passwd',
      });
      expect(verdict.block).toBe(true);
      if (verdict.block) {
        expect(verdict.reason).toMatch(/workspace jail|Path blocked/i);
      }
    });
  });

  it('allows read inside workspace', async () => {
    const sessionFs = createSessionFsContext('jail-test', workspace);
    await runWithSessionFs(sessionFs, async () => {
      const verdict = evaluatePiToolSecurity('read', {
        path: resolve(workspace, 'notes.md'),
      });
      expect(verdict.block).toBe(false);
    });
  });

  it('allows relative write paths inside session workspace', async () => {
    const sessionFs = createSessionFsContext('jail-test', workspace);
    await runWithSessionFs(sessionFs, async () => {
      const verdict = evaluatePiToolSecurity('write', {
        path: 'smoke-tools.txt',
      });
      expect(verdict.block).toBe(false);
    });
  });

  it('blocks path traversal via ../ escape', async () => {
    const sessionFs = createSessionFsContext('jail-test', workspace);
    await runWithSessionFs(sessionFs, async () => {
      const verdict = evaluatePiToolSecurity('write', {
        path: resolve(workspace, 'subdir/../../etc/passwd'),
      });
      expect(verdict.block).toBe(true);
    });
  });

  it('blocks dangerous bash', () => {
    const verdict = evaluatePiToolSecurity('bash', {
      command: 'rm -rf /',
    });
    expect(verdict.block).toBe(true);
  });
});
