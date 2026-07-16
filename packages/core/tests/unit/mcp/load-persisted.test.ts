/**
 * loadPersistedMcpServersIntoManager — skip officecli, continue on failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { savePersistedMcpServers } from '../../../src/mcp/mcp-config-store.js';
import { loadPersistedMcpServersIntoManager } from '../../../src/mcp/load-persisted.js';
import type { McpManager } from '../../../src/mcp/McpManager.js';

describe('loadPersistedMcpServersIntoManager', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-mcp-boot-'));
  });

  it('skips officecli and loads others; continues after failure', async () => {
    savePersistedMcpServers(
      {
        officecli: { command: 'officecli', args: ['mcp'] },
        good: { command: 'echo', args: ['ok'] },
        bad: { command: 'nope' },
      },
      tmp,
    );

    const addServer = vi.fn(async (id: string) => {
      if (id === 'bad') throw new Error('boom');
      return {} as never;
    });
    const manager = { addServer } as unknown as McpManager;
    const onError = vi.fn();

    const result = await loadPersistedMcpServersIntoManager(manager, {
      cwd: tmp,
      onError,
    });

    expect(addServer).not.toHaveBeenCalledWith('officecli', expect.anything());
    expect(addServer).toHaveBeenCalledWith('good', expect.objectContaining({ command: 'echo' }));
    expect(addServer).toHaveBeenCalledWith('bad', expect.anything());
    expect(result.loaded).toContain('good');
    expect(result.failed).toContain('bad');
    expect(onError).toHaveBeenCalled();

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
