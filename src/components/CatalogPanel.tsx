'use client';
import { AlertTriangle, CheckCircle2, Info, RefreshCw, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, errorText } from '@/lib/client-api';
import { useAsync } from '@/lib/hooks';
import type { AdAccount } from '@/lib/types';
import { Field, Loading, SearchSelect, Select } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Catalog { id: string; name: string; product_count?: number; vertical?: string; business?: string; shared?: boolean; relevance?: 'USED' | 'LINKED' | 'BUSINESS' }

const RELEVANCE: Record<string, string> = { USED: 'Used in this ad account', LINKED: 'Linked to this ad account\u2019s dataset' };
type State = 'pass' | 'warn' | 'fail' | 'info';
interface Row { state: State; title: string; detail?: string; action?: 'link' }

const isUnavailable = (x: any): x is { unavailable: string } => x && typeof x === 'object' && 'unavailable' in x;

/** Turn the raw health payload into readable checks. */
export function readHealth(h: any, pixelId: string): { rows: Row[]; ready: boolean } {
  const rows: Row[] = [];
  let ready = true;

  // Products
  if (isUnavailable(h.info)) {
    rows.push({ state: 'warn', title: "Couldn't read the product count", detail: h.info.unavailable });
  } else {
    const n = Number(h.info?.product_count || 0);
    if (n > 0) rows.push({ state: 'pass', title: `${n.toLocaleString('en-IN')} products in the catalog` });
    else { rows.push({ state: 'fail', title: 'The catalog has no products', detail: 'Sync your store to this catalog in Commerce Manager first.' }); ready = false; }
  }

  // Pixel link
  if (!pixelId) {
    rows.push({ state: 'fail', title: 'Pick the dataset above', detail: 'Catalog ads use its ViewContent, AddToCart and Purchase events to choose products.' });
    ready = false;
  } else if (isUnavailable(h.sources)) {
    rows.push({ state: 'warn', title: "Couldn't confirm the pixel is linked to this catalog", detail: h.sources.unavailable });
  } else if (Array.isArray(h.sources) && h.sources.some((s: any) => s.id === pixelId)) {
    rows.push({ state: 'pass', title: 'Pixel is linked to this catalog' });
  } else {
    rows.push({ state: 'fail', title: "Pixel isn't linked to this catalog", detail: "Without the link, Meta can't match shopper events to products.", action: 'link' });
    ready = false;
  }

  // Match rate (event_stats)
  const stats = !isUnavailable(h.stats) ? (h.stats?.data || []) : [];
  const byEvent = new Map<string, { m: number; u: number }>();
  for (const r of stats) {
    const ev = r.event || r.event_name;
    if (!ev) continue;
    const m = Number(r.total_matched_content_ids ?? r.matched ?? 0);
    const u = Number(r.total_unmatched_content_ids ?? r.unmatched ?? 0) + Number(r.total_content_ids_matched_other_catalogs ?? 0);
    const cur = byEvent.get(ev) || { m: 0, u: 0 };
    byEvent.set(ev, { m: cur.m + m, u: cur.u + u });
  }
  const parts: string[] = [];
  let worst = 101;
  byEvent.forEach((v, k) => {
    const total = v.m + v.u;
    if (!total) return;
    const pct = Math.round((v.m / total) * 100);
    worst = Math.min(worst, pct);
    parts.push(`${k} ${pct}%`);
  });
  if (parts.length) {
    rows.push({
      state: worst >= 75 ? 'pass' : worst >= 50 ? 'warn' : 'fail',
      title: `Event match rate: ${parts.join(', ')}`,
      detail: worst >= 75 ? undefined : 'Product IDs in pixel events should equal catalog IDs (on Shopify: variant IDs). Low matches mean ads show the wrong products.',
    });
  } else {
    rows.push({ state: 'info', title: 'Match rate not available yet', detail: 'Meta shows it once the pixel has sent product events for this catalog.' });
  }

  // Pixel checks for catalog ads
  if (h.checks && !isUnavailable(h.checks)) {
    const failed = (h.checks.data || []).filter((c: any) => c.result && c.result !== 'passed');
    if (failed.length) failed.slice(0, 3).forEach((c: any) => rows.push({ state: 'warn', title: c.title || c.key, detail: c.description }));
    else if ((h.checks.data || []).length) rows.push({ state: 'pass', title: 'Pixel sends the events catalog ads need' });
  }

  // Catalog diagnostics
  if (h.diagnostics && !isUnavailable(h.diagnostics)) {
    const issues: string[] = [];
    const walk = (x: any) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if (x.title && (x.num_items || x.severity)) issues.push(`${x.title}${x.num_items ? ` (${x.num_items})` : ''}`);
      Object.values(x).forEach((v) => { if (typeof v === 'object') walk(v); });
    };
    walk(h.diagnostics.data);
    if (issues.length) rows.push({ state: 'warn', title: `${issues.length} catalog ${issues.length === 1 ? 'issue' : 'issues'} in Commerce Manager`, detail: issues.slice(0, 3).join('; ') });
  }

  return { rows, ready };
}

const ICON: Record<State, JSX.Element> = {
  pass: <CheckCircle2 size={16} />,
  warn: <AlertTriangle size={16} />,
  fail: <XCircle size={16} />,
  info: <Info size={16} />,
};

export default function CatalogPanel({ account, catalogId, locked, onCatalog, productSets, productSetsLoading, productSetsError, productSetId, onProductSet, pixelId, onReady, showHealth = true, pixels, pixelsLoading, onPixel }: {
  account: AdAccount;
  catalogId: string;
  locked: boolean;
  onCatalog: (id: string) => void;
  productSets: { id: string; name: string; product_count?: number }[];
  productSetsLoading: boolean;
  productSetsError: string;
  productSetId: string;
  onProductSet: (id: string) => void;
  /** Chosen in the Ad Set card; used for the pixel checks here. */
  pixelId: string;
  onReady: (ready: boolean) => void;
  /** Hide readiness checks and the dataset (reverse journey: the dataset is chosen later) */
  showHealth?: boolean;
  /** Dataset picker, shown in this card for catalog campaigns */
  pixels?: { id: string; name: string }[];
  pixelsLoading?: boolean;
  onPixel?: (id: string) => void;
}) {
  const catalogs = useAsync<Catalog[]>(`catalogs-${account.id}`, () => apiGet('catalogs', { account: account.id }));
  const health = useAsync<any>(catalogId && showHealth ? `health-${catalogId}-${pixelId}` : null, () => apiGet('health', { catalog: catalogId, pixel: pixelId }));
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);

  const result = useMemo(() => (health.data ? readHealth(health.data, pixelId) : null), [health.data, pixelId]);
  useEffect(() => { onReady(!!result?.ready); }, [result, onReady]);

  // Auto-pick when there's exactly one catalog.
  useEffect(() => {
    if (!locked && !catalogId && catalogs.data?.length === 1) onCatalog(catalogs.data[0].id);
  }, [catalogs.data, catalogId, locked, onCatalog]);

  const link = async () => {
    setLinking(true);
    setLinkError('');
    try { await apiPost('link-pixel', { catalog: catalogId, pixel: pixelId }); health.reload(); }
    catch (e) { setLinkError(errorText(e)); }
    finally { setLinking(false); }
  };

  const current = catalogs.data?.find((c) => c.id === catalogId);
  // Show catalogs this ad account uses or is linked to; the rest of the business on request.
  const relevant = (catalogs.data || []).filter((c) => c.relevance && c.relevance !== 'BUSINESS');
  const scoped = !showAll && relevant.length > 0;
  const listed = scoped ? relevant.concat(current && !relevant.includes(current) ? [current] : []) : (catalogs.data || []);
  const others = (catalogs.data || []).length - relevant.length;
  const sets = productSets.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="card">
      <Field label="Catalog" hint={locked ? 'Set by the campaign.' : undefined}>
        {catalogs.loading ? <Loading text="Loading catalogs…" /> : catalogs.error && !locked ? <div className="notice bad">{catalogs.error}</div> : locked ? (
          <input className="input" disabled value={current ? `${current.name} (${current.id})` : catalogId} />
        ) : catalogs.data && !catalogs.data.length ? (
          <div className="notice warn">No catalogs found for this ad account. It isn&apos;t using one yet and its business has none. Create one in Commerce Manager, or connect your store through the Facebook &amp; Instagram app.</div>
        ) : (
          <>
            <SearchSelect
              value={catalogId}
              onChange={onCatalog}
              ariaLabel="Catalog"
              noun="catalogs"
              placeholder="Select a catalog..."
              searchPlaceholder="Search catalogs by name or ID"
              options={listed.map((c) => ({
                key: c.id,
                label: c.name,
                meta: [c.product_count != null ? `${c.product_count.toLocaleString('en-IN')} products` : '', RELEVANCE[c.relevance || ''] || (c.shared ? 'Shared with the business' : c.business ? `In ${c.business}` : ''), c.id].filter(Boolean).join(' · '),
              }))}
            />
            {relevant.length && others > 0 ? (
              <button type="button" className="btn-link" style={{ marginTop: 6 }} onClick={() => setShowAll(!showAll)}>
                {scoped ? `Show all ${(catalogs.data || []).length} catalogs in the business` : 'Only show catalogs for this ad account'}
              </button>
            ) : !relevant.length && (catalogs.data || []).length ? (
              <div className="hint">This ad account hasn&apos;t used a catalog yet and none is linked to its datasets, so all catalogs in its business are listed.</div>
            ) : null}
          </>
        )}
      </Field>

      {showHealth && onPixel ? (
        <Field label="Dataset" hint="The pixel that sends ViewContent, AddToCart and Purchase from your store. It must be linked to the catalog.">
          {pixelsLoading ? <Loading text="Loading datasets…" /> : (
            <Select value={pixelId} onChange={onPixel} placeholder="Select a dataset..." options={(pixels || []).map((p) => ({ key: p.id, label: `${p.name} (${p.id})` }))} />
          )}
        </Field>
      ) : null}

      {catalogId ? (
        <Field label={`Product sets${productSets.length ? ` (${productSets.length})` : ''}`} hint="The products this ad set can show. Create or edit sets in Commerce Manager.">
          {productSetsLoading ? <Loading text="Loading product sets…" /> : productSetsError ? <div className="notice bad">{productSetsError}</div> : !productSets.length ? (
            <div className="notice warn">This catalog has no product sets yet.</div>
          ) : (
            <>
              {productSets.length > 6 ? (
                <input className="input" style={{ marginBottom: 8 }} placeholder="Search product sets…" value={q} onChange={(e) => setQ(e.target.value)} />
              ) : null}
              <div className="set-list" role="radiogroup" aria-label="Product sets">
                {sets.map((s) => (
                  <label key={s.id} className={`set-row ${s.id === productSetId ? 'on' : ''}`}>
                    <input type="radio" name="product-set" checked={s.id === productSetId} onChange={() => onProductSet(s.id)} />
                    <span className="set-name">{s.name}</span>
                    <span className="set-meta">{s.product_count != null ? `${s.product_count.toLocaleString('en-IN')} products · ` : ''}{s.id}</span>
                  </label>
                ))}
                {!sets.length ? <div className="hint" style={{ padding: 8 }}>No product sets match “{q}”.</div> : null}
              </div>
            </>
          )}
        </Field>
      ) : null}

      {catalogId && showHealth ? (
        <div className="health" aria-live="polite">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="label" style={{ margin: 0 }}>Catalog readiness</span>
            <button type="button" className="btn-link" onClick={health.reload} disabled={health.loading}><RefreshCw size={12} style={{ verticalAlign: -1 }} /> Check again</button>
          </div>
          {health.loading ? <Loading text="Checking catalog…" /> : health.error ? <div className="notice bad">{health.error}</div> : result?.rows.map((r, i) => (
            <div key={i} className={`health-row ${r.state}`}>
              <span className="icon">{ICON[r.state]}</span>
              <div>
                <div className="t">{r.title}</div>
                {r.detail ? <div className="d">{r.detail}</div> : null}
                {r.action === 'link' ? (
                  <div style={{ marginTop: 6 }}>
                    <button type="button" className="btn-ghost" onClick={link} disabled={linking}>{linking ? <span className="spinner" /> : null} Link pixel to catalog</button>
                    {linkError ? <div className="d" style={{ color: 'var(--bad)' }}>{linkError}</div> : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {result && !result.ready ? <div className="hint">Fix the red items to launch.</div> : null}
        </div>
      ) : null}
    </div>
  );
}
