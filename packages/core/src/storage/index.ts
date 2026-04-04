/**
 * Storage Layer
 *
 * SQLite-based persistence for sessions and memories.
 */

// Database
export { DatabaseManager, createDatabase, type DatabaseConfig } from './Database.js';

// Migration
export {
  MigrationRunner,
  registerMigration,
  type Migration
} from './MigrationRunner.js';

// Repositories
export {
  SessionRepository,
  createSessionRepository,
  type ISessionRepository
} from './SessionRepository.js';

export {
  MemoryRepository,
  createMemoryRepository,
  type IMemoryRepository,
  type MemoryEntry
} from './MemoryRepository.js';

export {
  ScheduleRepository,
  createScheduleRepository,
} from './ScheduleRepository.js';

export {
  CheckpointRepository,
  type WorkflowCheckpoint,
  type WorkflowCheckpointData,
  type WorkflowCheckpointPhase,
} from './CheckpointRepository.js';

export type { IScheduleRepository } from '../scheduler/types.js';

// Row types (for consumers extending storage)
export type {
  SessionRow,
  MessageRow,
  MemoryRow,
  SessionListRow,
  IdRow
} from './types.js';

// Migrations (auto-registers on import)
import './migrations/index.js';
