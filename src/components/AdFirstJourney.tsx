'use client';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { goalsFor } from '@/lib/constants';
import type { AdAccount, FormState, LaunchResult, Mode } from '@/lib/types';
import AdFirstBuilder from './AdFirstBuilder';
import AdOnlyReview from './AdOnlyReview';
import AdSummaryCard from './AdSummaryCard';
import DestinationTree, { type Destination } from './DestinationTree';
import LaunchForm from './LaunchForm';
import AdsetFacts from './AdsetFacts';
import { adsetFit } from './Pickers';
import ProductStrip from './ProductStrip';

/**
 * "Start with an Ad" on one page: build the ad (collapses to a summary), pick where it goes in an
 * Ads Manager-style tree, and fill in only what the destination needs, with a sticky action bar.
 */
export default function AdFirstJourney({ account, form, setForm, onStartOver, onDone }: {
  account: AdAccount;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onStartOver: () => void;
  onDone: (r: LaunchResult, mode: Mode) => void;
}) {
  const [adDone, setAdDone] = useState(false);
  const [dest, setDest] = useState<Destination | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const isCatalog = form.ad.kind === 'CATALOG';
  const fit = { isCatalog, catalogId: form.campaign.catalogId };
  const adLabel = isCatalog ? 'catalog ad' : 'ad';

  // Editing the ad can change its type or catalog; drop a destination it no longer fits.
  useEffect(() => {
    if (dest?.kind === 'ADSET' && adsetFit(dest.adset, fit)) setDest(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCatalog, form.campaign.catalogId]);

  const choose = (d: Destination) => {
    setDest(d);
    if (d.kind === 'NEW_ADSET') {
      const c = d.campaign;
      const level = c.daily_budget || c.lifetime_budget ? 'CAMPAIGN' : 'ADSET';
      const goal = goalsFor(c.objective, !!c.promoted_object?.product_catalog_id)[0].key;
      setForm((f) => ({ ...f, budget: { ...f.budget, level }, adset: { ...f.adset, goal } }));
    }
    if (d.kind === 'NEW_CAMPAIGN') {
      setForm((f) => ({ ...f, campaign: { ...f.campaign, catalogEnabled: isCatalog, objective: isCatalog ? 'OUTCOME_SALES' : f.campaign.objective } }));
    }
    setTimeout(() => document.getElementById('dest-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  if (!adDone) {
    return <AdFirstBuilder account={account} form={form} setForm={setForm} onStartOver={onStartOver} onNext={() => { setAdDone(true); window.scrollTo({ top: 0 }); }} />;
  }

  const target = dest?.kind === 'ADSET' ? dest.adset : undefined;
  const summary = dest?.kind === 'ADSET'
    ? <>Adding 1 {adLabel} to <b>{dest.adset.name}</b> in <b>{dest.adset.campaign?.name}</b></>
    : dest?.kind === 'NEW_ADSET'
      ? <>Creating a new ad set in <b>{dest.campaign.name}</b> with your {adLabel}</>
      : dest?.kind === 'NEW_CAMPAIGN' ? <>Creating a new campaign and ad set with your {adLabel}</> : null;

  return (
    <>
      <button type="button" className="back" onClick={onStartOver}><ChevronLeft size={13} /> Start over</button>
      <h2 className="section-title" style={{ marginTop: 0 }}><span className="step-no">1</span> Your ad</h2>
      <AdSummaryCard form={form} onEdit={() => { setAdDone(false); window.scrollTo({ top: 0 }); }} />

      <h2 className="section-title"><span className="step-no">2</span> Where should it go?</h2>
      <p className="note">Pick an existing ad set, or create a new ad set or campaign. {isCatalog ? 'Catalog ads fit catalog campaigns on the same catalog, and Sales campaigns without a catalog.' : 'Normal ads fit campaigns without a catalog.'}</p>
      <DestinationTree account={account} fit={fit} value={dest} onChange={choose} />

      <div id="dest-details" />
      {dest?.kind === 'ADSET' && target ? (
        <>
          <h2 className="section-title"><span className="step-no">3</span> Review</h2>
          <div className="card">
            <AdsetFacts adset={target} account={account} />
            {isCatalog ? (
              <div style={{ marginTop: 14 }}>
                <ProductStrip
                  setId={target.promoted_object?.product_set_id || form.adset.productSetId}
                  label={target.promoted_object?.product_set_id ? 'Products from the ad set\u2019s product set' : 'Products from the product set chosen for the ad'}
                />
              </div>
            ) : null}
            <p className="hint" style={{ marginBottom: 0 }}>Your ad joins this ad set as is: its budget, audience and schedule don&apos;t change.</p>
          </div>
          <div className="sticky-bar">
            <span className="sticky-text">{summary}</span>
            <button type="button" className="btn-primary" onClick={() => setReviewing(true)}>Review &amp; Launch</button>
          </div>
          {reviewing ? (
            <AdOnlyReview account={account} form={form} target={target} onClose={() => setReviewing(false)} onDone={(r) => { setReviewing(false); onDone(r, 'AD_ONLY'); }} />
          ) : null}
        </>
      ) : dest?.kind === 'NEW_ADSET' ? (
        <>
          <h2 className="section-title"><span className="step-no">3</span> New ad set in {dest.campaign.name}</h2>
          <LaunchForm key={`emb-adset-${dest.campaign.id}`} embedded summary={summary} mode="EXISTING" account={account} form={form} setForm={setForm} campaign={dest.campaign} onStartOver={onStartOver} onDone={(r) => onDone(r, 'EXISTING')} />
        </>
      ) : dest?.kind === 'NEW_CAMPAIGN' ? (
        <>
          <h2 className="section-title"><span className="step-no">3</span> New campaign and ad set</h2>
          <LaunchForm key="emb-campaign" embedded summary={summary} mode="NEW" account={account} form={form} setForm={setForm} onStartOver={onStartOver} onDone={(r) => onDone(r, 'NEW')} />
        </>
      ) : (
        <div className="sticky-bar muted"><span className="sticky-text">Pick where your {adLabel} goes to continue.</span></div>
      )}
    </>
  );
}
