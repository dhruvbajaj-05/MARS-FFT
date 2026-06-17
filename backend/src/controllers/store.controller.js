'use strict';

const storeService = require('../services/store.service');

// Phase 2/4 — Store module (read-only HTTP surface). Stock is mutated only as a side
// effect of department submissions (moulding / qc / dispatch), never via these routes.

// GET /api/v1/store/components — Customer → Product → Part hierarchy.
async function componentTree(req, res, next) {
  try {
    const tree = await storeService.getComponentStoreTree({ customerId: req.query.customerId });
    res.status(200).json({ store: 'COMPONENT', customers: tree });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/store/components/availability?customerId=&productId=&orderId= — parts for
// one product (optionally scoped to a single order's buckets).
async function componentAvailability(req, res, next) {
  try {
    const result = await storeService.getComponentAvailability(
      req.query.customerId,
      req.query.productId,
      { orderId: req.query.orderId || undefined }
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/store/components/by-order?customerId=&productId=&orderId=
// Order-scoped Component Store: Customer → Product → OrderID → Pending/Finished/Surplus.
async function componentByOrder(req, res, next) {
  try {
    const customers = await storeService.getComponentStoreByOrder({
      customerId: req.query.customerId,
      productId: req.query.productId,
      orderId: req.query.orderId,
    });
    res.status(200).json({ store: 'COMPONENT', customers });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/store/finished-goods — Customer → Product hierarchy.
async function finishedGoodsTree(req, res, next) {
  try {
    const tree = await storeService.getFinishedGoodsStoreTree({ customerId: req.query.customerId });
    res.status(200).json({ store: 'FINISHED_GOODS', customers: tree });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/store/finished-goods/availability?customerId=&productId= — one product balance.
async function finishedGoodsAvailability(req, res, next) {
  try {
    const result = await storeService.getFinishedGoodsBalance(req.query.customerId, req.query.productId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/store/ledger — paginated audit trail (admin only).
async function ledger(req, res, next) {
  try {
    res.status(200).json(await storeService.listLedger(req.query));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  componentTree,
  componentAvailability,
  componentByOrder,
  finishedGoodsTree,
  finishedGoodsAvailability,
  ledger,
};
