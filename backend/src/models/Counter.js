'use strict';

const mongoose = require('mongoose');

// counters — atomic sequence generator (one document per named sequence).
// Used to mint sequential, human-readable OrderIDs (FFT-00001, FFT-00002, …).
// The `$inc` in `nextSeq` is atomic and concurrency-safe: two simultaneous order
// creations can never receive the same number.
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // sequence name, e.g. 'orderCode'
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: false }
);

// Atomically increment and return the next value for a named sequence.
counterSchema.statics.nextSeq = async function nextSeq(name) {
  const doc = await this.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc.seq;
};

// Atomically reserve a CONTIGUOUS block of `n` sequence values in a single op and return
// them as an ascending array. Used to mint many OrderIDs at once (e.g. a PO with several
// item-code jobs) without N separate round-trips. Concurrency-safe: the single $inc
// guarantees no other caller can receive an overlapping range.
counterSchema.statics.nextSeqBatch = async function nextSeqBatch(name, n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  if (count === 0) return [];
  const doc = await this.findByIdAndUpdate(
    name,
    { $inc: { seq: count } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const end = doc.seq; // last value in the reserved block
  const start = end - count + 1; // first value
  return Array.from({ length: count }, (_, i) => start + i);
};

module.exports = mongoose.model('Counter', counterSchema);
