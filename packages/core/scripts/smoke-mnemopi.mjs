/**
 * Bun-only smoke for MnemopiMemory FTS remember/recall.
 * Run: bun packages/core/scripts/smoke-mnemopi.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MnemopiMemory } from '../src/memory/MnemopiMemory.ts';

const dir = mkdtempSync(join(tmpdir(), 'hive-mnemopi-smoke-'));
const mem = new MnemopiMemory({ dbPath: join(dir, 'mnemopi.db'), noEmbeddings: true });

try {
  await mem.appendMemory('u1', '用户叫 Ada，偏好简体中文');
  const dump = await mem.readMemory('u1');
  const recalled = await mem.readMemory('u1', 'Ada');
  if (!dump.includes('Ada') || !recalled.includes('Ada')) {
    console.error('FAIL', { dump, recalled });
    process.exit(1);
  }

  await mem.appendMemory('alice', 'Alice secret token ALPHA');
  await mem.appendMemory('bob', 'Bob secret token BETA');
  const alice = await mem.readMemory('alice');
  const bob = await mem.readMemory('bob');
  if (!alice.includes('ALPHA') || alice.includes('BETA') || !bob.includes('BETA') || bob.includes('ALPHA')) {
    console.error('FAIL isolation', { alice, bob });
    process.exit(1);
  }

  console.log('OK mnemopi smoke');
} finally {
  mem.close();
  rmSync(dir, { recursive: true, force: true });
}
