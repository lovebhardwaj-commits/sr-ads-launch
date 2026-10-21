'use client';
import { Fragment, useEffect, useState } from 'react';
import { apiPost, errorText } from '@/lib/client-api';
import { apiGet } from '@/lib/client-api';
import { CTAS, buildUrlTags } from '@/lib/constants';
import { useAsync } from '@/lib/hooks';
import type { AdAccount, AdsetLite, FormState, LaunchResult } from '@/lib/types';
import { adsetFacts } from './AdsetFacts';
import ProductStrip from './ProductStrip';
import { Segmented } from './ui';

type Props = { account: AdAccount; form: FormState; target: AdsetLite; onClose: () => void; onDone: (r: LaunchResult) => void };

export default function AdOnlyReview(props: Props) {
  const { onClose } = props;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="adonly-title" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal"><AdOnlyPanel {...props} /></div>
    </div>
  );
}

/** Review and add the ad to an existing ad set; works in a dialog or on a page. */
export function AdOnlyPanel({ account, form, target, onClose, onDone, backLabel = 'Back', title = true }: Props & { backLabel?: string; title?: boolean }) {
  const [status, setStatus] = useState<'PAUSED' | 'ACTIVE'>('PAUSED');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<LaunchResult | null>(null);
  const [error, setError] = useState('');
  const [understood, setUnderstood] = useState(false);
  const pixels = useAsync<{ id: string; name: string }[]>(`pixels-${account.id}`, () => apiGet('pixels', { account: account.id }));
  const ad = form.ad;
  const isCatalog = ad.kind === 'CATALOG';
  const targetSet = target.promoted_object?.product_set_id;

  const cta = CTAS.find((x) => x.key === ad.cta)?.label;
  const rows: [string, string][] = [
    ['Ad account', account.name],
    ...adsetFacts(target, account),
    ['Ad name', ad.name || `${target.name} - ${isCatalog ? 'Catalog ad' : 'Ad'}`],
    ['Ad', isCatalog
      ? `${ad.format === 'CAROUSEL' ? 'Carousel' : 'Single image or video'} from catalog, "${cta}"`
      : ad.kind === 'POST' ? `Existing ${ad.postSource === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} post` : `New ad with uploaded image${ad.imageName ? ` (${ad.imageName})` : ''}, "${cta}"`],
  ];
  if (isCatalog) rows.push(['Products', targetSet ? 'From the ad set\u2019s product set' : 'From the product set chosen for the ad (ad-level catalog)']);
  if (isCatalog) rows.push(['Clicks go to', ad.destination === 'APP_WEB' ? 'App, website as backup' : 'Website']);
  // The ad tracks website events with the chosen dataset (pixel), else the ad set's own.
  const trackPixel = form.adset.pixelId || target.promoted_object?.pixel_id || '';
  const pxName = (id: string) => { const p = pixels.data?.find((x) => x.id === id); return p ? `${p.name} (${p.id})` : id; };
  rows.push(['Dataset (pixel)', trackPixel ? `${pxName(trackPixel)}, tracks website events for this ad` : 'None chosen']);
  const pixelMismatch = !!(form.adset.pixelId && target.promoted_object?.pixel_id && form.adset.pixelId !== target.promoted_object.pixel_id);
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
    <>
        {title ? <><h2 id="adonly-title">Review &amp; Launch</h2><p className="note">Your ad is added to the existing ad set. The ad set&apos;s budget, audience and schedule stay as they are.</p></> : null}
        <dl className="kv">{rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
        {isCatalog ? <div style={{ marginTop: 12 }}><ProductStrip setId={targetSet || form.adset.productSetId} label="Products the ad can show" /></div> : null}
        {pixelMismatch ? (
          <div className="notice warn" style={{ marginTop: 12 }}>This ad set optimises for <b>{pxName(target.promoted_object?.pixel_id || '')}</b>, but your ad tracks <b>{pxName(form.adset.pixelId)}</b>. Use the same dataset (pixel) unless you mean to track a different one.</div>
        ) : null}
        {!trackPixel ? <div className="notice warn" style={{ marginTop: 12 }}>No dataset (pixel) is chosen, so Ads Manager won&apos;t track website events for this ad. Pick one in the Ad step.</div> : null}
        <div className="field" style={{ marginTop: 18 }}>
          <span className="label">Start as</span>
          <Segmented value={status} onChange={setStatus} options={[{ key: 'PAUSED', label: 'Paused' }, { key: 'ACTIVE', label: 'Active' }]} />
          <div className="hint">{status === 'PAUSED' ? 'The ad is created paused so you can check it in Ads Manager first.' : 'The ad delivers once Meta approves it, if its ad set and campaign are active.'}</div>
          {status === 'ACTIVE' ? (
            <label className="confirm-active"><input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} /> I understand this can start spending as soon as Meta approves it.</label>
          ) : null}
        </div>
        {failed?.error ? (
          <div className="notice bad" style={{ marginTop: 16 }}>
            <b>Facebook rejected the {failed.step}:</b> {failed.error.title ? `${failed.error.title}. ` : ''}{failed.error.userMessage || failed.error.message}
            {failed.error.fbtraceId ? <div style={{ marginTop: 4, opacity: .8 }}>Trace ID: {failed.error.fbtraceId}</div> : null}
          </div>
        ) : null}
        {error ? <div className="notice bad" style={{ marginTop: 16 }}>{error}</div> : null}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>{backLabel}</button>
          <button type="button" className="btn-primary" onClick={go} disabled={busy || (status === 'ACTIVE' && !understood)}>
            {busy ? <><span className="spinner" style={{ borderTopColor: '#fff' }} /> Launching…</> : status === 'ACTIVE' ? 'Add ad and start spending' : 'Add ad paused'}
          </button>
        </div>
    </>
  );
}
