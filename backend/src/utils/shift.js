'use strict';

// Auto shift detection (manual selection removed across departments).
//   A = 08:00–16:00
//   B = 16:00–00:00
//   C = 00:00–08:00
//
// IMPORTANT: the shift must reflect the ENGINEER'S local time, not the server's. The API
// server runs in UTC (Atlas / cloud host), so `new Date().getHours()` on the server would
// bucket everything wrongly (e.g. every IST afternoon push landed in Shift A). The client
// therefore computes its own shift from the phone clock and sends it; `resolveShift` trusts
// that value when valid and only falls back to server time when it is missing/invalid.
function currentShift(date = new Date()) {
  const h = date.getHours();
  if (h >= 8 && h < 16) return 'A';
  if (h >= 16) return 'B';
  return 'C';
}

const VALID_SHIFTS = new Set(['A', 'B', 'C']);

// Resolve the shift to store: prefer the client-supplied shift (the phone's local time),
// falling back to server time only when the client value is absent or invalid.
function resolveShift(clientShift, date = new Date()) {
  const v = String(clientShift || '').trim().toUpperCase();
  if (VALID_SHIFTS.has(v)) return v;
  return currentShift(date);
}

module.exports = { currentShift, resolveShift };
