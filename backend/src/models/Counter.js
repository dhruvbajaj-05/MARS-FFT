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

module.exports = mongoose.model('Counter', counterSchema);
