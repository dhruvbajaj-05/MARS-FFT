'use strict';

// Auto shift detection from server time (manual selection removed across departments).
//   A = 08:00–16:00
//   B = 16:00–00:00
//   C = 00:00–08:00
function currentShift(date = new Date()) {
  const h = date.getHours();
  if (h >= 8 && h < 16) return 'A';
  if (h >= 16) return 'B';
  return 'C';
}

module.exports = { currentShift };
