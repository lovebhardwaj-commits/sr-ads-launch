'use client';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import type { AdAccount, LaunchResult } from '@/lib/types';

export default function ResultView({ result, account, onAgain }: { result: LaunchResult; account: AdAccount; onAgain: () => void }) {
  const act = account.account_id || account.id.replace('act_', '');
  const base = 'https://adsmanager.facebook.com/adsmanager/manage';
  const c = result.created;
  const link = c.campaign
    ? `${base}/campaigns?act=${act}&selected_campaign_ids=${c.campaign.id}`
    : c.adset ? `${base}/adsets?act=${act}&selected_adset_ids=${c.adset.id}` : `${base}/campaigns?act=${act}`;

  return (
    <div style={{ marginTop: 30 }}>
      <div className="card">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--ok)' }}>
          <CheckCircle2 size={20} />
          <h2 className="section-title" style={{ margin: 0, color: 'var(--ink)' }}>{result.activated ? 'Launched' : 'Launched paused'}</h2>
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          {result.activated ? 'Your ads start delivering once Meta approves them.' : 'Everything is paused. Turn it on in Ads Manager when you are ready.'}
        </p>
        <dl className="kv">
          {c.campaign ? <><dt>Campaign</dt><dd>{c.campaign.name} · {c.campaign.id}</dd></> : null}
          {c.adset ? <><dt>Ad set</dt><dd>{c.adset.name} · {c.adset.id}</dd></> : null}
          {c.ads.length ? <><dt>{c.ads.length === 1 ? 'Ad' : `Ads (${c.ads.length})`}</dt><dd>{c.ads.map((a) => a.name).join(', ')}</dd></> : null}
        </dl>
        <div className="launch-bar">
          <a className="btn-primary" href={link} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            Open in Ads Manager <ExternalLink size={13} />
          </a>
          <button type="button" className="btn-ghost" onClick={onAgain}>Launch another</button>
        </div>
      </div>
    </div>
  );
}
