'use strict';

// Loads and validates environment variables once, so the rest of the app
// can import a clean, typed config object instead of reading process.env.

const path = require('path');

require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  mongoUri: required('MONGODB_URI'),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiry: process.env.JWT_EXPIRY || '7d',

  // Optional — only used by the seed script.
  seedAdmin: {
    name: process.env.SEED_ADMIN_NAME || 'System Admin',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@fft.local',
    password: process.env.SEED_ADMIN_PASSWORD || '',
  },

  // Image / file uploads (engineers attach images to department records).
  upload: {
    // Where binaries are written on disk (served statically at `publicPath`).
    dir: process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads'),
    publicPath: '/uploads',
    // Optional absolute URL prefix (e.g. https://cdn.fft.app) for stored media URLs.
    baseUrl: process.env.PUBLIC_BASE_URL || '',
    // Max image size in bytes (default 5 MB) and allowed image mime types (Q-IMG1).
    maxImageBytes: parseInt(process.env.MAX_IMAGE_BYTES, 10) || 5 * 1024 * 1024,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
    // Max document size (default 10 MB) and allowed document mime types
    // (dispatch invoices / LR copies — PDFs or scanned images).
    maxDocBytes: parseInt(process.env.MAX_DOC_BYTES, 10) || 10 * 1024 * 1024,
    allowedDocTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  },
};

module.exports = env;
