/**
 * mcp-config-store + normalize + catalog-style enable guards
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadPersistedMcpServers,
  savePersistedMcpServers,
  upsertPersistedMcpServer,
  removePersistedMcpServer,
  getMcpConfigPath,
} from '../../../src/mcp/mcp-config-store.js';
import {
  isHttpMcpConfig,
  normalizeMcpServerConfig,
} from '../../../src/providers/types.js';
import { isAllowedUrl } from '../../../src/tools/built-in/utils/security.js';

describe('mcp-config-store', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-mcp-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns empty object when file missing', () => {
    expect(loadPersistedMcpServers(tmp)).toEqual({});
  });

  it('round-trips stdio and http configs', () => {
    savePersistedMcpServers(
      {
        local: { command: 'npx', args: ['-y', 'foo'] },
        remote: { transport: 'http', url: 'https://example.com/mcp' },
      },
      tmp,
    );
    const loaded = loadPersistedMcpServers(tmp);
    expect(loaded.local).toMatchObject({ transport: 'stdio', command: 'npx' });
    expect(isHttpMcpConfig(loaded.remote)).toBe(true);
    expect(fs.existsSync(getMcpConfigPath(tmp))).toBe(true);
  });

  it('upsert and remove work', () => {
    upsertPersistedMcpServer('a', { command: 'echo' }, tmp);
    expect(Object.keys(loadPersistedMcpServers(tmp))).toEqual(['a']);
    removePersistedMcpServer('a', tmp);
    expect(loadPersistedMcpServers(tmp)).toEqual({});
  });
});

describe('normalizeMcpServerConfig', () => {
  it('defaults missing transport + command to stdio', () => {
    const n = normalizeMcpServerConfig({ command: 'x' });
    expect(n).toEqual({ transport: 'stdio', command: 'x', args: undefined, env: undefined, enabled: undefined });
  });

  it('keeps http transport', () => {
    const n = normalizeMcpServerConfig({ transport: 'http', url: 'https://a.example/mcp' });
    expect(isHttpMcpConfig(n)).toBe(true);
  });
});

describe('remote URL guards', () => {
  it('rejects non-https', () => {
    expect(isAllowedUrl('http://evil.example/mcp').allowed).toBe(false);
  });

  it('allows https', () => {
    expect(isAllowedUrl('https://mcp.example.com/v1').allowed).toBe(true);
  });
});
