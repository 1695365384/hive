/**
 * Persistent memory store used by AgentLoop / remember tool.
 */

export interface PersistentMemory {
  readMemory(userId: string): Promise<string>;
  appendMemory(userId: string, content: string): Promise<void>;
  /** Optional shutdown hook (SQLite backends). */
  close?(): void;
}
