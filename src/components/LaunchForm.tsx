'use client';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/client-api';
import {
  AGES, ATTRIBUTION, BID_STRATEGIES, CATALOG_EVENTS, CONVERSION_EVENTS, OBJECTIVES, PLATFORMS, RETARGET_PRESETS,
  currencySymbol, goalsFor, objectiveLabel,
} from '@/lib/constants';
import { buildContext, validate } from '@/lib/form';
import { useAsync } from '@/lib/hooks';
import type { AdAccount, AdsetLite, CampaignLite, FormState, GeoItem, InterestItem, LaunchResult, LocaleItem, Mode } from '@/lib/types';
import AdSection from './AdSection';
import BudgetField from './BudgetField';
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
  const b = form.budget;
  const sym = currencySymbol(account.currency);
  const [catalogReady, setCatalogReady] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const up = <K extends keyof FormState>(k: K, patch: Partial<FormState[K]>) =>
    setForm((f) => ({ ...f, [k]: { ...f[k], ...patch } }));

  // Account-level lists
  const pixels = useAsync<{ id: string; name: string }[]>(`pixels-${account.id}`, () => apiGet('pixels', { account: account.id }));
  const retarget = ctx.isCatalog && a.catalogAudience !== 'BROAD';
  const saved = useAsync<{ id: string; name: string }[]>(
    !retarget && (a.audienceType === 'SAVED' || a.audienceType === 'INTEREST') ? `saved-${account.id}` : null,
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

  const bids = BID_STRATEGIES.filter((x) => !x.valueOnly || goal.key === 'VALUE');
  const bid = bids.find((x) => x.key === c.bidStrategy) || bids[0];
  useEffect(() => {
    if (!bids.some((x) => x.key === c.bidStrategy)) up('campaign', { bidStrategy: bids[0].key });
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

  // Budget can live at either level; an amount at one level disables the other.
  const campaignBudgetReason = b.level === 'ADSET' && b.amount ? 'Using an ad set budget. Clear it to use a campaign budget instead.' : undefined;
  const adsetBudgetReason = !ctx.needsCampaign
    ? (ctx.campaignHasBudget ? 'This campaign has a campaign budget (Advantage+ campaign budget), so its ad sets share it.' : undefined)
    : advantagePlus
      ? 'Advantage+ Shopping uses the campaign budget.'
      : b.level === 'CAMPAIGN' && b.amount ? 'Using a campaign budget. Clear it to set an ad set budget instead.' : undefined;
  const setBudget = (patch: Partial<FormState['budget']>) => up('budget', patch);

  const upsellOrCross = retarget && (a.retargetPreset === 'UPSELL' || a.retargetPreset === 'CROSS_SELL');
  const setOptions = (productSets.data || []).map((s) => ({ key: s.id, label: `${s.name}${s.product_count != null ? ` (${s.product_count.toLocaleString('en-IN')} products)` : ''}` }));

  const locationField = (
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
  );
  const languageField = (
    <TagSearch<LocaleItem>
      type="adlocale"
      placeholder="Search languages... (leave empty for all)"
      selected={a.locales}
      onAdd={(l) => up('adset', { locales: [...a.locales, l] })}
      onRemove={(l) => up('adset', { locales: a.locales.filter((x) => x.key !== l.key) })}
      getKey={(l) => String(l.key)}
      getLabel={(l) => l.name}
      toItem={(r) => ({ key: Number(r.key), name: r.name })}
    />
  );
  const genderField = <Segmented value={a.gender} onChange={(v) => up('adset', { gender: v })} options={[{ key: 'ALL', label: 'All genders' }, { key: 'MALE', label: 'Men' }, { key: 'FEMALE', label: 'Women' }]} />;
  const interestField = (
    <TagSearch<InterestItem>
      type="adinterest"
      placeholder="Add demographics, interests or behaviors"
      selected={a.interests}
      onAdd={(i) => up('adset', { interests: [...a.interests, i] })}
      onRemove={(i) => up('adset', { interests: a.interests.filter((x) => x.id !== i.id) })}
      getKey={(i) => i.id}
      getLabel={(i) => i.name}
      toItem={(r) => ({ id: String(r.id), name: r.name })}
      describe={(r) => (r.audience_size_upper_bound ? `${Number(r.audience_size_upper_bound).toLocaleString('en-IN')} people` : '')}
    />
  );

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
            {c.objective === 'OUTCOME_SALES' ? (
              <Field hint={mode !== 'NEW' ? 'Set by the ad set being duplicated.' : c.catalogEnabled ? 'Ads pick products from your catalog for each shopper.' : 'Turn on to show products from your catalog instead of uploaded creatives.'}>
                <Toggle
                  checked={c.catalogEnabled}
                  onChange={(v) => { if (mode === 'NEW') up('campaign', { catalogEnabled: v }); }}
                  label={<span className="strong">Catalog</span>}
                />
              </Field>
            ) : null}
            <Field label="Campaign setup" hint={advantagePlus ? 'Advantage+ uses a campaign budget, Advantage+ Audience and Advantage+ Placements; those choices are locked below.' : undefined}>
              <Segmented value={c.setup} onChange={(v) => up('campaign', { setup: v })} options={[{ key: 'MANUAL', label: 'Manual' }, { key: 'ADVANTAGE_PLUS', label: 'Advantage+ Shopping' }]} />
            </Field>
            <Field label="Bid strategy" hint={b.level === 'ADSET' && b.amount ? 'Applied to the ad set, since the budget is at ad set level.' : undefined}>
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
            <BudgetField
              level="CAMPAIGN"
              label="Campaign budget (Advantage+ campaign budget)"
              hint="Meta spreads one budget across the ad sets. Leave empty to set the budget on the ad set instead."
              budget={b}
              onChange={setBudget}
              symbol={sym}
              disabledReason={campaignBudgetReason}
            />
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
            productSets={productSets.data || []}
            productSetsLoading={productSets.loading}
            productSetsError={productSets.error}
            productSetId={a.productSetId}
            onProductSet={(id) => up('adset', { productSetId: id })}
            pixelId={a.pixelId}
            onReady={setCatalogReady}
          />
        </>
      ) : null}

      {/* ── Ad set (Ads Manager sections: Conversion, Budget & schedule, Audience, Placements) ── */}
      <h2 className="section-title">Ad Set</h2>
      <div className="card">
        <Field label="Ad set name">
          <TextInput value={a.name} onChange={(e) => up('adset', { name: e.target.value })} placeholder={ctx.isCatalog ? 'e.g. Catalog - Viewed or added to cart 14d' : 'e.g. Advantage+ Audience - Broad'} />
        </Field>

        {/* Conversion */}
        <div className="subhead">Conversion</div>
        {goal.destination === 'WEBSITE' || ctx.isCatalog ? (
          <Field label="Conversion location" hint="Other conversion locations (app, messaging, calls) aren't supported in this launcher.">
            <Segmented value="WEBSITE" onChange={() => undefined} options={[{ key: 'WEBSITE', label: 'Website' }]} />
          </Field>
        ) : null}
        <Field label="Performance goal">
          <Select value={goal.key} onChange={(v) => up('adset', { goal: v })} options={goals} />
        </Field>
        {goal.pixel || ctx.isCatalog ? (
          <Field label="Dataset" hint={ctx.isCatalog ? 'Must be linked to the catalog; the Catalog card checks this.' : undefined}>
            {pixels.loading ? <Loading text="Loading datasets…" /> : pixels.error ? <div className="notice bad">{pixels.error}</div> : (
              <Select value={a.pixelId} onChange={(v) => up('adset', { pixelId: v })} placeholder="Select a dataset..." options={(pixels.data || []).map((p) => ({ key: p.id, label: `${p.name} (${p.id})` }))} />
            )}
          </Field>
        ) : null}
        {goal.pixel ? (
          <Field label="Conversion event">
            <Select value={goal.fixedEvent || a.event} disabled={!!goal.fixedEvent} onChange={(v) => up('adset', { event: v })} options={CONVERSION_EVENTS} />
          </Field>
        ) : null}
        {goal.attribution ? (
          <Field label="Attribution setting" hint="Some ad accounts lock this at the account level — if so, Facebook's own rejection message shows up at launch time.">
            <Select value={a.attribution} onChange={(v) => up('adset', { attribution: v })} options={ATTRIBUTION} />
          </Field>
        ) : null}

        {/* Budget & schedule */}
        <div className="subhead">Budget &amp; schedule</div>
        <BudgetField
          level="ADSET"
          label="Budget"
          hint={ctx.needsCampaign ? 'Leave empty to use a campaign budget instead.' : undefined}
          budget={b}
          onChange={setBudget}
          symbol={sym}
          disabledReason={adsetBudgetReason}
        />
        <div className="row field">
          <Field label="Start date" hint="Leave empty to start as soon as it's published.">
            <TextInput type="datetime-local" value={a.startTime} onChange={(e) => up('adset', { startTime: e.target.value })} />
          </Field>
          <Field label={b.type === 'LIFETIME' ? 'End date' : 'End date (optional)'} hint={b.type === 'LIFETIME' ? 'Required with a lifetime budget.' : 'Leave empty to run continuously.'}>
            <TextInput type="datetime-local" value={b.endDate} onChange={(e) => setBudget({ endDate: e.target.value })} />
          </Field>
        </div>

        {/* Audience */}
        <div className="subhead">Audience</div>
        {ctx.isCatalog ? (
          <div className="subcard">
            <div className="label strong" style={{ marginBottom: 10 }}>Catalog · {setOptions.find((s) => s.key === a.productSetId)?.label || 'pick a product set in the Catalog card'}</div>
            <Segmented
              value={a.catalogAudience}
              onChange={(v) => up('adset', { catalogAudience: v })}
              options={[
                { key: 'RETARGET', label: 'Retarget ads to people who interacted with your products' },
                { key: 'BROAD', label: 'Broad audience' },
              ]}
            />
            {retarget ? (
              <>
                <Field label="Retargeting option">
                  <Select value={a.retargetPreset} onChange={(v) => up('adset', { retargetPreset: v })} options={RETARGET_PRESETS} />
                </Field>
                {upsellOrCross ? (
                  <Field
                    label="Product set people interacted with"
                    hint={a.retargetPreset === 'UPSELL'
                      ? 'People who viewed or added these products to cart are shown products from the chosen product set.'
                      : 'People who purchased these products are shown products from the chosen product set.'}
                  >
                    <Select value={a.crossSellSourceSetId} onChange={(v) => up('adset', { crossSellSourceSetId: v })} options={setOptions} placeholder="Select a product set…" />
                  </Field>
                ) : null}
                {a.retargetPreset === 'CUSTOM' ? (
                  <>
                    <Field label="Include people who">
                      <CheckPills value={a.retargetEvents} onChange={(v) => up('adset', { retargetEvents: v })} options={CATALOG_EVENTS} />
                    </Field>
                    <Field>
                      <Toggle checked={a.excludePurchasers} onChange={(v) => up('adset', { excludePurchasers: v })} label="Exclude people who purchased" />
                    </Field>
                  </>
                ) : null}
                <div className="row field">
                  <Field label="In the past">
                    <Select value={String(a.retargetDays)} onChange={(v) => up('adset', { retargetDays: Number(v) })} options={RETARGET_DAYS} />
                  </Field>
                  {a.retargetPreset === 'CUSTOM' && a.excludePurchasers ? (
                    <Field label="Exclude people who purchased in the past">
                      <Select value={String(a.excludeDays)} onChange={(v) => up('adset', { excludeDays: Number(v) })} options={RETARGET_DAYS} />
                    </Field>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {!retarget ? (
          <Field>
            <Segmented
              value={a.audienceType === 'ADVANTAGE' ? 'ADVANTAGE' : a.audienceType === 'SOURCE' ? 'SOURCE' : 'ORIGINAL'}
              onChange={(v) => up('adset', v === 'ADVANTAGE' ? { audienceType: 'ADVANTAGE', ageMin: Math.min(a.ageMin, 25) } : v === 'SOURCE' ? { audienceType: 'SOURCE' } : { audienceType: a.savedAudienceId ? 'SAVED' : 'INTEREST' })}
              options={[
                { key: 'ADVANTAGE', label: 'Advantage+ audience' },
                { key: 'ORIGINAL', label: 'Original audience options', disabled: advantagePlus, title: advantagePlus ? 'Not available with Advantage+ Shopping' : undefined },
                ...(source && a.audienceType === 'SOURCE' ? [{ key: 'SOURCE', label: 'Same as original ad set' }] : []),
              ]}
            />
          </Field>
        ) : null}

        {!retarget && a.audienceType === 'SOURCE' ? (
          <p className="hint">Keeps the original ad set&apos;s custom audiences, lookalikes and exclusions. Location, age, gender and language below still apply.</p>
        ) : null}

        {!retarget && (a.audienceType === 'INTEREST' || a.audienceType === 'SAVED') ? (
          <Field label="Use saved audience">
            {saved.loading ? <Loading text="Loading saved audiences…" /> : saved.error ? <div className="notice bad">{saved.error}</div> : (
              <Select
                value={a.savedAudienceId}
                onChange={(v) => up('adset', { savedAudienceId: v, audienceType: v ? 'SAVED' : 'INTEREST' })}
                options={[{ key: '', label: 'None' }, ...(saved.data || []).map((s) => ({ key: s.id, label: s.name }))]}
              />
            )}
          </Field>
        ) : null}
        {!retarget && a.audienceType === 'SAVED' ? <p className="hint">The saved audience&apos;s own location, age, gender and detailed targeting are used.</p> : null}

        {!retarget && a.audienceType === 'ADVANTAGE' ? (
          <>
            <div className="label strong" style={{ marginTop: 14 }}>Audience controls</div>
            <Field label="Locations">{locationField}</Field>
            <Field label="Minimum age" hint="Meta won't show ads to anyone younger. Advantage+ audience allows up to 25.">
              <Select value={String(Math.min(a.ageMin, 25))} onChange={(v) => up('adset', { ageMin: Number(v) })} options={AGES.filter((n) => n <= 25).map((n) => ({ key: String(n), label: String(n) }))} />
            </Field>
            <Field label="Languages">{languageField}</Field>
            <div className="label strong" style={{ marginTop: 18 }}>Audience suggestion (optional)</div>
            <p className="hint" style={{ marginTop: 0 }}>Meta starts with these, then looks beyond them when it finds people likely to convert.</p>
            <div className="row field">
              <Field label="Age">
                <Select value={String(Math.max(a.ageMin, 18))} disabled onChange={() => undefined} options={[{ key: String(Math.max(a.ageMin, 18)), label: String(Math.max(a.ageMin, 18)) }]} />
              </Field>
              <Field label="to">
                <Select value={String(a.ageMax)} onChange={(v) => up('adset', { ageMax: Number(v) })} options={AGES.filter((n) => n >= a.ageMin).map((n) => ({ key: String(n), label: n === 65 ? '65+' : String(n) }))} />
              </Field>
            </div>
            <Field label="Gender">{genderField}</Field>
            <Field label="Detailed targeting">{interestField}</Field>
          </>
        ) : null}

        {retarget || a.audienceType === 'INTEREST' || a.audienceType === 'SOURCE' ? (
          <>
            <Field label="Locations">{locationField}</Field>
            <div className="row field">
              <Field label="Age">
                <Select value={String(a.ageMin)} onChange={(v) => up('adset', { ageMin: Number(v) })} options={AGES.filter((n) => n < 65).map((n) => ({ key: String(n), label: String(n) }))} />
              </Field>
              <Field label="to">
                <Select value={String(a.ageMax)} onChange={(v) => up('adset', { ageMax: Number(v) })} options={AGES.map((n) => ({ key: String(n), label: n === 65 ? '65+' : String(n) }))} />
              </Field>
            </div>
            <Field label="Gender">{genderField}</Field>
            {!retarget && a.audienceType === 'INTEREST' ? <Field label="Detailed targeting" hint="Include people who match any of these. Leave empty for broad.">{interestField}</Field> : null}
            <Field label="Languages">{languageField}</Field>
          </>
        ) : null}

        {/* Placements */}
        <div className="subhead">Placements</div>
        <Field>
          <Segmented
            value={a.placement}
            onChange={(v) => up('adset', { placement: v })}
            options={[
              { key: 'ADVANTAGE', label: 'Advantage+ placements (recommended)' },
              { key: 'MANUAL', label: 'Manual placements', disabled: advantagePlus, title: advantagePlus ? 'Not available with Advantage+ Shopping' : undefined },
            ]}
          />
        </Field>
        {a.placement === 'MANUAL' ? (
          <div className="field" style={{ marginTop: 10 }}>
            <CheckPills value={a.platforms} onChange={(v) => up('adset', { platforms: v })} options={PLATFORMS} />
          </div>
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
