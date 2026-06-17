'use strict';

// Single source of truth for the "delayed order" rule, shared by the customer
// dashboard (Phase 8) and the admin dashboard (Phase 9).
//
// The Order model has no due/delivery date, so "delayed" cannot be deadline-based.
// It is an SLA heuristic: an order that is still OPEN (not fully dispatched) after
// DELAYED_AFTER_DAYS counts as delayed. Replace this with a real promised-delivery
// date comparison if/when such a field is added to orders.
const DELAYED_AFTER_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Cutoff Date: orders created before this are old enough to be "delayed".
// Computed from `nowMs` (pass Date.now()) so callers control the clock.
function delayedCutoff(nowMs) {
  return new Date(nowMs - DELAYED_AFTER_DAYS * DAY_MS);
}

// Whole-day age of an order, for reporting how late it is.
function ageInDays(createdAt, nowMs) {
  return Math.floor((nowMs - new Date(createdAt).getTime()) / DAY_MS);
}

module.exports = { DELAYED_AFTER_DAYS, DAY_MS, delayedCutoff, ageInDays };
