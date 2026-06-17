'use strict';

const mongoose = require('mongoose');
const env = require('./env');

// Connect to MongoDB Atlas using Mongoose.
// Called once on server start (see server.js).
async function connectDB() {
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(env.mongoUri);
    console.log('[db] Connected to MongoDB Atlas');
    console.log('Database Name:', mongoose.connection.db.databaseName);
  } catch (err) {
    console.error('[db] MongoDB connection error:', err.message);
    // A failed DB connection is fatal — nothing works without it.
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB disconnected');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB error:', err.message);
  });
}

module.exports = connectDB;
