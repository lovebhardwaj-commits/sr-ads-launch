'use client';
import { Calendar, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface Range { preset: string; since: string; until: string }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// Like Meta's presets: "Last N days" ends yesterday.
export const PRESETS: { key: string; label: string; range: () => [Date, Date] }[] = [
  { key: 'today', label: 'Today', range: () => [new Date(), new Date()] },
  { key: 'yesterday', label: 'Yesterday', range: () => [addDays(new Date(), -1), addDays(new Date(), -1)] },
  { key: 'last_3d', label: 'Last 3 Days', range: () => [addDays(new Date(), -3), addDays(new Date(), -1)] },
  { key: 'last_7d', label: 'Last 7 Days', range: () => [addDays(new Date(), -7), addDays(new Date(), -1)] },
  { key: 'last_14d', label: 'Last 14 Days', range: () => [addDays(new Date(), -14), addDays(new Date(), -1)] },
  { key: 'last_30d', label: 'Last 30 Days', range: () => [addDays(new Date(), -30), addDays(new Date(), -1)] },
  { key: 'last_90d', label: 'Last 90 Days', range: () => [addDays(new Date(), -90), addDays(new Date(), -1)] },
  { key: 'this_month', label: 'This Month', range: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), n]; } },
  { key: 'last_month', label: 'Last Month', range: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)]; } },
];

export function presetRange(key: string): Range {
  const p = PRESETS.find((x) => x.key === key) || PRESETS[3];
  const [a, b] = p.range();
  return { preset: p.key, since: iso(a), until: iso(b) };
}

const show = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const rangeText = (r: Range) => `${PRESETS.find((p) => p.key === r.preset)?.label || 'Custom'}: ${show(r.since)} \u2013 ${show(r.until)}`;

/** Date range button with Meta-style presets and a custom start and end date. */
export default function DateRange({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Range>(value);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) setDraft(value); }, [open, value]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);
  const today = iso(new Date());
  const valid = draft.since && draft.until && draft.since <= draft.until && draft.until <= today;
  return (
    <div className="daterange" ref={box}>
      <button type="button" className="dr-button" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Calendar size={14} /> <span>{rangeText(value)}</span> <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="dr-pop" role="dialog" aria-label="Date range">
          <div className="dr-presets" role="radiogroup">
            {PRESETS.map((p) => (
              <label key={p.key} className={draft.preset === p.key ? 'on' : ''}>
                <input type="radio" name="dr" checked={draft.preset === p.key} onChange={() => setDraft(presetRange(p.key))} /> {p.label}
              </label>
            ))}
            <label className={draft.preset === 'custom' ? 'on' : ''}>
              <input type="radio" name="dr" checked={draft.preset === 'custom'} onChange={() => setDraft({ ...draft, preset: 'custom' })} /> Custom
            </label>
          </div>
          <div className="dr-custom">
            <div className="row">
              <label className="field"><span className="label">Start date</span><input className="input" type="date" max={today} value={draft.since} onChange={(e) => setDraft({ ...draft, preset: 'custom', since: e.target.value })} /></label>
              <label className="field"><span className="label">End date</span><input className="input" type="date" max={today} value={draft.until} onChange={(e) => setDraft({ ...draft, preset: 'custom', until: e.target.value })} /></label>
            </div>
            {!valid ? <div className="hint" style={{ color: 'var(--bad)' }}>The start date must be on or before the end date, and the end date can&apos;t be in the future.</div> : <div className="hint">{show(draft.since)} \u2013 {show(draft.until)}. Meta reports in the ad account&apos;s timezone.</div>}
            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="btn-primary" disabled={!valid} onClick={() => { onChange(draft); setOpen(false); }}>Update</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
