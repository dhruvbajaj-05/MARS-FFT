'use strict';

const mongoose = require('mongoose');

// assortments — Assembly "Bill of Materials" memory (updated workflow).
// For each product store, the Assembly Engineer defines the part requirements PER SET
// (e.g. 100 Mega Block → 65 Big Blocks, 34 Connectors, 1 Lock Piece). The system
// remembers the assortment so future orders surface it as editable dropdown
// suggestions, and uses it to compute component consumption when sets are assembled:
//   consumed(part) = assembledSets × perSet(part).
//
// One assortment per (customer, product). customerId is denormalized from the product
// for convenient filtering; the learning key is (customerId, productId).
const assortmentItemSchema = new mongoose.Schema(
  {
    _id: false,
    partName: { type: String, required: true, trim: true },
    perSet: { type: Number, required: true, min: 0 },
    // Which store this part is consumed from. 'moulded' (default) → moulding components;
    // 'outsourced' → purchased/external components. Kept separate end-to-end.
    kind: { type: String, enum: ['moulded', 'outsourced'], default: 'moulded' },
  },
  { _id: false }
);

const assortmentSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    parts: { type: [assortmentItemSchema], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// One editable assortment per (customer, product) — also makes the upsert idempotent.
assortmentSchema.index({ customerId: 1, productId: 1 }, { unique: true });
assortmentSchema.index({ productId: 1 });

module.exports = mongoose.model('Assortment', assortmentSchema);
