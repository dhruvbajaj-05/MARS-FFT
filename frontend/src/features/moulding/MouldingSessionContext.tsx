import React, { createContext, useContext, useMemo, useState } from 'react';

// The order the moulding engineer is currently working on. Set from the Entry tab when a
// Company → Product → Order is chosen, and read by the QC tab so the engineer never has to
// re-select Company / Product / Order to report a defect (QC module req #2).
export interface MouldingActiveOrder {
  customerId: string;
  productId: string;
  orderId: string;
  customerName: string | null;
  productName: string | null;
  orderCode: string | null;
}

interface MouldingSessionValue {
  active: MouldingActiveOrder | null;
  setActive: (order: MouldingActiveOrder | null) => void;
}

const MouldingSessionContext = createContext<MouldingSessionValue | undefined>(undefined);

// Lives above the moulding tab navigator so the selection survives tab switches.
export function MouldingSessionProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<MouldingActiveOrder | null>(null);
  const value = useMemo(() => ({ active, setActive }), [active]);
  return <MouldingSessionContext.Provider value={value}>{children}</MouldingSessionContext.Provider>;
}

export function useMouldingSession(): MouldingSessionValue {
  const ctx = useContext(MouldingSessionContext);
  if (!ctx) throw new Error('useMouldingSession must be used within a MouldingSessionProvider');
  return ctx;
}
