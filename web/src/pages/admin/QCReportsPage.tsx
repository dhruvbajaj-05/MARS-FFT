import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qcReportsApi, type QCListParams } from '@/api/qcReports';
import { errorMessage } from '@/api/client';
import { mediaUrl } from '@/utils/media';
import type { QCDepartment, QCSeverity, QCStatusValue } from '@/api/types';
import { Banner, PageHeader, QueryState, SelectField } from '@/components/ui';

const DEPT_OPTIONS = [
  { label: 'Moulding QC', value: 'moulding' },
  { label: 'Assembly QC', value: 'assembly' },
];
const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' },
];
const SEVERITY_OPTIONS = [
  { label: 'All severities', value: '' },
  { label: 'Minor', value: 'minor' },
  { label: 'Major', value: 'major' },
  { label: 'Critical', value: 'critical' },
];

const sevClass = (s: QCSeverity) =>
  s === 'critical' ? 'tag tag-red' : s === 'major' ? 'tag tag-amber' : 'tag';

// Admin → QC. Browse defect reports (image-first) with filters, open any report to see its
// photos/defects/history, and — as a case handler — open/close the case or add a comment.
// Admin cannot author reports (that's the QC engineer, on mobile), so there is no create form.
export function QCReportsPage() {
  const [department, setDepartment] = useState<QCDepartment>('moulding');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params: QCListParams = {
    department,
    status: (status as QCStatusValue) || undefined,
    severity: severity || undefined,
    limit: 100,
  };
  const reports = useQuery({
    queryKey: ['qc-reports', params],
    queryFn: () => qcReportsApi.list(params),
  });

  return (
    <div className="page">
      <PageHeader title="Quality Control" subtitle="Defect reports across moulding and assembly" />

      <div className="filter-row">
        <SelectField label="Department" value={department} onChange={(v) => setDepartment(v as QCDepartment)} options={DEPT_OPTIONS} />
        <SelectField label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <SelectField label="Severity" value={severity} onChange={setSeverity} options={SEVERITY_OPTIONS} />
      </div>

      <div className="qc-split">
        <div className="qc-list">
          <QueryState
            isLoading={reports.isLoading}
            isError={reports.isError}
            error={reports.error}
            isEmpty={!reports.data?.data.length}
          >
            <div className="list">
              {reports.data?.data.map((r) => (
                <button
                  key={r.id}
                  className={`list-row link${selectedId === r.id ? ' selected' : ''}`}
                  onClick={() => setSelectedId(r.id)}
                >
                  <div>
                    <div className="list-title">
                      {r.itemCode ?? r.productName ?? 'Item'}
                    </div>
                    <div className="list-sub">
                      {r.customerName ?? '—'} · {r.defects.slice(0, 2).join(', ') || 'No defect tags'}
                      {r.photos.length ? ` · ${r.photos.length} photo${r.photos.length === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                  <div className="row-tags">
                    <span className={sevClass(r.severity)}>{r.severity}</span>
                    <span className={`tag ${r.status === 'open' ? 'tag-blue' : 'tag-green'}`}>{r.status}</span>
                  </div>
                </button>
              ))}
            </div>
          </QueryState>
        </div>

        <div className="qc-detail">
          {selectedId ? (
            <ReportDetail id={selectedId} />
          ) : (
            <div className="state state-empty">Select a report to view details.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Full detail for one report: fetched fresh so comments/status reflect the latest actions.
function ReportDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');

  const report = useQuery({ queryKey: ['qc-report', id], queryFn: () => qcReportsApi.get(id) });
  const r = report.data;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['qc-report', id] });
    qc.invalidateQueries({ queryKey: ['qc-reports'] });
  };

  const setStatus = useMutation({
    mutationFn: (next: QCStatusValue) => qcReportsApi.setStatus(id, next),
    onSuccess: invalidate,
  });
  const addComment = useMutation({
    mutationFn: () => qcReportsApi.addComment(id, comment.trim()),
    onSuccess: () => {
      setComment('');
      invalidate();
    },
  });

  if (report.isLoading) return <div className="state state-loading">Loading…</div>;
  if (report.isError || !r) return <div className="state state-error">Failed to load report.</div>;

  return (
    <div className="report">
      <div className="report-head">
        <div>
          <h2>{r.itemCode ?? r.productName ?? 'Report'}</h2>
          <div className="list-sub">
            {r.customerName ?? '—'} · {r.department}
          </div>
        </div>
        <span className={`tag ${r.status === 'open' ? 'tag-blue' : 'tag-green'}`}>{r.status}</span>
      </div>

      {r.photos.length > 0 && (
        <div className="photo-grid">
          {r.photos.map((p) => (
            <a key={p.id} href={mediaUrl(p.url)} target="_blank" rel="noreferrer">
              <img src={mediaUrl(p.url)} alt="QC defect" />
            </a>
          ))}
        </div>
      )}

      <dl className="kv">
        <div>
          <dt>Severity</dt>
          <dd className="cap">{r.severity}</dd>
        </div>
        <div>
          <dt>Defects</dt>
          <dd>{r.defects.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt>Machine / Mould</dt>
          <dd>{[r.machine, r.mould].filter(Boolean).join(' / ') || '—'}</dd>
        </div>
        <div>
          <dt>Reported by</dt>
          <dd>{r.submittedByName ?? '—'}</dd>
        </div>
      </dl>

      {r.description && <p className="report-desc">{r.description}</p>}

      {/* Case action: open/close. Admin is allowed by the backend. */}
      {setStatus.isError && <Banner tone="error">{errorMessage(setStatus.error)}</Banner>}
      <div className="row-actions">
        {r.status === 'open' ? (
          <button className="btn-primary" disabled={setStatus.isPending} onClick={() => setStatus.mutate('closed')}>
            {setStatus.isPending ? 'Closing…' : 'Close case'}
          </button>
        ) : (
          <button className="btn-ghost" disabled={setStatus.isPending} onClick={() => setStatus.mutate('open')}>
            {setStatus.isPending ? 'Reopening…' : 'Reopen case'}
          </button>
        )}
      </div>

      {/* Comments thread. */}
      <div className="subhead">Comments</div>
      <div className="thread">
        {r.comments.length === 0 && <div className="list-sub">No comments yet.</div>}
        {r.comments.map((c, i) => (
          <div className="comment" key={c.id ?? i}>
            <div className="comment-meta">
              {c.authorName ?? 'Unknown'} · {new Date(c.createdAt).toLocaleString()}
            </div>
            <div>{c.text}</div>
          </div>
        ))}
      </div>

      {addComment.isError && <Banner tone="error">{errorMessage(addComment.error)}</Banner>}
      <div className="comment-box">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && comment.trim()) addComment.mutate();
          }}
        />
        <button
          className="btn-primary"
          disabled={!comment.trim() || addComment.isPending}
          onClick={() => addComment.mutate()}
        >
          {addComment.isPending ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  );
}
