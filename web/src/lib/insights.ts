import type {
  DepartmentSummary,
  ProductionSummary,
  PurchaseOrder,
  QCReport,
  RejectionAnalytics,
} from '@/api/types';

// ============================================================================
// The Intelligence Engine.
//
// A deterministic "analyst" that reads the live factory signals (rejections, QC
// defect reports, per-department yield, production flow, purchase-order backlog)
// and emits a ranked feed of plain-English observations + recommended actions —
// the "daily briefing". It runs entirely client-side off the same endpoints the
// dashboard already loads, so it needs no backend or model-hosting changes.
//
// Each rule looks at one signal, decides whether it's worth surfacing, and if so
// returns an Insight carrying a headline, a recommendation, a severity and a
// numeric priority used for ordering. The dashboard renders the top N as a news
// feed and rotates the highest-priority ones through a ticker.
// ============================================================================

export type InsightKind = 'alert' | 'opportunity' | 'trend' | 'win';
export type InsightAccent = 'red' | 'amber' | 'green' | 'blue';

export interface Insight {
  id: string;
  kind: InsightKind;
  accent: InsightAccent;
  priority: number; // higher = surfaced first
  area: string; // short tag, e.g. "Moulding", "Quality", "Backlog"
  title: string; // the headline
  body: string; // the recommendation / what to do
  metric?: string; // optional highlighted figure
}

const KIND_LABEL: Record<InsightKind, string> = {
  alert: 'Action needed',
  opportunity: 'Opportunity',
  trend: 'Trend',
  win: 'Doing well',
};
export const insightKindLabel = (k: InsightKind) => KIND_LABEL[k];

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface InsightInputs {
  rejections?: RejectionAnalytics;
  production?: ProductionSummary;
  departments?: DepartmentSummary;
  qcReports?: QCReport[];
  purchaseOrders?: PurchaseOrder[];
}

// Build the ranked briefing. Pure — same inputs always yield the same feed.
export function buildInsights(input: InsightInputs): Insight[] {
  const out: Insight[] = [];
  const { rejections, production, departments, qcReports, purchaseOrders } = input;

  // ---- 1. Overall reject rate vs produced volume -------------------------
  if (rejections && production) {
    const produced = production.totalMouldingProduction + production.totalAssemblyProduction;
    const rate = pct(rejections.totalRejections, produced + rejections.totalRejections);
    if (produced > 0 && rate >= 5) {
      out.push({
        id: 'reject-rate',
        kind: 'alert',
        accent: rate >= 12 ? 'red' : 'amber',
        priority: 90 + rate,
        area: 'Quality',
        metric: `${round1(rate)}% reject rate`,
        title: `Overall reject rate is running at ${round1(rate)}%`,
        body:
          rate >= 12
            ? 'That is well above a healthy line. Pull the worst-offending department below and review its last few shifts before more material is lost.'
            : 'Slightly elevated. Keep an eye on the department breakdown — a single mould or line is usually driving it.',
      });
    } else if (produced > 0 && rate < 2 && rejections.totalRejections >= 0) {
      out.push({
        id: 'reject-rate-good',
        kind: 'win',
        accent: 'green',
        priority: 30,
        area: 'Quality',
        metric: `${round1(rate)}% reject rate`,
        title: `Reject rate is tight at ${round1(rate)}%`,
        body: 'Quality is holding across the floor. Good moment to capture what the top shifts are doing right as a standard.',
      });
    }
  }

  // ---- 2. Dominant defect type (from QC rejection breakdown) -------------
  if (rejections?.qcDefectBreakdown?.length) {
    const sorted = [...rejections.qcDefectBreakdown].sort((a, b) => b.quantity - a.quantity);
    const top = sorted[0];
    const totalDefects = sorted.reduce((s, d) => s + d.quantity, 0);
    const share = pct(top.quantity, totalDefects);
    if (top.quantity > 0 && share >= 25) {
      out.push({
        id: `defect-${top.defectType}`,
        kind: 'opportunity',
        accent: share >= 50 ? 'red' : 'amber',
        priority: 70 + share / 2,
        area: 'Defects',
        metric: `${round1(share)}% of defects`,
        title: `"${top.defectType}" is your single biggest defect`,
        body: `It accounts for ${round1(share)}% of all logged QC defects (${top.quantity} pcs). Fixing this one root cause would move quality more than anything else — assign an owner and trace it to a mould/line.`,
      });
    }
  }

  // ---- 3. Open + critical QC cases ---------------------------------------
  if (qcReports?.length) {
    const open = qcReports.filter((r) => r.status === 'open');
    const critical = open.filter((r) => r.severity === 'critical');
    if (critical.length > 0) {
      out.push({
        id: 'qc-critical',
        kind: 'alert',
        accent: 'red',
        priority: 100 + critical.length,
        area: 'Quality',
        metric: `${critical.length} critical`,
        title: `${critical.length} critical QC case${critical.length === 1 ? '' : 's'} still open`,
        body: 'Critical defects block dispatch and compound fast. Clear these first — open the Quality Control tab and drive each to closure today.',
      });
    } else if (open.length >= 4) {
      out.push({
        id: 'qc-openpile',
        kind: 'opportunity',
        accent: 'amber',
        priority: 55,
        area: 'Quality',
        metric: `${open.length} open`,
        title: `${open.length} QC cases are sitting open`,
        body: 'The backlog is building. Triage the older ones — an unresolved defect report usually means the line is still producing the same fault.',
      });
    }

    // Recurring defect across multiple reports (pattern detection).
    const defectFreq = new Map<string, number>();
    for (const r of qcReports) for (const d of r.defects) defectFreq.set(d, (defectFreq.get(d) ?? 0) + 1);
    const recurring = [...defectFreq.entries()].sort((a, b) => b[1] - a[1])[0];
    if (recurring && recurring[1] >= 3) {
      out.push({
        id: `pattern-${recurring[0]}`,
        kind: 'trend',
        accent: 'amber',
        priority: 60,
        area: 'Pattern',
        metric: `${recurring[1]} reports`,
        title: `"${recurring[0]}" keeps coming back`,
        body: `It has shown up in ${recurring[1]} separate reports. That is a process signal, not bad luck — worth a short containment action on the responsible station.`,
      });
    }
  }

  // ---- 4. Per-department yield — best and worst --------------------------
  if (departments?.departments?.length) {
    const withVol = departments.departments
      .map((d) => {
        const base = d.throughput + d.rejections;
        return { ...d, yield: base > 0 ? pct(d.throughput, base) : 100, volume: base };
      })
      .filter((d) => d.volume > 0);

    if (withVol.length) {
      const worst = [...withVol].sort((a, b) => a.yield - b.yield)[0];
      const best = [...withVol].sort((a, b) => b.yield - a.yield)[0];

      if (worst.yield < 92) {
        out.push({
          id: `dept-worst-${worst.department}`,
          kind: 'alert',
          accent: worst.yield < 85 ? 'red' : 'amber',
          priority: 80 + (100 - worst.yield) / 5,
          area: cap(worst.department),
          metric: `${round1(worst.yield)}% yield`,
          title: `${cap(worst.department)} has the weakest yield at ${round1(worst.yield)}%`,
          body: `${worst.rejections} of ${worst.volume} pieces are being rejected here. Start the root-cause hunt in ${cap(worst.department)} — it is the highest-leverage place to recover output.`,
        });
      }
      if (best.yield >= 98 && best.department !== worst.department) {
        out.push({
          id: `dept-best-${best.department}`,
          kind: 'win',
          accent: 'green',
          priority: 28,
          area: cap(best.department),
          metric: `${round1(best.yield)}% yield`,
          title: `${cap(best.department)} is running near-perfect at ${round1(best.yield)}%`,
          body: `Cleanest department on the floor. Whatever ${cap(best.department)} is doing on setup and inspection is worth copying to the others.`,
        });
      }
    }
  }

  // ---- 5. Flow bottleneck: QC-accepted piling up vs dispatched -----------
  if (production) {
    const readyButUndispatched = production.totalQcAccepted - production.totalDispatchQuantity;
    if (production.totalQcAccepted > 0 && readyButUndispatched > 0) {
      const share = pct(readyButUndispatched, production.totalQcAccepted);
      if (share >= 25) {
        out.push({
          id: 'flow-dispatch',
          kind: 'opportunity',
          accent: 'blue',
          priority: 50 + share / 4,
          area: 'Dispatch',
          metric: `${readyButUndispatched.toLocaleString()} pcs waiting`,
          title: `${readyButUndispatched.toLocaleString()} QC-passed pieces are not dispatched yet`,
          body: 'Finished goods are stacking up after QC. Check whether dispatch is the bottleneck or whether these are waiting on transport/paperwork — cash is sitting on the floor.',
        });
      }
    }
  }

  // ---- 6. Purchase-order backlog -----------------------------------------
  if (purchaseOrders?.length) {
    const open = purchaseOrders.filter((p) => p.status === 'Open');
    const notStarted = open.filter((p) => (p.completedJobs ?? 0) === 0 && (p.jobCount ?? 0) > 0);
    if (notStarted.length > 0) {
      out.push({
        id: 'po-notstarted',
        kind: 'opportunity',
        accent: 'blue',
        priority: 45,
        area: 'Backlog',
        metric: `${notStarted.length} PO${notStarted.length === 1 ? '' : 's'}`,
        title: `${notStarted.length} open purchase order${notStarted.length === 1 ? ' has' : 's have'} no completed jobs yet`,
        body: 'These POs are fully pending. Confirm they are scheduled on a machine/line so nothing slips past its delivery window.',
      });
    }
    const nearlyDone = open.filter((p) => {
      const jc = p.jobCount ?? 0;
      return jc > 0 && (p.completedJobs ?? 0) >= jc - 1 && (p.completedJobs ?? 0) < jc;
    });
    if (nearlyDone.length > 0) {
      out.push({
        id: 'po-nearly',
        kind: 'trend',
        accent: 'green',
        priority: 40,
        area: 'Backlog',
        metric: `${nearlyDone.length} almost done`,
        title: `${nearlyDone.length} purchase order${nearlyDone.length === 1 ? ' is' : 's are'} one job away from closing`,
        body: 'A small push finishes these. Prioritise the last item-code job on each to free up the PO and update the customer.',
      });
    }
  }

  // ---- Fallback: nothing notable -----------------------------------------
  if (out.length === 0) {
    out.push({
      id: 'all-clear',
      kind: 'win',
      accent: 'green',
      priority: 10,
      area: 'Floor',
      title: 'No red flags on the floor right now',
      body: 'Rejections, QC cases and backlog are all within normal range. Keep logging — the briefing updates the moment a signal moves.',
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
