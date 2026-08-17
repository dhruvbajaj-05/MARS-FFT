import { useEffect, useRef, useState, type ReactNode } from 'react';

import { playFadeUp, pressPop } from '@/lib/anim';

// Tiny shared UI primitives so pages stay declarative. Deliberately minimal — no component
// library, just enough structure to keep markup clean.

// A custom, animated dropdown (replaces the native <select> where we want polish). Keeps the
// same {label,value} option shape as SelectField so it's a drop-in. The popover fades/slides
// in via the Web Animations API, the caret rotates, and rows lift on hover. Closes on
// outside-click / Esc.
export function AnimatedSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((o) => o.value === value);

  // Outside-click + Escape to close.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Animate the popover + its rows in on open.
  useEffect(() => {
    if (!open || !popRef.current) return;
    playFadeUp(popRef.current, { y: -6, duration: 220 });
    const rows = Array.from(popRef.current.querySelectorAll('.aselect-option'));
    rows.forEach((row, i) => playFadeUp(row, { x: -6, y: 0, delay: i * 28, duration: 260 }));
  }, [open]);

  return (
    <div className={`aselect${label ? ' has-label' : ''}`} ref={rootRef}>
      {label && <span className="aselect-label">{label}</span>}
      <button
        type="button"
        className={`aselect-trigger${open ? ' open' : ''}`}
        onClick={(e) => {
          pressPop(e.currentTarget);
          setOpen((o) => !o);
        }}
      >
        <span className={selected ? '' : 'aselect-ph'}>{selected?.label ?? placeholder}</span>
        <svg className="aselect-caret" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="aselect-pop" ref={popRef} role="listbox">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`aselect-option${o.value === value ? ' selected' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
              {o.value === value && <span className="aselect-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Labelled text input.
export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

// Labelled dropdown. `options` are {label,value}; an optional placeholder becomes a disabled
// first row when nothing is selected.
export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// A success/error inline banner.
export function Banner({ tone, children }: { tone: 'success' | 'error'; children: ReactNode }) {
  return <div className={`banner banner-${tone}`}>{children}</div>;
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}

export function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: 'blue' | 'green' | 'amber' | 'red';
}) {
  return (
    <div className={`stat-card${accent ? ` accent-${accent}` : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2 className="panel-title">{title}</h2>
      {children}
    </section>
  );
}

// Uniform loading / error / empty states for data-driven pages.
export function QueryState({
  isLoading,
  isError,
  error,
  isEmpty,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  isEmpty?: boolean;
  children: ReactNode;
}) {
  if (isLoading) return <div className="state state-loading">Loading…</div>;
  if (isError) {
    const msg = error instanceof Error ? error.message : 'Failed to load data.';
    return <div className="state state-error">{msg}</div>;
  }
  if (isEmpty) return <div className="state state-empty">Nothing to show yet.</div>;
  return <>{children}</>;
}
