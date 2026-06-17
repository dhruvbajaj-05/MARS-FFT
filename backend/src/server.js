'use strict';

// Entry point: load env, connect to MongoDB Atlas, then start the HTTP server.
const env = require('./config/env');
const connectDB = require('./config/db');
const createApp = require('./app');
const storeService = require('./services/store.service');

async function start() {
  await connectDB();
  // Repair/sync the Component + Surplus store indexes before serving traffic so a new
  // OrderID can always create its own balance cell (drops the stale product-level index).
  await storeService.ensureStoreIndexes();

  const app = createApp();
  // Bind to 0.0.0.0 so devices on the LAN (e.g. a phone running Expo) can reach the
  // API by the machine's IPv4 address — the default bind is IPv6-only and refuses
  // those connections.
  app.listen(env.port, '0.0.0.0', () => {
    console.log(`[server] FFT Manufacturing API running on port ${env.port} (${env.nodeEnv})`);
  });
}

start().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  process.exit(1);
});
