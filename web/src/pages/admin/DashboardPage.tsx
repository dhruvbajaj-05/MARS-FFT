import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { adminApi } from '@/api/admin';
import { purchaseOrdersApi } from '@/api/purchaseOrders';
import { qcReportsApi } from '@/api/qcReports';
import { AnimatedSelect, PageHeader, Panel, QueryState } from '@/components/ui';
import { playFadeUp, useBarFill, useCountUp, useStaggerIn, pressPop } from '@/lib/anim';
import { buildInsights, insightKindLabel, type Insight, type InsightKind } from '@/lib/insights';

// Admin dashboard — remodelled. Three bands:
//   1. KPI row keyed to PURCHASE ORDERS (the real commercial unit) rather than the internal
//      per-item-code FFT jobs, with those jobs shown as a supporting figure.
//   2. Intelligence Briefing — a live, generated "daily news" feed of observations and
//      recommendations built from QC / rejection / department / backlog signals.
//   3. Department Health — yield %, reject rate and a health verdict per department, instead
//      of the old bare record/throughput/rejection counts.
export function DashboardPage() {
  // PO-first: pull enough POs to summarise commercial state client-side.
  const pos = useQuery({
    queryKey: ['admin', 'purchase-orders', 'all'],
    queryFn: () => purchaseOrdersApi.list({ limit: 200 }),
  });
  const dashboard = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: adminApi.dashboard });
  const production = useQuery({ queryKey: ['admin', 'production-summary'], queryFn: adminApi.productionSummary });
  const rejections = useQuery({ queryKey: ['admin', 'rejections'], queryFn: adminApi.rejections });
  const departments = useQuery({ queryKey: ['admin', 'departments'], queryFn: adminApi.departments });
  const qc = useQuery({ queryKey: ['qc-reports', 'briefing'], queryFn: () => qcReportsApi.list({ limit: 100 }) });

  const poList = pos.data?.data ?? [];
  const poStats = useMemo(() => {
    const total = pos.data?.pagination.total ?? poList.length;
    const open = poList.filter((p) => p.status === 'Open').length;
    const completed = poList.filter((p) => p.status === 'Completed').length;
    const jobs = poList.reduce((s, p) => s + (p.jobCount ?? 0), 0);
    const piecesOrdered = poList.reduce((s, p) => s + (p.totalQuantity ?? 0), 0);
    return { total, open, completed, jobs, piecesOrdered };
  }, [poList, pos.data?.pagination.total]);

  const insights = useMemo(
    () =>
      buildInsights({
        rejections: rejections.data,
        production: production.data,
        departments: departments.data,
        qcReports: qc.data?.data,
        purchaseOrders: poList,
      }),
    [rejections.data, production.data, departments.data, qc.data?.data, poList],
  );

  return (
    <div className="page">
      <PageHeader title="Command Center" subtitle="Purchase-order health, live intelligence and department quality" />

      {/* ---- Band 1: Purchase-order KPIs ---- */}
      <QueryState isLoading={pos.isLoading || dashboard.isLoading} isError={pos.isError} error={pos.error}>
        <KpiRow
          items={[
            { label: 'Purchase Orders', value: poStats.total, accent: 'blue', sub: `${poStats.jobs} item-code jobs` },
            { label: 'Open POs', value: poStats.open, accent: 'amber', sub: 'in production' },
            { label: 'Completed POs', value: poStats.completed, accent: 'green', sub: 'delivered' },
            { label: 'Pieces Ordered', value: poStats.piecesOrdered, accent: 'blue', sub: 'across open POs' },
            { label: 'Customers', value: dashboard.data?.totalCustomers ?? 0, sub: `${dashboard.data?.totalProducts ?? 0} products` },
          ]}
        />
      </QueryState>

      {/* ---- Band 2: Intelligence Briefing ---- */}
      <IntelligenceBriefing
        insights={insights}
        loading={rejections.isLoading || qc.isLoading || departments.isLoading}
        onRefresh={() => {
          rejections.refetch();
          qc.refetch();
          departments.refetch();
          production.refetch();
        }}
      />

      {/* ---- Band 3: Department Health ---- */}
      <Panel title="Department Health">
        <QueryState
          isLoading={departments.isLoading}
          isError={departments.isError}
          error={departments.error}
          isEmpty={!departments.data?.departments.length}
        >
          <DepartmentHealth departments={departments.data?.departments ?? []} />
        </QueryState>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- KPI row ---
interface KpiItem {
  label: string;
  value: number;
  accent?: 'blue' | 'green' | 'amber' | 'red';
  sub?: string;
}
function KpiRow({ items }: { items: KpiItem[] }) {
  const ref = useStaggerIn('.kpi-card', [items.length]);
  return (
    <div className="kpi-grid" ref={ref}>
      {items.map((it) => (
        <KpiCard key={it.label} {...it} />
      ))}
    </div>
  );
}
function KpiCard({ label, value, accent, sub }: KpiItem) {
  const numRef = useCountUp(value);
  return (
    <div className={`kpi-card${accent ? ` accent-${accent}` : ''}`}>
      <div className="kpi-value" ref={numRef}>
        0
      </div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// ------------------------------------------------- Intelligence Briefing ---
const FILTER_OPTIONS: { label: string; value: InsightKind | 'all' }[] = [
  { label: 'All signals', value: 'all' },
  { label: 'Action needed', value: 'alert' },
  { label: 'Opportunities', value: 'opportunity' },
  { label: 'Trends', value: 'trend' },
  { label: 'Doing well', value: 'win' },
];

function IntelligenceBriefing({
  insights,
  loading,
  onRefresh,
}: {
  insights: Insight[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<InsightKind | 'all'>('all');
  const shown = filter === 'all' ? insights : insights.filter((i) => i.kind === filter);
  const feedRef = useStaggerIn('.insight-card', [shown.length, filter]);
  const refreshRef = useRef<HTMLButtonElement | null>(null);

  const counts = useMemo(() => {
    const c = { alert: 0, opportunity: 0, trend: 0, win: 0 } as Record<InsightKind, number>;
    for (const i of insights) c[i.kind]++;
    return c;
  }, [insights]);

  return (
    <section className="briefing">
      <div className="briefing-head">
        <div className="briefing-title">
          <span className="briefing-dot" />
          <div>
            <h2>Intelligence Briefing</h2>
            <p>
              Generated live from your floor · {insights.length} signal{insights.length === 1 ? '' : 's'}
              {counts.alert > 0 && <> · {counts.alert} need action</>}
            </p>
          </div>
        </div>
        <div className="briefing-controls">
          <AnimatedSelect value={filter} onChange={(v) => setFilter(v as InsightKind | 'all')} options={FILTER_OPTIONS} />
          <button
            className="btn-ghost sm"
            ref={refreshRef}
            onClick={() => {
              pressPop(refreshRef.current);
              onRefresh();
            }}
          >
            ↻ Regenerate
          </button>
        </div>
      </div>

      <Ticker insights={insights} />

      {loading ? (
        <div className="state state-loading">Analysing the floor…</div>
      ) : shown.length === 0 ? (
        <div className="state state-empty">No {filter === 'all' ? '' : insightKindLabel(filter as InsightKind).toLowerCase() + ' '}signals right now.</div>
      ) : (
        <div className="insight-feed" ref={feedRef}>
          {shown.map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </div>
      )}
    </section>
  );
}

// A rotating headline ticker across the top-priority insights. Rotates every ~4.5s with a
// fade/slide; the index is always read modulo the current count so it stays valid as the
// underlying data changes.
function Ticker({ insights }: { insights: Insight[] }) {
  const [idx, setIdx] = useState(0);
  const lineRef = useRef<HTMLDivElement | null>(null);
  const top = insights.slice(0, Math.min(5, insights.length));
  const count = top.length;

  useEffect(() => {
    if (count <= 1) return;
    const id = window.setInterval(() => {
      if (lineRef.current) playFadeUp(lineRef.current, { y: 8, duration: 500 });
      setIdx((i) => (i + 1) % count);
    }, 4500);
    return () => window.clearInterval(id);
  }, [count]);

  if (count === 0) return null;
  const active = idx % count;
  const current = top[active];
  return (
    <div className={`ticker accent-${current.accent}`}>
      <span className="ticker-badge">{insightKindLabel(current.kind)}</span>
      <div className="ticker-line" ref={lineRef}>
        <strong>{current.title}.</strong> {current.body}
      </div>
      <div className="ticker-dots">
        {top.map((_, i) => (
          <span key={i} className={`ticker-dot${i === active ? ' on' : ''}`} />
        ))}
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className={`insight-card accent-${insight.accent}`}>
      <div className="insight-top">
        <span className={`insight-kind kind-${insight.kind}`}>{insightKindLabel(insight.kind)}</span>
        <span className="insight-area">{insight.area}</span>
      </div>
      <h3 className="insight-title">{insight.title}</h3>
      {insight.metric && <div className="insight-metric">{insight.metric}</div>}
      <p className="insight-body">{insight.body}</p>
    </article>
  );
}

// ---------------------------------------------------- Department Health ---
interface DeptRow {
  department: string;
  recordCount: number;
  total: number;
  throughput: number;
  rejections: number;
}
function DepartmentHealth({ departments }: { departments: DeptRow[] }) {
  const ref = useStaggerIn('.dept-card', [departments.length]);
  return (
    <div className="dept-grid" ref={ref}>
      {departments.map((d) => (
        <DeptCard key={d.department} dept={d} />
      ))}
    </div>
  );
}
function DeptCard({ dept }: { dept: DeptRow }) {
  const base = dept.throughput + dept.rejections;
  const yieldPct = base > 0 ? (dept.throughput / base) * 100 : 100;
  const rejectPct = base > 0 ? (dept.rejections / base) * 100 : 0;
  const health = yieldPct >= 98 ? 'good' : yieldPct >= 92 ? 'watch' : 'critical';
  const healthLabel = health === 'good' ? 'Healthy' : health === 'watch' ? 'Watch' : 'Critical';
  const barRef = useBarFill(yieldPct);
  const yieldRef = useCountUp(Math.round(yieldPct * 10) / 10, { format: (n) => `${(Math.round(n * 10) / 10).toFixed(1)}%` });

  return (
    <div className={`dept-card health-${health}`}>
      <div className="dept-head">
        <span className="dept-name">{cap(dept.department)}</span>
        <span className={`dept-badge badge-${health}`}>{healthLabel}</span>
      </div>
      <div className="dept-yield" ref={yieldRef}>
        0.0%
      </div>
      <div className="dept-yield-label">first-pass yield</div>
      <div className="dept-bar">
        <div className={`dept-bar-fill fill-${health}`} ref={barRef} />
      </div>
      <div className="dept-stats">
        <div>
          <span className="dept-stat-value">{dept.throughput.toLocaleString()}</span>
          <span className="dept-stat-label">good pcs</span>
        </div>
        <div>
          <span className="dept-stat-value">{dept.rejections.toLocaleString()}</span>
          <span className="dept-stat-label">rejected</span>
        </div>
        <div>
          <span className={`dept-stat-value ${rejectPct >= 8 ? 'is-bad' : ''}`}>{(Math.round(rejectPct * 10) / 10).toFixed(1)}%</span>
          <span className="dept-stat-label">reject rate</span>
        </div>
      </div>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
