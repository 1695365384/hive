// Node.js SEA entry point
const { createRequire } = require('node:module');
const path = require('node:path');
require = createRequire(__filename);

// Patch fileURLToPath for CJS/SEA compatibility
const _origFileURLToPath = require('node:url').fileURLToPath;
require('node:url').fileURLToPath = function(url) {
  if (!url || url === 'undefined') {
    url = 'file://' + __filename;
  }
  return _origFileURLToPath(url);
};

// Load and start the server
const mod = require('./index.cjs');
if (mod.startServer) {
  mod.startServer().catch(function(err) {
    console.error('[hive] Failed to start:', err);
    process.exit(1);
  });
}
