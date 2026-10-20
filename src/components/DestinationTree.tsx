'use client';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
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
function audienceText(t: any): string {
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

function adsetBudget(a: AdsetLite, currency: string): string {
  const sym = currencySymbol(currency);
  if (a.daily_budget) return `${sym}${Number(fromMinorUnits(a.daily_budget, currency)).toLocaleString('en-IN')}/day`;
  if (a.lifetime_budget) return `${sym}${Number(fromMinorUnits(a.lifetime_budget, currency)).toLocaleString('en-IN')} lifetime`;
  return 'Campaign budget';
}

/** Ads Manager-style tree: campaigns with their ad sets, plus "new" options at each level. */
export default function DestinationTree({ account, fit, value, onChange }: {
  account: AdAccount;
  fit: AdFit;
  value: Destination | null;
  onChange: (d: Destination) => void;
}) {
  const campaigns = useAsync<CampaignLite[]>(`campaigns-${account.id}`, () => apiGet('campaigns', { account: account.id }));
  const adsets = useAsync<AdsetLite[]>(`adsets-${account.id}-false`, () => apiGet('adsets', { account: account.id }));
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const byCampaign = useMemo(() => {
    const m: Record<string, AdsetLite[]> = {};
    (adsets.data || []).forEach((a) => { const id = a.campaign?.id || ''; (m[id] = m[id] || []).push(a); });
    return m;
  }, [adsets.data]);

  const s = q.trim().toLowerCase();
  const rows = useMemo(() => (campaigns.data || [])
    .map((c) => {
      const sets = byCampaign[c.id] || [];
      const matchSets = s ? sets.filter((a) => a.name.toLowerCase().includes(s) || a.id.includes(s)) : sets;
      const matchCampaign = !s || c.name.toLowerCase().includes(s) || c.id.includes(s);
      return { c, sets: matchCampaign ? sets : matchSets, blocked: campaignFit(c, fit), visible: matchCampaign || matchSets.length > 0 };
    })
    .filter((r) => r.visible)
    .sort((x, y) => Number(!!x.blocked) - Number(!!y.blocked)), [campaigns.data, byCampaign, s, fit]);

  const isSel = (d: Destination) => !!value && value.kind === d.kind
    && (d.kind !== 'NEW_ADSET' || (value.kind === 'NEW_ADSET' && value.campaign.id === d.campaign.id))
    && (d.kind !== 'ADSET' || (value.kind === 'ADSET' && value.adset.id === d.adset.id));

  return (
    <div className="card tree">
      <input className="input" placeholder="Search campaigns and ad sets by name or ID…" value={q} onChange={(e) => setQ(e.target.value)} />

      <button type="button" className={`tree-row new top ${isSel({ kind: 'NEW_CAMPAIGN' }) ? 'on' : ''}`} onClick={() => onChange({ kind: 'NEW_CAMPAIGN' })} aria-pressed={isSel({ kind: 'NEW_CAMPAIGN' })}>
        <span className="radio" aria-hidden />
        <Plus size={14} />
        <span className="t-name">New campaign</span>
        <span className="t-meta">Create a campaign and ad set for this ad{fit.isCatalog ? ' (with your catalog)' : ''}</span>
      </button>

      {campaigns.loading || adsets.loading ? <Loading text="Loading campaigns and ad sets…" /> : campaigns.error ? <div className="notice bad">{campaigns.error}</div> : !rows.length ? (
        <div className="note" style={{ padding: '10px 4px' }}>{q ? `Nothing matches “${q}”.` : 'No active or paused campaigns in this ad account. Create a new campaign above.'}</div>
      ) : rows.map(({ c, sets, blocked }) => {
        const selectedInside = (value?.kind === 'ADSET' && value.adset.campaign?.id === c.id) || (value?.kind === 'NEW_ADSET' && value.campaign.id === c.id);
        const expanded = open[c.id] ?? (!!s || selectedInside);
        const catalog = c.promoted_object?.product_catalog_id;
        return (
          <div key={c.id} className={`tree-campaign ${blocked ? 'blocked' : ''}`}>
            <button type="button" className="tree-row camp" onClick={() => setOpen({ ...open, [c.id]: !expanded })} aria-expanded={expanded} title={blocked || undefined}>
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="t-name">{c.name}</span>
              <span className={`badge ${catalog ? 'coral' : 'grey'}`}>{catalog ? 'Catalog' : 'Normal'}</span>
              <span className="t-meta">{objectiveLabel(c.objective)} · {budgetText(c, account.currency)} · {statusLabel(c.effective_status || c.status)} · {sets.length} {sets.length === 1 ? 'ad set' : 'ad sets'}{blocked ? ` · ${blocked}` : ''}</span>
            </button>
            {expanded ? (
              <div className="tree-children">
                {sets.map((a) => {
                  const why = blocked || adsetFit(a, fit);
                  const d: Destination = { kind: 'ADSET', adset: a };
                  const n = a.ads?.summary?.total_count ?? 0;
                  return (
                    <button key={a.id} type="button" className={`tree-row ${isSel(d) ? 'on' : ''}`} disabled={!!why} title={why || undefined} onClick={() => onChange(d)} aria-pressed={isSel(d)}>
                      <span className="radio" aria-hidden />
                      <span className="t-name">{a.name}</span>
                      {a.promoted_object?.product_set_id ? <span className="badge coral">Catalog</span> : null}
                      <span className="t-meta">{[adsetBudget(a, account.currency), statusLabel(a.effective_status || a.status), `${n} ${n === 1 ? 'ad' : 'ads'}`, audienceText(a.targeting), why].filter(Boolean).join(' · ')}</span>
                    </button>
                  );
                })}
                <button type="button" className={`tree-row new ${isSel({ kind: 'NEW_ADSET', campaign: c }) ? 'on' : ''}`} disabled={!!blocked} title={blocked || undefined} onClick={() => onChange({ kind: 'NEW_ADSET', campaign: c })} aria-pressed={isSel({ kind: 'NEW_ADSET', campaign: c })}>
                  <span className="radio" aria-hidden />
                  <Plus size={14} />
                  <span className="t-name">New ad set in this campaign</span>
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
