// Work shift derived from the phone's LOCAL clock. The API server runs in UTC, so the
// shift must be computed here (on the engineer's device) and sent with each production /
// assembly submission — otherwise every push would be bucketed by server time.
//   A = 08:00–16:00
//   B = 16:00–00:00
//   C = 00:00–08:00
export type Shift = 'A' | 'B' | 'C';

export function currentShift(date: Date = new Date()): Shift {
  const h = date.getHours();
  if (h >= 8 && h < 16) return 'A';
  if (h >= 16) return 'B';
  return 'C';
}

export function shiftLabel(shift: Shift): string {
  switch (shift) {
    case 'A':
      return 'A (08:00–16:00)';
    case 'B':
      return 'B (16:00–00:00)';
    case 'C':
      return 'C (00:00–08:00)';
  }
}
