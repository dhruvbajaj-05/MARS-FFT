'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const env = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

// Build and configure the Express app (kept separate from server start for testability).
function createApp() {
  const app = express();

  // Core middleware.
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  if (env.nodeEnv !== 'test') {
    app.use(morgan('dev'));
  }

  // Serve uploaded media (images) statically. URLs are stored in `mediaassets`.
  app.use(env.upload.publicPath, express.static(env.upload.dir));

  // API routes (all under /api/v1).
  app.use('/api/v1', routes);

  // 404 + central error handler (must be last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
