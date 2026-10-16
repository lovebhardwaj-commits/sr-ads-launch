'use client';
import { Fragment, useEffect, useState } from 'react';
import { apiPost, errorText } from '@/lib/client-api';
import { CTAS, buildUrlTags } from '@/lib/constants';
import type { AdAccount, AdsetLite, FormState, LaunchResult } from '@/lib/types';
import { Segmented } from './ui';

/** Reverse journey: review and add the ad to an existing ad set. */
export default function AdOnlyReview({ account, form, target, onClose, onDone }: {
  account: AdAccount;
  form: FormState;
  target: AdsetLite;
  onClose: () => void;
  onDone: (r: LaunchResult) => void;
}) {
  const [status, setStatus] = useState<'PAUSED' | 'ACTIVE'>('PAUSED');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<LaunchResult | null>(null);
  const [error, setError] = useState('');
  const ad = form.ad;
  const isCatalog = !!target.promoted_object?.product_set_id;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [busy, onClose]);

  const cta = CTAS.find((x) => x.key === ad.cta)?.label;
  const rows: [string, string][] = [
    ['Ad account', account.name],
    ['Campaign', `${target.campaign?.name || ''} (existing)`],
    ['Ad set', `${target.name} (existing)`],
    ['Ad name', ad.name || `${target.name} - ${isCatalog ? 'Catalog ad' : 'Ad'}`],
    ['Ad', isCatalog
      ? `${ad.format === 'CAROUSEL' ? 'Carousel' : 'Single image or video'} from catalog, "${cta}"`
      : ad.kind === 'POST' ? `Existing ${ad.postSource === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} post` : `New ad with uploaded image${ad.imageName ? ` (${ad.imageName})` : ''}, "${cta}"`],
  ];
  if (isCatalog) rows.push(['Products', 'From the ad set\u2019s product set']);
  if (isCatalog || ad.kind === 'UPLOAD') rows.push([isCatalog ? 'See more URL' : 'Website', ad.link]);
  rows.push(['URL parameters', buildUrlTags(ad.urlTags || {}) || 'None']);

  const go = async () => {
    setBusy(true); setError(''); setFailed(null);
    try {
      const result = await apiPost<LaunchResult>('launch', { accountId: account.id, currency: account.currency, mode: 'AD_ONLY', status, form, targetAdset: target });
      if (result.ok) onDone(result); else setFailed(result);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="adonly-title" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal">
        <h2 id="adonly-title">Review &amp; Launch</h2>
        <p className="note">Your ad is added to the existing ad set. The ad set&apos;s budget, audience and schedule stay as they are.</p>
        <dl className="kv">{rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
        <div className="field" style={{ marginTop: 18 }}>
          <span className="label">Start as</span>
          <Segmented value={status} onChange={setStatus} options={[{ key: 'PAUSED', label: 'Paused' }, { key: 'ACTIVE', label: 'Active' }]} />
          <div className="hint">{status === 'PAUSED' ? 'The ad is created paused so you can check it in Ads Manager first.' : 'The ad delivers once Meta approves it, if its ad set and campaign are active.'}</div>
        </div>
        {failed?.error ? (
          <div className="notice bad" style={{ marginTop: 16 }}>
            <b>Facebook rejected the {failed.step}:</b> {failed.error.title ? `${failed.error.title}. ` : ''}{failed.error.userMessage || failed.error.message}
            {failed.error.fbtraceId ? <div style={{ marginTop: 4, opacity: .8 }}>Trace ID: {failed.error.fbtraceId}</div> : null}
          </div>
        ) : null}
        {error ? <div className="notice bad" style={{ marginTop: 16 }}>{error}</div> : null}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="btn-primary" onClick={go} disabled={busy}>
            {busy ? <><span className="spinner" style={{ borderTopColor: '#fff' }} /> Launching…</> : status === 'ACTIVE' ? 'Add ad' : 'Add ad paused'}
          </button>
        </div>
      </div>
    </div>
  );
}
