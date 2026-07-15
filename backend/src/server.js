'use strict';

const env = require('./config/env');
const connectDB = require('./config/db');
const createApp = require('./app');
const storeService = require('./services/store.service');

async function start() {
  await connectDB();
  await storeService.ensureStoreIndexes();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[server] FFT Manufacturing API running on port ${env.port} (${env.nodeEnv})`);
  });
}

start().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  process.exit(1);
});
