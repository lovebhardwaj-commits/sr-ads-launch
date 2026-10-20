'use client';
import { Fragment, useEffect, useState } from 'react';
import { apiPost, errorText } from '@/lib/client-api';
import {
  ATTRIBUTION, BID_STRATEGIES, CATALOG_EVENTS, CONVERSION_EVENTS, CTAS, PLATFORMS, RETARGET_PRESETS, buildUrlTags, catalogAudienceSpec, currencySymbol, goalsFor, objectiveLabel,
} from '@/lib/constants';
import type { AdAccount, AdsetLite, CampaignLite, FlowContext, FormState, LaunchResult, Mode } from '@/lib/types';
import type { ProductSet } from './LaunchForm';
import { Segmented } from './ui';

export default function ReviewModal({ mode, account, form, ctx, campaign, source, productSets, pixels, onClose, onDone }: {
  mode: Mode;
  account: AdAccount;
  form: FormState;
  ctx: FlowContext;
  campaign?: CampaignLite;
  source?: AdsetLite;
  productSets: ProductSet[];
  pixels: { id: string; name: string }[];
  onClose: () => void;
  onDone: (r: LaunchResult) => void;
}) {
  const [status, setStatus] = useState<'PAUSED' | 'ACTIVE'>('PAUSED');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<LaunchResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [busy, onClose]);

  const c = form.campaign;
  const a = form.adset;
  const sym = currencySymbol(account.currency);
  const goal = goalsFor(ctx.objective, ctx.isCatalog).find((g) => g.key === a.goal);
  const setName = (id: string) => productSets.find((s) => s.id === id)?.name || id;
  const usesAudience = !ctx.isCatalog || a.catalogAudience === 'BROAD';

  const rows: [string, string][] = [];
  rows.push(['Ad account', account.name]);
  if (ctx.needsCampaign) {
    rows.push(['Campaign', `${c.name} (new)`]);
    rows.push(['Objective', `${objectiveLabel(c.objective)}${ctx.isCatalog ? ' with catalog' : ''}`]);
    rows.push(['Setup', c.setup === 'ADVANTAGE_PLUS' ? 'Advantage+ Shopping' : 'Manual']);
    const bid = BID_STRATEGIES.find((b) => b.key === c.bidStrategy);
    rows.push(['Bid strategy', `${bid?.label}${bid?.needs === 'bid' ? `, ${sym}${c.bidAmount}` : bid?.needs === 'roas' ? `, ${c.roasFloor}x` : ''}`]);
  } else if (campaign) {
    rows.push(['Campaign', `${campaign.name} (existing)`]);
  }
  if (ctx.showBudget) rows.push([ctx.adsetBudget ? 'Ad set budget' : 'Campaign budget (Advantage+ campaign budget)', `${sym}${Number(form.budget.amount).toLocaleString('en-IN')} ${form.budget.type === 'DAILY' ? 'per day' : `lifetime, ends ${new Date(form.budget.endDate).toLocaleString('en-IN')}`}`]);
  rows.push(['Ad set', a.name]);
  if (ctx.isCatalog) {
    rows.push(['Product set', setName(a.productSetId)]);
    if (a.catalogAudience === 'BROAD') rows.push(['Catalog audience', 'Broad audience']);
    else {
      const ca = catalogAudienceSpec(a);
      const preset = RETARGET_PRESETS.find((p) => p.key === a.retargetPreset)?.label || a.retargetPreset;
      let detail = `${preset}, in the past ${a.retargetDays} days`;
      if (a.retargetPreset === 'UPSELL' || a.retargetPreset === 'CROSS_SELL') detail = `${preset}: people who interacted with ${setName(a.crossSellSourceSetId)}, in the past ${a.retargetDays} days`;
      if (a.retargetPreset === 'CUSTOM') {
        const ev = ca.events.map((e) => CATALOG_EVENTS.find((x) => x.key === e)?.label.toLowerCase()).join(' or ');
        detail = `Custom combination: ${ev} in the past ${a.retargetDays} days${ca.exclude ? `, excluding people who purchased in the past ${ca.excludeDays} days` : ''}`;
      }
      rows.push(['Catalog audience', `Retarget ads to people who interacted with your products. ${detail}`]);
    }
  }
  rows.push(['Performance goal', goal?.label || a.goal]);
  if (ctx.campaignHasBudget) rows.push(['Budget', 'Uses the campaign budget']);
  if (goal?.pixel || ctx.isCatalog) {
    if (goal?.pixel) rows.push(['Conversion event', CONVERSION_EVENTS.find((e) => e.key === (goal.fixedEvent || a.event))?.label || a.event]);
    const px = pixels.find((p) => p.id === a.pixelId);
    rows.push(['Pixel', px ? `${px.name} (${px.id})` : a.pixelId]);
  }
  if (usesAudience) {
    rows.push(['Audience', a.audienceType === 'ADVANTAGE' ? 'Advantage+ Audience' : a.audienceType === 'INTEREST' ? `Interests: ${a.interests.map((i) => i.name).join(', ')}` : a.audienceType === 'SAVED' ? 'Saved audience' : 'Same as original ad set']);
  }
  if (!(usesAudience && a.audienceType === 'SAVED')) {
    rows.push(['Locations', a.locations.map((l) => l.name).join(', ')]);
    rows.push(['Age and gender', `${a.ageMin}–${a.ageMax === 65 ? '65+' : a.ageMax}, ${a.gender === 'ALL' ? 'all genders' : a.gender.toLowerCase()}`]);
    if (a.locales.length) rows.push(['Languages', a.locales.map((l) => l.name).join(', ')]);
  }
  rows.push(['Placements', a.placement === 'ADVANTAGE' ? 'Advantage+ Placements' : a.platforms.map((p) => PLATFORMS.find((x) => x.key === p)?.label).join(', ')]);
  if (goal?.attribution) rows.push(['Attribution', ATTRIBUTION.find((x) => x.key === a.attribution)?.label || '']);
  if (ctx.needsAd) {
    rows.push(['Ad', `${form.ad.format === 'CAROUSEL' ? 'Carousel' : 'Single image or video'} from catalog, "${CTAS.find((x) => x.key === form.ad.cta)?.label}"`]);
    rows.push(['Catalog media', form.ad.media === 'SLIDESHOW' ? 'Multiple images (slideshow)' : form.ad.media === 'VIDEO' ? 'Product videos' : 'Images']);
    rows.push(['Destination', form.ad.destination === 'APP_WEB' ? 'App, website as backup' : 'Website']);
    if (ctx.adLevelCatalog) rows.push(['Catalog', 'Set on the ad (the campaign has no catalog)']);
    rows.push(['See more URL', form.ad.link]);
    rows.push(['URL parameters', buildUrlTags(form.ad.urlTags || {}) || 'None']);
  }
  if (ctx.needsStandardAd) {
    const ad = form.ad;
    rows.push(['Ad', ad.kind === 'POST'
      ? `Existing ${ad.postSource === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} post`
      : `New ad with uploaded image${ad.imageName ? ` (${ad.imageName})` : ''}, "${CTAS.find((x) => x.key === ad.cta)?.label}"`]);
    if (ad.kind === 'UPLOAD') rows.push(['Website', ad.link]);
    rows.push(['URL parameters', buildUrlTags(ad.urlTags || {}) || 'None']);
  }
  if (!ctx.isDup && !ctx.needsAd && !ctx.needsStandardAd) rows.push(['Ad', 'None, add ads later']);
  if (source) rows.push(['Ads copied', ctx.copyAds ? `${source.ads?.summary?.total_count ?? 0} from “${source.name}”` : 'Not copied']);

  const go = async () => {
    setBusy(true);
    setError('');
    setFailed(null);
    try {
      const result = await apiPost<LaunchResult>('launch', {
        accountId: account.id,
        currency: account.currency,
        mode,
        status,
        form,
        existingCampaign: campaign,
        sourceAdset: source,
      });
      if (result.ok) onDone(result);
      else setFailed(result);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const created = failed?.created;
  const partial = !!(created?.campaign || created?.adset || created?.ads.length);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="review-title" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal">
        <h2 id="review-title">Review &amp; Launch</h2>
        <p className="note">Check the details, then launch to Facebook.</p>
        <dl className="kv">
          {rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
        </dl>

        <div className="field" style={{ marginTop: 18 }}>
          <span className="label">Start as</span>
          <Segmented value={status} onChange={setStatus} options={[{ key: 'PAUSED', label: 'Paused' }, { key: 'ACTIVE', label: 'Active' }]} />
          <div className="hint">{status === 'PAUSED' ? 'Everything is created paused so you can check it in Ads Manager first.' : 'Ads start delivering as soon as Meta approves them.'}</div>
        </div>

        {failed?.error ? (
          <div className="notice bad" style={{ marginTop: 16 }}>
            <b>Facebook rejected the {failed.step}:</b> {failed.error.title ? `${failed.error.title}. ` : ''}{failed.error.userMessage || failed.error.message}
            {failed.error.fbtraceId ? <div style={{ marginTop: 4, opacity: .8 }}>Trace ID: {failed.error.fbtraceId}</div> : null}
            {partial ? (
              <div style={{ marginTop: 6 }}>
                Already created (paused): {[created?.campaign && `campaign ${created.campaign.id}`, created?.adset && `ad set ${created.adset.id}`, created?.ads.length ? `${created.ads.length} ads` : ''].filter(Boolean).join(', ')}.
                {' '}Fix the issue and finish or delete these in Ads Manager — launching again creates new copies.
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? <div className="notice bad" style={{ marginTop: 16 }}>{error}</div> : null}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Back to edit</button>
          <button type="button" className="btn-primary" onClick={go} disabled={busy}>
            {busy ? <><span className="spinner" style={{ borderTopColor: '#fff' }} /> Launching…</> : status === 'ACTIVE' ? 'Launch' : 'Launch paused'}
          </button>
        </div>
      </div>
    </div>
  );
}
