'use client';
import { useMemo, useState } from 'react';
import { apiGet } from '@/lib/client-api';
import { currencySymbol, fromMinorUnits, normalizeObjective, objectiveLabel } from '@/lib/constants';
import { useAsync } from '@/lib/hooks';
import type { AdAccount, AdsetLite, CampaignLite } from '@/lib/types';
import { Loading } from './ui';

function budgetText(c: { daily_budget?: string; lifetime_budget?: string }, currency: string) {
  const sym = currencySymbol(currency);
  if (c.daily_budget) return `${sym}${Number(fromMinorUnits(c.daily_budget, currency)).toLocaleString('en-IN')}/day`;
  if (c.lifetime_budget) return `${sym}${Number(fromMinorUnits(c.lifetime_budget, currency)).toLocaleString('en-IN')} lifetime`;
  return 'Ad set budgets';
}

const statusLabel = (s?: string) => (s || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function CampaignPicker({ account, title, source, onPick }: {
  account: AdAccount;
  title: string;
  source?: AdsetLite;
  onPick: (c: CampaignLite) => void;
}) {
  const res = useAsync<CampaignLite[]>(`campaigns-${account.id}`, () => apiGet('campaigns', { account: account.id }));
  const [q, setQ] = useState('');

  const sourceCatalog = source?.campaign?.promoted_object?.product_catalog_id;
  const sourceObjective = source ? normalizeObjective(source.campaign?.objective) : '';
  const sourceIsCatalog = !!source?.promoted_object?.product_set_id;

  const items = useMemo(() => (res.data || [])
    .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()))
    .map((c) => {
      const catalog = c.promoted_object?.product_catalog_id;
      let blocked = '';
      if (source) {
        if (normalizeObjective(c.objective) !== sourceObjective) blocked = `Needs a ${objectiveLabel(sourceObjective)} campaign`;
        else if (sourceIsCatalog && catalog !== sourceCatalog) blocked = 'Needs the same catalog as the original';
        else if (!sourceIsCatalog && catalog) blocked = 'Catalog campaigns only take catalog ad sets';
      }
      return { c, catalog, blocked };
    })
    .sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked)), [res.data, q, source, sourceCatalog, sourceObjective, sourceIsCatalog]);

  return (
    <div>
      <h2 className="section-title" style={{ marginTop: 0 }}>{title}</h2>
      <input className="input" placeholder="Search campaigns…" value={q} onChange={(e) => setQ(e.target.value)} />
      {res.loading ? <Loading text="Loading campaigns…" /> : res.error ? <div className="notice bad" style={{ marginTop: 12 }}>{res.error}</div> : (
        <div className="list">
          {!items.length ? <div className="note">No active or paused campaigns{q ? ` match “${q}”` : ' in this ad account'}.</div> : null}
          {items.map(({ c, catalog, blocked }) => (
            <button key={c.id} type="button" className="list-item" disabled={!!blocked} onClick={() => onPick(c)} title={blocked || undefined}>
              <div>
                <div className="name">{c.name}</div>
                <div className="sub">{objectiveLabel(c.objective)} · {budgetText(c, account.currency)} · {statusLabel(c.effective_status || c.status)}{blocked ? ` · ${blocked}` : ''}</div>
              </div>
              {catalog ? <span className="badge coral">Catalog</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdsetPicker({ account, onPick }: { account: AdAccount; onPick: (a: AdsetLite) => void }) {
  const res = useAsync<AdsetLite[]>(`adsets-${account.id}`, () => apiGet('adsets', { account: account.id }));
  const [q, setQ] = useState('');
  const items = (res.data || []).filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()) || (a.campaign?.name || '').toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <h2 className="section-title" style={{ marginTop: 0 }}>Pick the ad set to duplicate</h2>
      <input className="input" placeholder="Search ad sets or campaigns…" value={q} onChange={(e) => setQ(e.target.value)} />
      {res.loading ? <Loading text="Loading ad sets…" /> : res.error ? <div className="notice bad" style={{ marginTop: 12 }}>{res.error}</div> : (
        <div className="list">
          {!items.length ? <div className="note">No active or paused ad sets{q ? ` match “${q}”` : ' in this ad account'}.</div> : null}
          {items.map((a) => {
            const n = a.ads?.summary?.total_count ?? 0;
            return (
              <button key={a.id} type="button" className="list-item" onClick={() => onPick(a)}>
                <div>
                  <div className="name">{a.name}</div>
                  <div className="sub">{a.campaign?.name} · {n} {n === 1 ? 'ad' : 'ads'} · {statusLabel(a.effective_status || a.status)}</div>
                </div>
                {a.promoted_object?.product_set_id ? <span className="badge coral">Catalog</span> : <span className="badge grey">{objectiveLabel(a.campaign?.objective)}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
