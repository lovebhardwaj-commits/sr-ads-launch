'use client';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/client-api';
import { currencySymbol, fromMinorUnits, objectiveLabel } from '@/lib/constants';
import { useAsync } from '@/lib/hooks';
import type { AdAccount, AdsetLite, CampaignLite } from '@/lib/types';
import { type AdFit, adsetFit, budgetText, campaignFit, statusLabel } from './Pickers';
import { Loading } from './ui';

export type Destination =
  | { kind: 'NEW_CAMPAIGN' }
  | { kind: 'NEW_ADSET'; campaign: CampaignLite }
  | { kind: 'ADSET'; adset: AdsetLite };

/* eslint-disable @typescript-eslint/no-explicit-any */
export function audienceText(t: any): string {
  if (!t) return '';
  const geo = t.geo_locations || {};
  const places = [...(geo.countries || []), ...(geo.regions || []).map((r: any) => r.name || r.key), ...(geo.cities || []).map((c: any) => c.name || c.key)];
  const parts = [
    places.length ? (places.length > 2 ? `${places.slice(0, 2).join(', ')} +${places.length - 2}` : places.join(', ')) : '',
    t.age_min || t.age_max ? `${t.age_min || 18}–${t.age_max && t.age_max < 65 ? t.age_max : '65+'}` : '',
    t.product_audience_specs?.length ? 'Retargeting' : t.targeting_automation?.advantage_audience === 1 ? 'Advantage+ audience' : t.custom_audiences?.length ? 'Custom audiences' : '',
  ];
  return parts.filter(Boolean).join(' · ');
}

export function adsetBudget(a: AdsetLite, currency: string): string {
  const sym = currencySymbol(currency);
  if (a.daily_budget) return `${sym}${Number(fromMinorUnits(a.daily_budget, currency)).toLocaleString('en-IN')}/day`;
  if (a.lifetime_budget) return `${sym}${Number(fromMinorUnits(a.lifetime_budget, currency)).toLocaleString('en-IN')} lifetime`;
  return 'Campaign budget';
}

function AdsetRow({ a, why, selected, onPick, currency }: { a: AdsetLite; why: string; selected: boolean; onPick: () => void; currency: string }) {
  const n = a.ads?.summary?.total_count ?? 0;
  return (
    <button type="button" className={`tree-row ${selected ? 'on' : ''}`} disabled={!!why} title={why || undefined} onClick={onPick} aria-pressed={selected}>
      <span className="radio" aria-hidden />
      <span className="t-name">{a.name}</span>
      {a.promoted_object?.product_set_id ? <span className="badge coral">Catalog</span> : null}
      <span className="t-meta">{[adsetBudget(a, currency), statusLabel(a.effective_status || a.status), `${n} ${n === 1 ? 'ad' : 'ads'}`, audienceText(a.targeting), why].filter(Boolean).join(' · ')}</span>
    </button>
  );
}

/** A campaign's ad sets, fetched only when the campaign is expanded. */
function CampaignChildren({ account, c, blocked, fit, isSel, onChange, fitsOnly }: {
  account: AdAccount; c: CampaignLite; blocked: string; fit: AdFit;
  isSel: (d: Destination) => boolean; onChange: (d: Destination) => void; fitsOnly: boolean;
}) {
  const res = useAsync<AdsetLite[]>(`adsets-c-${c.id}`, () => apiGet('adsets', { account: account.id, campaign: c.id }));
  const all = res.data || [];
  const shown = fitsOnly ? all.filter((a) => !adsetFit(a, fit)) : all;
  const hidden = all.length - shown.length;
  return (
    <div className="tree-children">
      {res.loading ? <Loading text="Loading ad sets…" /> : res.error ? <div className="notice bad">{res.error}</div> : !all.length ? (
        <div className="hint" style={{ padding: '6px 11px' }}>No active or paused ad sets in this campaign.</div>
      ) : !shown.length ? (
        <div className="hint" style={{ padding: '6px 11px' }}>None of this campaign&apos;s {all.length} ad sets can take this ad.</div>
      ) : shown.map((a) => (
        <AdsetRow key={a.id} a={a} why={blocked || adsetFit(a, fit)} selected={isSel({ kind: 'ADSET', adset: a })} onPick={() => onChange({ kind: 'ADSET', adset: a })} currency={account.currency} />
      ))}
      <button type="button" className={`tree-row new ${isSel({ kind: 'NEW_ADSET', campaign: c }) ? 'on' : ''}`} disabled={!!blocked} title={blocked || undefined} onClick={() => onChange({ kind: 'NEW_ADSET', campaign: c })}>
        <span className="radio" aria-hidden />
        <Plus size={14} />
        <span className="t-name">New ad set in this campaign</span>
      </button>
      {hidden && shown.length ? <div className="hint" style={{ padding: '2px 11px' }}>{hidden} {hidden === 1 ? 'ad set doesn\u2019t' : 'ad sets don\u2019t'} fit this ad and {hidden === 1 ? 'is' : 'are'} hidden.</div> : null}
    </div>
  );
}

/**
 * Ads Manager-style tree in a fixed-height card: campaigns load first; a campaign's ad sets load when it
 * is expanded; search looks up campaigns locally and ad sets by name on Meta's side. By default only
 * campaigns and ad sets the ad fits are shown.
 */
export default function DestinationTree({ account, fit, value, onChange }: {
  account: AdAccount;
  fit: AdFit;
  value: Destination | null;
  onChange: (d: Destination) => void;
}) {
  const campaigns = useAsync<CampaignLite[]>(`campaigns-${account.id}`, () => apiGet('campaigns', { account: account.id }));
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [fitsOnly, setFitsOnly] = useState(true);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  const searching = debounced.length >= 2;
  const found = useAsync<AdsetLite[]>(searching ? `adsets-s-${account.id}-${debounced}` : null, () => apiGet('adsets', { account: account.id, search: debounced }));

  const s = debounced.toLowerCase();
  const allRows = useMemo(() => (campaigns.data || [])
    .map((c) => ({ c, blocked: campaignFit(c, fit), hits: (searching ? (found.data || []).filter((a) => a.campaign?.id === c.id) : []).filter((a) => !fitsOnly || !adsetFit(a, fit)) }))
    .filter((r) => !searching || r.c.name.toLowerCase().includes(s) || r.c.id.includes(s) || r.hits.length > 0)
    .sort((x, y) => Number(!!x.blocked) - Number(!!y.blocked)), [campaigns.data, fit, searching, found.data, s, fitsOnly]);
  const rows = fitsOnly ? allRows.filter((r) => !r.blocked) : allRows;
  const hiddenCampaigns = allRows.length - rows.length;

  const isSel = (d: Destination) => !!value && value.kind === d.kind
    && (d.kind !== 'NEW_ADSET' || (value.kind === 'NEW_ADSET' && value.campaign.id === d.campaign.id))
    && (d.kind !== 'ADSET' || (value.kind === 'ADSET' && value.adset.id === d.adset.id));

  return (
    <div className="card tree">
      <div className="tree-head">
        <input className="input" placeholder="Search campaigns and ad sets by name…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className={`tree-row new top ${isSel({ kind: 'NEW_CAMPAIGN' }) ? 'on' : ''}`} onClick={() => onChange({ kind: 'NEW_CAMPAIGN' })} aria-pressed={isSel({ kind: 'NEW_CAMPAIGN' })}>
          <span className="radio" aria-hidden />
          <Plus size={14} />
          <span className="t-name">New campaign</span>
          <span className="t-meta">Create a campaign and ad set for this ad{fit.isCatalog ? ' (with your catalog)' : ''}</span>
        </button>
        <div className="tree-filter">
          <span>{campaigns.data ? `${rows.length} ${rows.length === 1 ? 'campaign' : 'campaigns'}${fitsOnly ? ' this ad fits' : ''}` : ''}</span>
          {hiddenCampaigns || !fitsOnly ? (
            <button type="button" className="btn-link" onClick={() => setFitsOnly(!fitsOnly)}>
              {fitsOnly ? `Show ${hiddenCampaigns} that don\u2019t fit` : 'Only show where this ad fits'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="tree-scroll">
        {campaigns.loading ? <Loading text="Loading campaigns…" /> : campaigns.error ? <div className="notice bad">{campaigns.error}</div> : searching && found.loading ? <Loading text="Searching ad sets…" /> : !rows.length ? (
          <div className="note" style={{ padding: '10px 4px' }}>{searching ? `No campaigns or ad sets match “${debounced}”.` : 'No active or paused campaigns in this ad account. Create a new campaign above.'}</div>
        ) : rows.map(({ c, blocked, hits }) => {
          const selectedInside = (value?.kind === 'ADSET' && value.adset.campaign?.id === c.id) || (value?.kind === 'NEW_ADSET' && value.campaign.id === c.id);
          const expanded = open[c.id] ?? selectedInside;
          const catalog = c.promoted_object?.product_catalog_id;
          const count = c.adsets?.summary?.total_count;
          return (
            <div key={c.id} className={`tree-campaign ${blocked ? 'blocked' : ''}`}>
              <button type="button" className="tree-row camp" onClick={() => setOpen({ ...open, [c.id]: !expanded })} aria-expanded={expanded} title={blocked || undefined}>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="t-name">{c.name}</span>
                <span className={`badge ${catalog ? 'coral' : 'grey'}`}>{catalog ? 'Catalog' : 'Normal'}</span>
                <span className="t-meta">{[objectiveLabel(c.objective), budgetText(c, account.currency), statusLabel(c.effective_status || c.status), count != null ? `${count} ${count === 1 ? 'ad set' : 'ad sets'}` : '', blocked].filter(Boolean).join(' · ')}</span>
              </button>
              {expanded ? (
                <CampaignChildren account={account} c={c} blocked={blocked} fit={fit} isSel={isSel} onChange={onChange} fitsOnly={fitsOnly} />
              ) : hits.length ? (
                <div className="tree-children">
                  {hits.map((a) => <AdsetRow key={a.id} a={a} why={blocked || adsetFit(a, fit)} selected={isSel({ kind: 'ADSET', adset: a })} onPick={() => onChange({ kind: 'ADSET', adset: a })} currency={account.currency} />)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
