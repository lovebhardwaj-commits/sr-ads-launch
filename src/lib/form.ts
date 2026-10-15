import { attributionFromSpec, fromMinorUnits, goalFromOptimization, normalizeObjective } from './constants';
import type { AdsetLite, CampaignLite, FlowContext, FormState, GeoItem, Mode } from './types';

export const INDIA: GeoItem = { key: 'IN', name: 'India', type: 'country', country_code: 'IN' };

export function defaultForm(catalog = false): FormState {
  return {
    campaign: {
      name: '',
      objective: 'OUTCOME_SALES',
      setup: 'MANUAL',
      bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
      bidAmount: '',
      roasFloor: '',
      catalogEnabled: catalog,
      catalogId: '',
    },
    budget: { type: 'DAILY', amount: '', endDate: '' },
    adset: {
      name: '',
      goal: 'CONVERSIONS',
      event: 'PURCHASE',
      pixelId: '',
      audienceType: 'ADVANTAGE',
      interests: [],
      savedAudienceId: '',
      locations: [INDIA],
      ageMin: 18,
      ageMax: 65,
      gender: 'ALL',
      locales: [],
      placement: 'ADVANTAGE',
      platforms: ['facebook', 'instagram'],
      attribution: '7C1V',
      productSetId: '',
      catalogAudience: 'RETARGET',
      retargetPreset: 'VIEWED_OR_ATC',
      retargetEvents: ['ViewContent', 'AddToCart'],
      retargetDays: 14,
      excludePurchasers: true,
      excludeDays: 14,
      crossSellSourceSetId: '',
    },
    ad: {
      name: '',
      pageId: '',
      instagramUserId: '',
      format: 'CAROUSEL',
      message: 'Still thinking about it? {{product.name}} is waiting for you.',
      headline: '{{product.name}}',
      description: '{{product.current_price}}',
      cta: 'SHOP_NOW',
      link: '',
      endCard: true,
      urlTags: { source: 'facebook', medium: 'paid_social', campaign: '{{campaign.name}}', content: '{{ad.name}}', term: '' },
    },
  };
}

export function buildContext(mode: Mode, form: FormState, campaign?: CampaignLite, source?: AdsetLite): FlowContext {
  const needsCampaign = mode === 'NEW' || mode === 'DUP_NEW';
  const objective = needsCampaign ? form.campaign.objective : normalizeObjective(campaign?.objective);
  const existingCatalog = campaign?.promoted_object?.product_catalog_id || '';
  const isCatalog = needsCampaign
    ? form.campaign.catalogEnabled && objective === 'OUTCOME_SALES'
    : !!existingCatalog;
  const catalogId = needsCampaign ? form.campaign.catalogId : existingCatalog;
  const campaignHasBudget = !!(campaign?.daily_budget || campaign?.lifetime_budget);
  const adsetBudget = !needsCampaign && !campaignHasBudget;
  const isDup = mode === 'DUP_NEW' || mode === 'DUP_EXISTING';
  const sourceIsCatalog = !!source?.promoted_object?.product_set_id;
  return {
    mode,
    needsCampaign,
    objective,
    isCatalog,
    catalogId,
    adsetBudget,
    showBudget: needsCampaign || adsetBudget,
    needsAd: isCatalog && !isDup,
    catalogLocked: !needsCampaign || (isDup && sourceIsCatalog),
  };
}

/** Pre-fill the form from an ad set being duplicated. */
export function formFromAdset(src: AdsetLite, currency: string, catalogId?: string): FormState {
  const f = defaultForm(!!src.promoted_object?.product_set_id);
  const campaign = src.campaign;
  const isCatalog = !!src.promoted_object?.product_set_id;
  const objective = normalizeObjective(campaign?.objective);
  const t = src.targeting || {};

  f.campaign.objective = objective;
  f.campaign.catalogEnabled = isCatalog;
  f.campaign.catalogId = catalogId || campaign?.promoted_object?.product_catalog_id || '';
  if (src.bid_strategy) f.campaign.bidStrategy = src.bid_strategy;
  if (src.bid_amount) f.campaign.bidAmount = fromMinorUnits(src.bid_amount, currency);

  if (src.daily_budget) { f.budget.type = 'DAILY'; f.budget.amount = fromMinorUnits(src.daily_budget, currency); }
  else if (src.lifetime_budget) { f.budget.type = 'LIFETIME'; f.budget.amount = fromMinorUnits(src.lifetime_budget, currency); }

  const a = f.adset;
  a.name = `${src.name} - Copy`;
  a.goal = goalFromOptimization(objective, isCatalog, src.optimization_goal);
  if (src.promoted_object?.custom_event_type) a.event = src.promoted_object.custom_event_type;
  if (src.promoted_object?.pixel_id) a.pixelId = src.promoted_object.pixel_id;
  if (src.promoted_object?.product_set_id) a.productSetId = src.promoted_object.product_set_id;

  const geo = t.geo_locations || {};
  const locs: GeoItem[] = [];
  (geo.countries || []).forEach((c: string) => locs.push({ key: c, name: c, type: 'country', country_code: c }));
  (geo.regions || []).forEach((r: { key: string; name?: string }) => locs.push({ key: String(r.key), name: r.name || String(r.key), type: 'region' }));
  (geo.cities || []).forEach((c: { key: string; name?: string }) => locs.push({ key: String(c.key), name: c.name || String(c.key), type: 'city' }));
  a.locations = locs.length ? locs : [];

  if (t.age_min) a.ageMin = t.age_min;
  if (t.age_max) a.ageMax = t.age_max;
  if (Array.isArray(t.genders) && t.genders.length === 1) a.gender = t.genders[0] === 1 ? 'MALE' : 'FEMALE';
  if (Array.isArray(t.locales)) a.locales = t.locales.map((k: number) => ({ key: k, name: `Language ${k}` }));

  if (Array.isArray(t.flexible_spec) && t.flexible_spec.some((s: { interests?: unknown[] }) => s.interests?.length)) {
    a.audienceType = 'INTEREST';
    a.interests = t.flexible_spec.flatMap((s: { interests?: { id: string; name: string }[] }) => s.interests || []);
  } else if (t.targeting_automation?.advantage_audience === 1) {
    a.audienceType = 'ADVANTAGE';
  } else {
    // Custom audiences, lookalikes or plain demographics: keep the original audience as-is.
    a.audienceType = 'SOURCE';
  }

  if (Array.isArray(t.publisher_platforms) && t.publisher_platforms.length) {
    a.placement = 'MANUAL';
    a.platforms = t.publisher_platforms;
  }
  a.attribution = attributionFromSpec(src.attribution_spec);

  if (isCatalog) {
    const spec = Array.isArray(t.product_audience_specs) ? t.product_audience_specs[0] : undefined;
    if (spec) {
      const events: string[] = (spec.inclusions || []).map((i: { rule?: { event?: { eq?: string } } }) => i.rule?.event?.eq).filter(Boolean);
      const days = Math.round(((spec.inclusions?.[0]?.retention_seconds as number) || 14 * 86400) / 86400);
      a.retargetEvents = events.length ? events : a.retargetEvents;
      a.retargetDays = days;
      a.excludePurchasers = !!spec.exclusions?.length;
      if (spec.exclusions?.[0]?.retention_seconds) a.excludeDays = Math.round(spec.exclusions[0].retention_seconds / 86400);
      a.catalogAudience = 'RETARGET';
      const sorted = [...events].sort().join(',');
      if (spec.product_set_id && spec.product_set_id !== a.productSetId) {
        a.retargetPreset = events.includes('Purchase') ? 'CROSS_SELL' : 'UPSELL';
        a.crossSellSourceSetId = spec.product_set_id;
      } else if (a.excludePurchasers && a.excludeDays === days && sorted === 'AddToCart,ViewContent') {
        a.retargetPreset = 'VIEWED_OR_ATC';
      } else if (a.excludePurchasers && a.excludeDays === days && sorted === 'AddToCart') {
        a.retargetPreset = 'ATC';
      } else {
        a.retargetPreset = 'CUSTOM';
      }
    } else {
      a.catalogAudience = 'BROAD';
    }
  }
  return f;
}

export interface Missing { key: string; label: string }

/** Everything required before Review & Launch is enabled. */
export function validate(form: FormState, ctx: FlowContext, opts: { goalNeedsPixel: boolean; bidNeeds?: 'bid' | 'roas'; catalogReady: boolean }): Missing[] {
  const m: Missing[] = [];
  const c = form.campaign;
  const a = form.adset;
  if (ctx.needsCampaign) {
    if (!c.name.trim()) m.push({ key: 'campaign.name', label: 'Campaign name' });
    if (ctx.isCatalog && !c.catalogId) m.push({ key: 'campaign.catalogId', label: 'Catalog' });
    if (opts.bidNeeds === 'bid' && !(parseFloat(c.bidAmount) > 0)) m.push({ key: 'campaign.bidAmount', label: 'Bid amount' });
    if (opts.bidNeeds === 'roas' && !(parseFloat(c.roasFloor) > 0)) m.push({ key: 'campaign.roasFloor', label: 'ROAS goal' });
  }
  if (ctx.showBudget) {
    if (!(parseFloat(form.budget.amount) > 0)) m.push({ key: 'budget.amount', label: 'Budget amount' });
    if (form.budget.type === 'LIFETIME') {
      const end = form.budget.endDate ? new Date(form.budget.endDate).getTime() : 0;
      if (!end || end < Date.now() + 3600_000) m.push({ key: 'budget.endDate', label: 'End date (at least 1 hour ahead)' });
    }
  }
  if (!a.name.trim()) m.push({ key: 'adset.name', label: 'Ad set name' });
  if (ctx.isCatalog) {
    if (!a.productSetId) m.push({ key: 'adset.productSetId', label: 'Product set' });
    if (a.catalogAudience === 'RETARGET' && a.retargetPreset === 'CUSTOM' && !a.retargetEvents.length) m.push({ key: 'adset.retargetEvents', label: 'At least one event to include' });
    if (a.catalogAudience === 'RETARGET' && (a.retargetPreset === 'UPSELL' || a.retargetPreset === 'CROSS_SELL') && !a.crossSellSourceSetId) m.push({ key: 'adset.crossSellSourceSetId', label: 'Product set people interacted with' });
    if (!opts.catalogReady) m.push({ key: 'catalog.ready', label: 'Catalog readiness checks' });
  } else if (opts.goalNeedsPixel) {
    if (!a.pixelId) m.push({ key: 'adset.pixelId', label: 'Pixel / dataset' });
  }
  const usesAudience = !ctx.isCatalog || a.catalogAudience === 'BROAD';
  if (usesAudience && a.audienceType === 'SAVED' && !a.savedAudienceId) m.push({ key: 'adset.savedAudienceId', label: 'Saved audience' });
  if (usesAudience && a.audienceType === 'INTEREST' && !a.interests.length) m.push({ key: 'adset.interests', label: 'At least one interest' });
  if (!(usesAudience && a.audienceType === 'SAVED') && !a.locations.length) m.push({ key: 'adset.locations', label: 'Location' });
  if (a.ageMin > a.ageMax) m.push({ key: 'adset.age', label: 'Min age below max age' });
  if (a.placement === 'MANUAL' && !a.platforms.length) m.push({ key: 'adset.platforms', label: 'At least one placement' });
  if (ctx.needsAd) {
    const ad = form.ad;
    if (!ad.pageId) m.push({ key: 'ad.pageId', label: 'Facebook Page' });
    if (!ad.message.trim()) m.push({ key: 'ad.message', label: 'Primary text' });
    if (!ad.headline.trim()) m.push({ key: 'ad.headline', label: 'Headline' });
    if (!/^https?:\/\/\S+\.\S+/.test(ad.link.trim())) m.push({ key: 'ad.link', label: 'See more URL' });
  }
  return m;
}
