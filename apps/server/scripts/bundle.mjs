/**
 * SEA bundling removed.
 *
 * Hive agent kernel is pi (@oh-my-pi/pi-coding-agent) and must run under Bun.
 * Node SEA cannot ship pi TypeScript entrypoints / natives.
 *
 * Use: bun apps/server/dist/main.js
 */
console.error('[bundle] SEA bundling is unsupported; agent kernel is pi — use Bun start');
process.exit(1);
