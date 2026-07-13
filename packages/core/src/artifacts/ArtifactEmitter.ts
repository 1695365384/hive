/**
 * ArtifactEmitter — push deliverable files to Desktop via FileEvent (agent.file).
 */

import fs from 'node:fs';
import type { ILogger } from '../types/logger.js';
import type { FileEvent } from '../server/types.js';
import { SessionId } from '../server/SessionId.js';
import { detectArtifactsFromToolCall } from './artifact-detector.js';

export type EmitFileFn = (event: FileEvent) => void;

export class ArtifactEmitter {
  /** sessionId → artifact path → last emitted mtimeMs (re-emit when file changes) */
  private emittedBySession = new Map<string, Map<string, number>>();

  constructor(
    private emitFile: EmitFileFn,
    private logger: ILogger,
  ) {}

  /** Clear dedup state when a chat dispatch finishes */
  clearSession(sessionId: string): void {
    this.emittedBySession.delete(sessionId);
  }

  /**
   * Scan a tool result and emit file events for new or updated artifacts.
   * Returns paths that were newly emitted.
   */
  scanToolResult(
    sessionId: string,
    toolName: string,
    input: unknown,
    output: unknown,
  ): string[] {
    const paths = detectArtifactsFromToolCall(toolName, input, output);
    const newly: string[] = [];
    for (const filePath of paths) {
      if (this.emitPath(sessionId, filePath)) newly.push(filePath);
    }
    return newly;
  }

  /** Emit artifact when new or file mtime changed (live preview while Worker edits) */
  emitPath(sessionId: string, filePath: string, content = ''): boolean {
    let seen = this.emittedBySession.get(sessionId);
    if (!seen) {
      seen = new Map();
      this.emittedBySession.set(sessionId, seen);
    }

    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(filePath).mtimeMs;
    } catch {
      return false;
    }

    if (seen.get(filePath) === mtimeMs) return false;
    seen.set(filePath, mtimeMs);

    const threadId = SessionId.recipient(sessionId);
    const event: FileEvent = {
      sessionId,
      threadId,
      filePath,
      content,
      type: 'file',
    };
    this.emitFile(event);
    this.logger.info(`[artifact] Pushed ${filePath} → thread ${threadId}`);
    return true;
  }
}

/** Factory for ServerImpl wiring */
export function createArtifactEmitter(
  emitFile: EmitFileFn,
  logger: ILogger,
): ArtifactEmitter {
  return new ArtifactEmitter(emitFile, logger);
}
