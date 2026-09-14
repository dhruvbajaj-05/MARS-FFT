// Work shift. The engineer PICKS the shift manually from a dropdown on every entry screen
// (moulding, assembly, QC) — it is never auto-detected from the clock any more, so an
// engineer filing a late entry can still book it against the shift it belongs to.
//   A = 08:00–16:00
//   B = 16:00–00:00
//   C = 00:00–08:00
export type Shift = 'A' | 'B' | 'C';

// Dropdown options shared by every entry screen.
export const SHIFT_OPTIONS: Array<{ label: string; value: Shift }> = [
  { label: 'Shift A (08:00–16:00)', value: 'A' },
  { label: 'Shift B (16:00–00:00)', value: 'B' },
  { label: 'Shift C (00:00–08:00)', value: 'C' },
];

// Clock-based guess. Kept only as a helper; entry screens no longer call it.
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
