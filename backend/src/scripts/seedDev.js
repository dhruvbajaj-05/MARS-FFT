'use strict';

// Development reseed — WIPES the database and seeds a clean Company → PO → Item Code dataset.
// Run with:  npm run seed:dev
//
// DESTRUCTIVE: every collection is emptied first. Intended for development only.
// Seeds: users (admin + one engineer per department + a customer login), machines,
// customers, products (with unique itemCodes), purchase orders (each grouping several item
// code jobs), and a little moulding so the screens have live data.

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { ROLES } = require('../utils/roles');
const { hashPassword } = require('../services/auth.service');

const User = require('../models/User');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Machine = require('../models/Machine');
const OrderMold = require('../models/OrderMold');
const MouldingRecord = require('../models/MouldingRecord');
const purchaseOrderService = require('../services/purchaseOrder.service');
const reconcileService = require('../services/reconcile.service');

const DEV_PASSWORD = process.env.SEED_DEV_PASSWORD || 'Password123!';
const log = (...a) => console.log('[seedDev]', ...a);

async function wipe() {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) {
    await c.deleteMany({});
  }
  log(`wiped ${collections.length} collection(s)`);
}

async function seedUsers() {
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const admin = await User.create({
    name: 'System Admin',
    email: 'admin@fft.local',
    passwordHash,
    role: ROLES.ADMIN,
    customerId: null,
    isActive: true,
  });
  await User.create([
    { name: 'Moulding Engineer', email: 'moulding@fft.local', passwordHash, role: ROLES.MOULDING_ENGINEER, isActive: true },
    { name: 'Assembly Engineer', email: 'assembly@fft.local', passwordHash, role: ROLES.ASSEMBLY_ENGINEER, isActive: true },
    { name: 'QC Engineer', email: 'qc@fft.local', passwordHash, role: ROLES.QC_ENGINEER, isActive: true },
    { name: 'Dispatch Engineer', email: 'dispatch@fft.local', passwordHash, role: ROLES.PACKING_DISPATCH_ENGINEER, isActive: true },
  ]);
  log('seeded users (admin + 4 engineers) — password:', DEV_PASSWORD);
  return { admin, passwordHash };
}

async function seedMachines(adminId) {
  await Machine.create([
    { name: 'IMM-01', category: 'injection', createdBy: adminId },
    { name: 'IMM-02', category: 'injection', createdBy: adminId },
    { name: 'IMM-03', category: 'injection', createdBy: adminId },
    { name: 'BLOW-01', category: 'blow', createdBy: adminId },
  ]);
  log('seeded machines');
}

async function seedCustomerWithLogin(name, email, passwordHash, adminId) {
  const customer = await Customer.create({ name, createdBy: adminId });
  await User.create({
    name: `${name} Buyer`,
    email,
    passwordHash,
    role: ROLES.CUSTOMER,
    customerId: customer._id,
    isActive: true,
  });
  return customer;
}

async function run() {
  await connectDB();
  log('starting reseed…');
  await wipe();
  // Reconcile Product indexes so the (now partial) unique itemCode index replaces any
  // older non-partial one left over from a previous run.
  await Product.syncIndexes();

  const { admin, passwordHash } = await seedUsers();
  await seedMachines(admin._id);

  // Two companies; the first gets a customer login for portal testing.
  const acme = await seedCustomerWithLogin('Acme Toys', 'buyer@acmetoys.com', passwordHash, admin._id);
  const buildright = await Customer.create({ name: 'BuildRight Industries', createdBy: admin._id });
  log('seeded customers (Acme Toys + BuildRight Industries) — customer login: buyer@acmetoys.com');

  // Products carry a UNIQUE itemCode (the manufacturing identifier); name is display only.
  const mk = (customerId, name, itemCode, partName) =>
    Product.create({ customerId, name, itemCode, partName, createdBy: admin._id });
  const [garbage, fire, crane, gearbox, wheel] = await Promise.all([
    mk(acme._id, 'Middle Truck Garbage', '37500', 'Truck Body'),
    mk(acme._id, 'Middle Truck Fire', '37560', 'Truck Body'),
    mk(acme._id, 'Mini Crane', '37620', 'Crane Arm'),
    mk(buildright._id, 'Gearbox Housing', '48010', 'Housing'),
    mk(buildright._id, 'Wheel Assembly', '48090', 'Wheel'),
  ]);
  log('seeded products with item codes: 37500, 37560, 37620, 48010, 48090');

  // Purchase orders — each PO groups several independent Item Code jobs. createPurchaseOrder
  // reuses order.service.createOrder per line (mints orderCode + reconciles) so the whole
  // engine runs exactly as in production.
  const po1 = await purchaseOrderService.createPurchaseOrder({
    customerId: acme._id.toString(),
    lines: [
      { productId: garbage._id.toString(), orderQuantity: 13000 },
      { productId: fire._id.toString(), orderQuantity: 4500 },
      { productId: crane._id.toString(), orderQuantity: 8000 },
    ],
    notes: 'Q3 toy line',
    createdBy: admin._id,
  });
  const po2 = await purchaseOrderService.createPurchaseOrder({
    customerId: buildright._id.toString(),
    lines: [
      { productId: gearbox._id.toString(), orderQuantity: 6000 },
      { productId: wheel._id.toString(), orderQuantity: 20000 },
    ],
    createdBy: admin._id,
  });
  log(`seeded purchase orders: ${po1.purchaseOrder.poNumber} (3 item codes), ${po2.purchaseOrder.poNumber} (2 item codes)`);

  // A little moulding on the first item code job so screens show live production.
  const firstJob = po1.jobs[0]; // Middle Truck Garbage (37500)
  await OrderMold.create({
    orderId: firstJob.id,
    customerId: acme._id,
    productId: garbage._id,
    moldName: 'MT-Body-A',
    partName: 'Truck Body',
    cavity: 2,
    requiredShots: 6500,
    createdBy: admin._id,
  });
  // goodParts = (shotsDone - rejectedShots) * cavity = (1200 - 20) * 2 = 2360
  await MouldingRecord.create({
    orderId: firstJob.id,
    productId: garbage._id,
    customerId: acme._id,
    moldName: 'MT-Body-A',
    partName: 'Truck Body',
    machineNumber: 'IMM-01',
    shift: 'A',
    cavity: 2,
    shotsDone: 1200,
    rejectedShots: 20,
    productionQuantity: 2400,
    goodParts: 2360,
    rejectionReasons: ['Short Shot'],
    createdBy: admin._id,
  });
  // Re-derive the store balances from the moulding history (never $inc).
  await reconcileService.reconcileProduct(acme._id.toString(), garbage._id.toString());
  log('seeded sample moulding on job', firstJob.orderCode, '+ reconciled');

  log('done. Log in as admin@fft.local /', DEV_PASSWORD);
  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('[seedDev] FAILED:', err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
