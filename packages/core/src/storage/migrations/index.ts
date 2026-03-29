/**
 * Migrations Index
 *
 * Import all migrations here to register them.
 */

// Import migrations in order (this registers them)
import './001-initial.js';
import './002-schedules.js';
import './003-schedules-v2.js';

// Re-export for convenience
export { REGISTERED_MIGRATIONS, registerMigration } from '../MigrationRunner.js';
