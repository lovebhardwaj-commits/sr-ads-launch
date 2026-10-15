'use client';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/client-api';
import {
  AGES, ATTRIBUTION, BID_STRATEGIES, CATALOG_EVENTS, CONVERSION_EVENTS, OBJECTIVES, PLATFORMS,
  currencySymbol, goalsFor, objectiveLabel,
} from '@/lib/constants';
import { buildContext, validate } from '@/lib/form';
import { useAsync } from '@/lib/hooks';
import type { AdAccount, AdsetLite, CampaignLite, FormState, GeoItem, InterestItem, LaunchResult, LocaleItem, Mode } from '@/lib/types';
import AdSection from './AdSection';
import CatalogPanel from './CatalogPanel';
import ReviewModal from './ReviewModal';
import { CheckPills, Field, Loading, Segmented, Select, TagSearch, TextInput, Toggle } from './ui';

export interface ProductSet { id: string; name: string; product_count?: number }

const RETARGET_DAYS = [3, 7, 14, 30, 60, 90, 180].map((d) => ({ key: String(d), label: `${d} days` }));

export default function LaunchForm({ mode, account, form, setForm, campaign, source, onStartOver, onDone }: {
  mode: Mode;
  account: AdAccount;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  campaign?: CampaignLite;
  source?: AdsetLite;
  onStartOver: () => void;
  onDone: (r: LaunchResult) => void;
}) {
  const ctx = buildContext(mode, form, campaign, source);
  const c = form.campaign;
  const a = form.adset;
  const sym = currencySymbol(account.currency);
  const [catalogReady, setCatalogReady] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const up = <K extends keyof FormState>(k: K, patch: Partial<FormState[K]>) =>
    setForm((f) => ({ ...f, [k]: { ...f[k], ...patch } }));

  // Account-level lists
  const pixels = useAsync<{ id: string; name: string }[]>(`pixels-${account.id}`, () => apiGet('pixels', { account: account.id }));
  const usesAudience = !ctx.isCatalog || a.catalogAudience === 'BROAD';
  const saved = useAsync<{ id: string; name: string }[]>(
    usesAudience && a.audienceType === 'SAVED' ? `saved-${account.id}` : null,
    () => apiGet('saved-audiences', { account: account.id }),
  );
  const productSets = useAsync<ProductSet[]>(ctx.isCatalog && ctx.catalogId ? `sets-${ctx.catalogId}` : null, () => apiGet('product-sets', { catalog: ctx.catalogId }));

  // Goals follow the objective (and catalog). Keep the selection valid.
  const goals = goalsFor(ctx.objective, ctx.isCatalog);
  const goal = goals.find((g) => g.key === a.goal) || goals[0];
  useEffect(() => {
    if (!goals.some((g) => g.key === a.goal)) up('adset', { goal: goals[0].key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.objective, ctx.isCatalog]);

  const bids = BID_STRATEGIES.filter((b) => !b.valueOnly || goal.key === 'VALUE');
  const bid = bids.find((b) => b.key === c.bidStrategy) || bids[0];
  useEffect(() => {
    if (!bids.some((b) => b.key === c.bidStrategy)) up('campaign', { bidStrategy: bids[0].key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal.key]);

  // Default product set: "All products" if present, else the biggest.
  useEffect(() => {
    const sets = productSets.data;
    if (!sets?.length || sets.some((s) => s.id === a.productSetId)) return;
    const all = sets.find((s) => /all products/i.test(s.name)) || [...sets].sort((x, y) => (y.product_count || 0) - (x.product_count || 0))[0];
    up('adset', { productSetId: all.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSets.data]);

  const advantagePlus = ctx.needsCampaign && c.setup === 'ADVANTAGE_PLUS';
  useEffect(() => {
    if (advantagePlus) up('adset', { audienceType: 'ADVANTAGE', placement: 'ADVANTAGE' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advantagePlus]);

  const missing = useMemo(
    () => validate(form, ctx, { goalNeedsPixel: !!goal.pixel, bidNeeds: ctx.needsCampaign ? bid.needs : undefined, catalogReady }),
    [form, ctx, goal.pixel, bid.needs, catalogReady],
  );

  const retarget = ctx.isCatalog && a.catalogAudience !== 'BROAD';
  const setOptions = (productSets.data || []).map((s) => ({ key: s.id, label: `${s.name}${s.product_count != null ? ` (${s.product_count.toLocaleString('en-IN')} products)` : ''}` }));

  return (
    <>
      <button type="button" className="back" onClick={onStartOver}><ChevronLeft size={13} /> Start over</button>

      {!ctx.needsCampaign && campaign ? (
        <p className="note">
          Attaching to existing campaign: <span className="strong">{campaign.name}</span> ({objectiveLabel(campaign.objective)}{ctx.isCatalog ? ', catalog' : ''})
        </p>
      ) : null}
      {source ? (
        <p className="note">Duplicating <span className="strong">{source.name}</span>. Its {source.ads?.summary?.total_count ?? 0} ads are copied into the new ad set with the same creative.</p>
      ) : null}

      {/* ── Campaign ── */}
      {ctx.needsCampaign ? (
        <>
          <h2 className="section-title">Campaign</h2>
          <div className="card">
            <Field label="Campaign name">
              <TextInput value={c.name} onChange={(e) => up('campaign', { name: e.target.value })} placeholder={c.catalogEnabled ? 'e.g. D2C-Catalog-Retargeting-Oct' : 'e.g. D2C-Sales-Prospecting-Oct'} />
            </Field>
            <Field label="Campaign objective" hint={mode === 'DUP_NEW' ? 'Matches the original ad set so its ads can be copied.' : undefined}>
              <Select
                value={c.objective}
                disabled={mode === 'DUP_NEW'}
                onChange={(v) => up('campaign', { objective: v, catalogEnabled: v === 'OUTCOME_SALES' ? c.catalogEnabled : false })}
                options={OBJECTIVES}
              />
            </Field>
            {c.objective === 'OUTCOME_SALES' && (mode === 'NEW' || c.catalogEnabled) ? (
              <Field hint={c.catalogEnabled ? 'Ads pick products from your catalog for each shopper.' : 'Turn on to show products from your catalog instead of uploaded creatives.'}>
                <Toggle
                  checked={c.catalogEnabled}
                  onChange={(v) => { if (mode === 'NEW') up('campaign', { catalogEnabled: v }); }}
                  label={<span className="strong">Catalog ads</span>}
                />
              </Field>
            ) : null}
            <Field label="Campaign setup" hint={advantagePlus ? 'Advantage+ uses Advantage+ Audience and Advantage+ Placements; those choices are locked below.' : undefined}>
              <Segmented value={c.setup} onChange={(v) => up('campaign', { setup: v })} options={[{ key: 'MANUAL', label: 'Manual' }, { key: 'ADVANTAGE_PLUS', label: 'Advantage+ Shopping' }]} />
            </Field>
            <Field label="Bid strategy">
              <Select value={bid.key} onChange={(v) => up('campaign', { bidStrategy: v })} options={bids} />
            </Field>
            {bid.needs === 'bid' ? (
              <Field label={bid.key === 'COST_CAP' ? 'Cost per result goal' : 'Bid cap'} hint="Applied to the ad set.">
                <div className="prefix-wrap"><span className="prefix">{sym.trim()}</span>
                  <TextInput inputMode="decimal" value={c.bidAmount} onChange={(e) => up('campaign', { bidAmount: e.target.value.replace(/[^\d.]/g, '') })} placeholder="e.g. 450" />
                </div>
              </Field>
            ) : null}
            {bid.needs === 'roas' ? (
              <Field label="ROAS goal" hint="Minimum return per rupee spent, e.g. 2.5 means ₹2.50 back for every ₹1.">
                <TextInput inputMode="decimal" value={c.roasFloor} onChange={(e) => up('campaign', { roasFloor: e.target.value.replace(/[^\d.]/g, '') })} placeholder="e.g. 2.5" />
              </Field>
            ) : null}
          </div>
        </>
      ) : null}

      {/* ── Catalog ── */}
      {ctx.isCatalog ? (
        <>
          <h2 className="section-title">Catalog</h2>
          <CatalogPanel
            account={account}
            catalogId={ctx.catalogId}
            locked={ctx.catalogLocked}
            onCatalog={(id) => { up('campaign', { catalogId: id }); up('adset', { productSetId: '', crossSellSourceSetId: '' }); }}
            pixels={pixels.data || []}
            pixelsLoading={pixels.loading}
            pixelId={a.pixelId}
            onPixel={(id) => up('adset', { pixelId: id })}
            onReady={setCatalogReady}
          />
        </>
      ) : null}

      {/* ── Budget ── */}
      {ctx.showBudget ? (
        <>
          <h2 className="section-title">Budget</h2>
          <div className="card">
            {ctx.adsetBudget ? <p className="note">This campaign has no campaign-level budget, so the ad set needs its own.</p> : null}
            <Segmented value={form.budget.type} onChange={(v) => up('budget', { type: v })} options={[{ key: 'DAILY', label: 'Daily budget' }, { key: 'LIFETIME', label: 'Lifetime budget' }]} />
            <div className="field" style={{ marginTop: 12 }}>
              <TextInput inputMode="decimal" value={form.budget.amount} onChange={(e) => up('budget', { amount: e.target.value.replace(/[^\d.]/g, '') })} placeholder={`Enter an amount (${sym.trim()})`} aria-label="Budget amount" />
            </div>
            {form.budget.type === 'LIFETIME' ? (
              <Field label="End date">
                <TextInput type="datetime-local" value={form.budget.endDate} onChange={(e) => up('budget', { endDate: e.target.value })} />
              </Field>
            ) : null}
          </div>
        </>
      ) : null}

      {/* ── Ad set ── */}
      <h2 className="section-title">Ad Set</h2>
      <div className="card">
        <Field label="Ad set name">
          <TextInput value={a.name} onChange={(e) => up('adset', { name: e.target.value })} placeholder={ctx.isCatalog ? 'e.g. Catalog - Viewed or carted 14d' : 'e.g. Advantage+ Audience - Broad'} />
        </Field>

        {ctx.isCatalog ? (
          <>
            <Field label="Product set" hint="The products these ads can show.">
              {productSets.loading ? <Loading text="Loading product sets…" /> : productSets.error ? <div className="notice bad">{productSets.error}</div> : (
                <Select value={a.productSetId} onChange={(v) => up('adset', { productSetId: v })} options={setOptions} placeholder={ctx.catalogId ? 'Select a product set…' : 'Pick a catalog first'} disabled={!ctx.catalogId} />
              )}
            </Field>
            <Field label="Who should see these products">
              <Segmented
                value={a.catalogAudience}
                onChange={(v) => up('adset', { catalogAudience: v })}
                options={[
                  { key: 'RETARGET', label: 'Win back browsers' },
                  { key: 'BROAD', label: 'Find new buyers' },
                  { key: 'CROSS_SELL', label: 'Sell more to customers' },
                ]}
              />
            </Field>
            {retarget ? (
              <>
                {a.catalogAudience === 'CROSS_SELL' ? (
                  <Field label="Shoppers who engaged with" hint="People who engaged with these products see products from the product set above.">
                    <Select value={a.crossSellSourceSetId} onChange={(v) => up('adset', { crossSellSourceSetId: v })} options={setOptions} placeholder="Select a product set…" />
                  </Field>
                ) : null}
                <Field label={a.catalogAudience === 'CROSS_SELL' ? 'Shopper actions' : 'Show products to people who'}>
                  <CheckPills value={a.retargetEvents} onChange={(v) => up('adset', { retargetEvents: v })} options={a.catalogAudience === 'CROSS_SELL' ? CATALOG_EVENTS : CATALOG_EVENTS.filter((e) => e.key !== 'Purchase')} />
                </Field>
                <div className="row field">
                  <Field label="In the last">
                    <Select value={String(a.retargetDays)} onChange={(v) => up('adset', { retargetDays: Number(v) })} options={RETARGET_DAYS} />
                  </Field>
                  <Field label="Exclude buyers from the last">
                    <Select value={String(a.excludeDays)} onChange={(v) => up('adset', { excludeDays: Number(v) })} options={RETARGET_DAYS} disabled={!a.excludePurchasers} />
                  </Field>
                </div>
                <Field>
                  <Toggle checked={a.excludePurchasers} onChange={(v) => up('adset', { excludePurchasers: v })} label="Don't show products to people who already bought them" />
                </Field>
              </>
            ) : null}
          </>
        ) : null}

        <Field label="Performance goal">
          <Select value={goal.key} onChange={(v) => up('adset', { goal: v })} options={goals} />
        </Field>

        {!ctx.isCatalog && goal.pixel ? (
          <>
            <Field label="Conversion event">
              <Select value={goal.fixedEvent || a.event} disabled={!!goal.fixedEvent} onChange={(v) => up('adset', { event: v })} options={CONVERSION_EVENTS} />
            </Field>
            <Field label="Pixel / dataset">
              {pixels.loading ? <Loading text="Loading pixels…" /> : pixels.error ? <div className="notice bad">{pixels.error}</div> : (
                <Select value={a.pixelId} onChange={(v) => up('adset', { pixelId: v })} placeholder="Select a pixel..." options={(pixels.data || []).map((p) => ({ key: p.id, label: p.name }))} />
              )}
            </Field>
          </>
        ) : null}

        {!retarget ? (
          <Field label="Audience type">
            <Segmented
              value={a.audienceType}
              onChange={(v) => up('adset', { audienceType: v })}
              options={[
                { key: 'ADVANTAGE', label: 'Advantage+ Audience' },
                { key: 'INTEREST', label: 'Interest-based', disabled: advantagePlus, title: advantagePlus ? 'Not available with Advantage+ Shopping' : undefined },
                { key: 'SAVED', label: 'Saved Audience', disabled: advantagePlus, title: advantagePlus ? 'Not available with Advantage+ Shopping' : undefined },
                ...(source && a.audienceType === 'SOURCE' ? [{ key: 'SOURCE' as const, label: 'Same as original' }] : []),
              ]}
            />
          </Field>
        ) : null}

        {!retarget && a.audienceType === 'SOURCE' ? (
          <p className="hint">Keeps the original ad set&apos;s custom audiences, lookalikes and exclusions. Location, age, gender and language below still apply.</p>
        ) : null}

        {!retarget && a.audienceType === 'INTEREST' ? (
          <Field label="Interests">
            <TagSearch<InterestItem>
              type="adinterest"
              placeholder="Search interests, e.g. Ayurveda, skincare…"
              selected={a.interests}
              onAdd={(i) => up('adset', { interests: [...a.interests, i] })}
              onRemove={(i) => up('adset', { interests: a.interests.filter((x) => x.id !== i.id) })}
              getKey={(i) => i.id}
              getLabel={(i) => i.name}
              toItem={(r) => ({ id: String(r.id), name: r.name })}
              describe={(r) => (r.audience_size_upper_bound ? `${Number(r.audience_size_upper_bound).toLocaleString('en-IN')} people` : '')}
            />
          </Field>
        ) : null}

        {!retarget && a.audienceType === 'SAVED' ? (
          <Field label="Saved audience" hint="The saved audience's own location, age and gender are used.">
            {saved.loading ? <Loading text="Loading saved audiences…" /> : saved.error ? <div className="notice bad">{saved.error}</div> : (
              <Select value={a.savedAudienceId} onChange={(v) => up('adset', { savedAudienceId: v })} placeholder="Select a saved audience..." options={(saved.data || []).map((s) => ({ key: s.id, label: s.name }))} />
            )}
          </Field>
        ) : null}

        {retarget || a.audienceType !== 'SAVED' ? (
          <>
            <Field label="Location targeting">
              <TagSearch<GeoItem>
                type="adgeolocation"
                placeholder="Search countries, states, cities..."
                selected={a.locations}
                onAdd={(g) => up('adset', { locations: [...a.locations, g] })}
                onRemove={(g) => up('adset', { locations: a.locations.filter((x) => x.key !== g.key) })}
                getKey={(g) => `${g.type}-${g.key}`}
                getLabel={(g) => g.name}
                toItem={(r) => ({ key: String(r.key), name: r.type === 'country' ? r.name : `${r.name}${r.region ? `, ${r.region}` : ''}`, type: r.type, country_code: r.country_code })}
                describe={(r) => [r.type === 'region' ? 'State' : r.type === 'city' ? 'City' : 'Country', r.country_name].filter(Boolean).join(' · ')}
              />
            </Field>

            {!retarget ? (
              <>
                <div className="row field">
                  <Field label="Min age">
                    <Select value={String(a.ageMin)} onChange={(v) => up('adset', { ageMin: Number(v) })} options={AGES.filter((n) => n < 65).map((n) => ({ key: String(n), label: String(n) }))} />
                  </Field>
                  <Field label="Max age">
                    <Select value={String(a.ageMax)} onChange={(v) => up('adset', { ageMax: Number(v) })} options={AGES.map((n) => ({ key: String(n), label: n === 65 ? '65+' : String(n) }))} />
                  </Field>
                </div>
                {a.audienceType === 'ADVANTAGE' && (a.ageMax < 65 || a.gender !== 'ALL' || a.ageMin > 25) ? (
                  <p className="hint">With Advantage+ Audience, max age and gender are suggestions, not limits, and min age can be at most 25.</p>
                ) : null}
                <Field label="Gender">
                  <Segmented value={a.gender} onChange={(v) => up('adset', { gender: v })} options={[{ key: 'ALL', label: 'All' }, { key: 'MALE', label: 'Male' }, { key: 'FEMALE', label: 'Female' }]} />
                </Field>
              </>
            ) : null}

            <Field label="Language (leave empty for all languages)">
              <TagSearch<LocaleItem>
                type="adlocale"
                placeholder="Search languages..."
                selected={a.locales}
                onAdd={(l) => up('adset', { locales: [...a.locales, l] })}
                onRemove={(l) => up('adset', { locales: a.locales.filter((x) => x.key !== l.key) })}
                getKey={(l) => String(l.key)}
                getLabel={(l) => l.name}
                toItem={(r) => ({ key: Number(r.key), name: r.name })}
              />
            </Field>
          </>
        ) : null}

        <Field label="Placement strategy">
          <Segmented
            value={a.placement}
            onChange={(v) => up('adset', { placement: v })}
            options={[
              { key: 'ADVANTAGE', label: 'Advantage+ Placements' },
              { key: 'MANUAL', label: 'Manual Placements', disabled: advantagePlus, title: advantagePlus ? 'Not available with Advantage+ Shopping' : undefined },
            ]}
          />
        </Field>
        {a.placement === 'MANUAL' ? (
          <div className="field" style={{ marginTop: 10 }}>
            <CheckPills value={a.platforms} onChange={(v) => up('adset', { platforms: v })} options={PLATFORMS} />
          </div>
        ) : null}

        {goal.attribution ? (
          <Field label="Attribution setting" hint="Some ad accounts lock this at the account level — if so, Facebook's own rejection message shows up at launch time.">
            <Select value={a.attribution} onChange={(v) => up('adset', { attribution: v })} options={ATTRIBUTION} />
          </Field>
        ) : null}
      </div>

      {/* ── Ad (catalog template) ── */}
      {ctx.needsAd ? (
        <>
          <h2 className="section-title">Ad</h2>
          <AdSection form={form} setAd={(p) => up('ad', p)} productSetId={a.productSetId} catalogId={ctx.catalogId} />
        </>
      ) : null}

      <div className="launch-bar">
        <button type="button" className="btn-primary" disabled={missing.length > 0} onClick={() => setReviewing(true)}>Review &amp; Launch</button>
        {missing.length ? <span className="missing">Still needed: {missing.map((m) => m.label).join(', ')}</span> : null}
      </div>

      {reviewing ? (
        <ReviewModal
          mode={mode}
          account={account}
          form={form}
          ctx={ctx}
          campaign={campaign}
          source={source}
          productSets={productSets.data || []}
          pixels={pixels.data || []}
          onClose={() => setReviewing(false)}
          onDone={onDone}
        />
      ) : null}
    </>
  );
}
