'use strict';

// Reseed the CLOUD / production database (the one Railway uses) with the same clean
// Company → PO → Item Code dataset as `seed:dev`. Run with:  npm run seed:prod
//
// DESTRUCTIVE: wipes every collection in the production DB first. It points at the prod
// database on the same Atlas cluster by swapping the db name (fft-dev → fft-production) in
// MONGODB_URI, then defers to the shared seed logic in seedDev.js.

require('dotenv').config();
if (process.env.MONGODB_URI) {
  process.env.MONGODB_URI = process.env.MONGODB_URI.replace('fft-dev', 'fft-production');
}
// dotenv (already loaded) won't override the value we just set, so seedDev connects to prod.
require('./seedDev');
