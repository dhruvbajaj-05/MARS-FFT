'use strict';

// One-off utility to create the initial Admin account.
// V1 has no public signup (Q-AUTH1), so the first admin must be seeded.
// Run with:  npm run seed:admin   (uses SEED_ADMIN_* from .env)

const mongoose = require('mongoose');
const env = require('../config/env');
const connectDB = require('../config/db');
const User = require('../models/User');
const { ROLES } = require('../utils/roles');
const { hashPassword } = require('../services/auth.service');

async function seedAdmin() {
  if (!env.seedAdmin.password) {
    console.error('[seed] SEED_ADMIN_PASSWORD is not set in .env — aborting.');
    process.exit(1);
  }

  await connectDB();

  const email = env.seedAdmin.email.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`[seed] Admin already exists: ${email}`);
    await mongoose.connection.close();
    return;
  }

  const passwordHash = await hashPassword(env.seedAdmin.password);
  await User.create({
    name: env.seedAdmin.name,
    email,
    passwordHash,
    role: ROLES.ADMIN,
    customerId: null,
    isActive: true,
  });

  console.log(`[seed] Created admin: ${email}`);
  await mongoose.connection.close();
}

seedAdmin().catch(async (err) => {
  console.error('[seed] Failed:', err.message);
  try {
    await mongoose.connection.close();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
