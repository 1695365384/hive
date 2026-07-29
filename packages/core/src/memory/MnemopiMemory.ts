/**
 * MnemopiMemory — Hive PersistentMemory backed by @oh-my-pi/pi-mnemopi.
 *
 * One SQLite DB under `{workspace}/.hive/mnemopi/mnemopi.db`, banks keyed by userId.
 * Default: FTS-only (`noEmbeddings`) so Desktop/Server start without onnx peers.
 *
 * Requires Bun at runtime (`bun:sqlite`). Node unit tests should skip live DB cases.
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { PersistentMemory } from './types.js';

type MnemopiLike = {
  remember: (
    memory: string,
    options?: {
      source?: string;
      importance?: number;
      veracity?: string;
      memoryType?: string;
    },
  ) => string;
  recall: (query: string, topK?: number) => Promise<Array<{ content: string }>>;
  getContext: (limit?: number) => unknown[];
  close: () => void;
};

type MnemopiCtor = new (options: {
  dbPath: string;
  bank: string;
  noEmbeddings?: boolean;
  llm?: false;
}) => MnemopiLike;

export function sanitizeMemoryBank(userId: string): string {
  const trimmed = userId.trim() || 'default';
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'default';
}

export function resolveMnemopiDbPath(workspaceDir: string): string {
  return resolve(workspaceDir, '.hive', 'mnemopi', 'mnemopi.db');
}

export function isMnemopiRuntimeAvailable(): boolean {
  return typeof process.versions.bun === 'string';
}

export type MnemopiMemoryOptions = {
  /** Absolute path to SQLite file (or `:memory:` for tests). */
  dbPath: string;
  /** Skip local/remote embeddings — FTS recall only (default true). */
  noEmbeddings?: boolean;
};

export class MnemopiMemory implements PersistentMemory {
  private readonly dbPath: string;
  private readonly noEmbeddings: boolean;
  private readonly engines = new Map<string, MnemopiLike>();
  private MnemopiCtor: MnemopiCtor | null = null;

  constructor(options: MnemopiMemoryOptions) {
    if (!isMnemopiRuntimeAvailable()) {
      throw new Error('MnemopiMemory requires the Bun runtime (bun:sqlite)');
    }
    this.dbPath = options.dbPath;
    this.noEmbeddings = options.noEmbeddings !== false;
    if (this.dbPath !== ':memory:') {
      mkdirSync(dirname(this.dbPath), { recursive: true });
    }
  }

  /** Convenience: workspace-rooted DB under `.hive/mnemopi/`. */
  static forWorkspace(workspaceDir: string, opts?: { noEmbeddings?: boolean }): MnemopiMemory {
    return new MnemopiMemory({
      dbPath: resolveMnemopiDbPath(workspaceDir),
      noEmbeddings: opts?.noEmbeddings,
    });
  }

  /** One SQLite file per user bank (getContext is not bank-scoped on a shared DB). */
  private dbPathFor(userId: string): string {
    if (this.dbPath === ':memory:') return ':memory:';
    const bank = sanitizeMemoryBank(userId);
    return resolve(dirname(this.dbPath), `${bank}.db`);
  }

  private async loadCtor(): Promise<MnemopiCtor> {
    if (this.MnemopiCtor) return this.MnemopiCtor;
    const mod = await import('@oh-my-pi/pi-mnemopi');
    this.MnemopiCtor = mod.Mnemopi as unknown as MnemopiCtor;
    return this.MnemopiCtor;
  }

  private async engineFor(userId: string): Promise<MnemopiLike> {
    const bank = sanitizeMemoryBank(userId);
    let engine = this.engines.get(bank);
    if (!engine) {
      const Ctor = await this.loadCtor();
      engine = new Ctor({
        dbPath: this.dbPathFor(userId),
        bank,
        noEmbeddings: this.noEmbeddings,
        llm: false,
      });
      this.engines.set(bank, engine);
    }
    return engine;
  }

  async appendMemory(userId: string, content: string): Promise<void> {
    const text = content.trim();
    if (!text) return;
    const engine = await this.engineFor(userId);
    engine.remember(text, {
      source: 'hive-remember',
      importance: 0.8,
      veracity: 'stated',
      memoryType: 'preference',
    });
  }

  /**
   * Dump recent memories for system-prompt injection (FileMemory-compatible).
   * Prefer query-aware recall when a hint is provided.
   */
  async readMemory(userId: string, recallQuery?: string): Promise<string> {
    const engine = await this.engineFor(userId);
    if (recallQuery?.trim()) {
      const hits = await engine.recall(recallQuery.trim(), 12);
      if (hits.length === 0) return '';
      return hits.map((h) => `- ${h.content}`).join('\n');
    }

    const ctx = engine.getContext(40) as Array<{ content?: string; timestamp?: string | null }>;
    if (!Array.isArray(ctx) || ctx.length === 0) return '';
    return ctx
      .map((row) => {
        const body = typeof row?.content === 'string' ? row.content.trim() : '';
        if (!body) return '';
        const ts = row.timestamp ? ` (${row.timestamp})` : '';
        return `- ${body}${ts}`;
      })
      .filter(Boolean)
      .join('\n');
  }

  close(): void {
    for (const engine of this.engines.values()) {
      try {
        engine.close();
      } catch {
        // ignore
      }
    }
    this.engines.clear();
  }
}
