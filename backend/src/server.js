'use strict';

const env = require('./config/env');
const connectDB = require('./config/db');
const createApp = require('./app');
const storeService = require('./services/store.service');
const orderMoldService = require('./services/orderMold.service');

async function start() {
  await connectDB();
  await storeService.ensureStoreIndexes();
  // Mould identity = setup row id (names may repeat): drops the old unique name index and
  // back-fills orderMoldId on older production records. Idempotent.
  await orderMoldService.ensureMouldIdentity();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[server] FFT Manufacturing API running on port ${env.port} (${env.nodeEnv})`);
  });
}

start().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  process.exit(1);
});
