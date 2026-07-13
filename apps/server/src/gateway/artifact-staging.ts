/**
 * Stage agent-created files into the HTTP temp dir so /files/:name can serve them.
 */

import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function getArtifactTempDir(): string {
  const home = process.env.HOME || os.homedir();
  return path.join(process.env.HIVE_HOME || path.join(home, '.hive'), 'cache', 'temp');
}

export interface StagedArtifact {
  /** Original absolute path on disk */
  originalPath: string;
  /** Path under temp dir (may equal original if already staged) */
  servedPath: string;
  /** HTTP src for /files/:name */
  src: string;
  /** Display filename (basename without uuid prefix) */
  name: string;
}

/** sessionId+originalPath → staged filename (stable re-staging on live updates) */
const stagedNameByKey = new Map<string, string>();

function stagingKey(sessionId: string, filePath: string): string {
  return `${sessionId}:${path.resolve(filePath)}`;
}

/**
 * Copy artifact into temp dir if needed. Reuses the same staged name per session+path
 * so live updates overwrite one stable URL.
 */
export async function stageArtifactFile(
  sessionId: string,
  filePath: string,
): Promise<StagedArtifact | null> {
  const TEMP_DIR = getArtifactTempDir();
  await mkdir(TEMP_DIR, { recursive: true });

  const abs = path.resolve(filePath);
  const name = path.basename(abs);

  try {
    await stat(abs);
  } catch {
    return null;
  }

  const tempRoot = path.resolve(TEMP_DIR);
  if (abs.startsWith(tempRoot + path.sep) || abs === tempRoot) {
    const savedName = path.basename(abs);
    return { originalPath: abs, servedPath: abs, src: `/files/${savedName}`, name };
  }

  const key = stagingKey(sessionId, abs);
  let savedName = stagedNameByKey.get(key);
  if (!savedName) {
    savedName = `${randomUUID()}_${name}`;
    stagedNameByKey.set(key, savedName);
  }

  const dest = path.join(TEMP_DIR, savedName);
  await copyFile(abs, dest);

  return { originalPath: abs, servedPath: dest, src: `/files/${savedName}`, name };
}

/** Drop staging map entries for a session (optional cleanup) */
export function clearArtifactStaging(sessionId: string): void {
  for (const key of stagedNameByKey.keys()) {
    if (key.startsWith(`${sessionId}:`)) stagedNameByKey.delete(key);
  }
}
