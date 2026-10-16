import 'server-only';
import { ATTRIBUTION, BID_STRATEGIES, buildUrlTags, catalogAudienceSpec, goalDef, toMinorUnits } from './constants';
import { buildContext } from './form';
import { graph, GraphError } from './graph';
import type { FlowContext, FormState, LaunchRequest, LaunchResult } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

const CONTROLLED_KEYS = [
  'geo_locations', 'age_min', 'age_max', 'genders', 'locales',
  'publisher_platforms', 'facebook_positions', 'instagram_positions', 'audience_network_positions', 'messenger_positions', 'device_platforms',
  'product_audience_specs', 'excluded_product_audience_specs',
];
const AUDIENCE_KEYS = ['flexible_spec', 'targeting_automation', 'interests'];

function geo(form: FormState) {
  const g: any = {};
  const countries = form.adset.locations.filter((l) => l.type === 'country').map((l) => l.key);
  const regions = form.adset.locations.filter((l) => l.type === 'region').map((l) => ({ key: l.key }));
  const cities = form.adset.locations.filter((l) => l.type === 'city').map((l) => ({ key: l.key }));
  if (countries.length) g.countries = countries;
  if (regions.length) g.regions = regions;
  if (cities.length) g.cities = cities;
  return g;
}

export function buildTargeting(form: FormState, ctx: FlowContext, base?: any, saved?: any): any {
  const a = form.adset;
  let t: any;

  if (ctx.isCatalog && a.catalogAudience !== 'BROAD') {
    const day = 86400;
    const ca = catalogAudienceSpec(a);
    const spec: any = {
      product_set_id: ca.sourceSetId,
      inclusions: ca.events.map((e) => ({ retention_seconds: a.retargetDays * day, rule: { event: { eq: e } } })),
    };
    if (ca.exclude) {
      spec.exclusions = [{ retention_seconds: ca.excludeDays * day, rule: { event: { eq: 'Purchase' } } }];
    }
    t = { geo_locations: geo(form), age_min: a.ageMin, age_max: a.ageMax, product_audience_specs: [spec], targeting_automation: { advantage_audience: 0 } };
    if (a.gender !== 'ALL') t.genders = [a.gender === 'MALE' ? 1 : 2];
    if (a.locales.length) t.locales = a.locales.map((l) => l.key);
  } else if (a.audienceType === 'SAVED' && saved) {
    t = { ...saved };
    if (!t.targeting_automation) t.targeting_automation = { advantage_audience: 0 };
  } else {
    t = {};
    if (base) {
      for (const [k, v] of Object.entries(base)) {
        if (CONTROLLED_KEYS.includes(k)) continue;
        if (a.audienceType !== 'SOURCE' && AUDIENCE_KEYS.includes(k)) continue;
        t[k] = v;
      }
    }
    t.geo_locations = geo(form);
    t.age_min = a.ageMin;
    if (a.audienceType === 'ADVANTAGE') {
      // Advantage+ audience. Controls: location, minimum age, languages.
      // Audience suggestion (optional): age range, gender, detailed targeting.
      t.targeting_automation = { advantage_audience: 1 };
      if (a.ageMax < 65) t.age_range = [a.ageMin, a.ageMax];
      if (a.gender !== 'ALL') t.genders = [a.gender === 'MALE' ? 1 : 2];
      if (a.interests.length) t.flexible_spec = [{ interests: a.interests.map((i) => ({ id: i.id, name: i.name })) }];
    } else {
      t.age_max = a.ageMax;
      if (a.gender !== 'ALL') t.genders = [a.gender === 'MALE' ? 1 : 2];
      if (a.audienceType === 'INTEREST') {
        if (a.interests.length) t.flexible_spec = [{ interests: a.interests.map((i) => ({ id: i.id, name: i.name })) }];
        t.targeting_automation = { advantage_audience: 0 };
      }
      if (a.audienceType === 'SOURCE' && !t.targeting_automation) t.targeting_automation = { advantage_audience: 0 };
    }
    if (a.locales.length) t.locales = a.locales.map((l) => l.key);
  }

  if (a.placement === 'MANUAL') t.publisher_platforms = a.platforms;
  return t;
}

export function campaignParams(form: FormState, ctx: FlowContext, currency: string) {
  const c = form.campaign;
  const p: any = {
    name: c.name.trim(),
    objective: ctx.objective,
    status: 'PAUSED',
    special_ad_categories: [],
  };
  if (ctx.adsetBudget) {
    // Ad set budgets: Meta requires this flag on campaigns without a campaign budget.
    p.is_adset_budget_sharing_enabled = false;
  } else {
    // Advantage+ campaign budget
    p.bid_strategy = c.bidStrategy;
    const amount = toMinorUnits(form.budget.amount, currency);
    if (form.budget.type === 'DAILY') p.daily_budget = amount; else p.lifetime_budget = amount;
  }
  if (ctx.isCatalog) p.promoted_object = { product_catalog_id: c.catalogId };
  return p;
}

export function adsetParams(form: FormState, ctx: FlowContext, currency: string, campaignId: string, targeting: any) {
  const a = form.adset;
  const goal = goalDef(ctx.objective, ctx.isCatalog, a.goal);
  if (!goal) throw new GraphError({ message: `Performance goal "${a.goal}" isn't available for this campaign objective.` });
  const p: any = {
    name: a.name.trim(),
    campaign_id: campaignId,
    status: 'PAUSED',
    billing_event: 'IMPRESSIONS',
    optimization_goal: goal.optimization,
    targeting,
    start_time: a.startTime ? new Date(a.startTime).toISOString() : new Date(Date.now() + 60_000).toISOString(),
  };

  if (ctx.isCatalog) {
    p.promoted_object = { product_set_id: a.productSetId };
    if (goal.optimization !== 'LINK_CLICKS') p.promoted_object.custom_event_type = goal.fixedEvent || a.event || 'PURCHASE';
  } else if (goal.pixel) {
    p.promoted_object = { pixel_id: a.pixelId, custom_event_type: goal.fixedEvent || a.event };
  }
  if (!ctx.isCatalog && goal.destination) p.destination_type = goal.destination;
  if (goal.attribution) p.attribution_spec = (ATTRIBUTION.find((x) => x.key === a.attribution) || ATTRIBUTION[0]).spec;

  if (ctx.adsetBudget) {
    const amount = toMinorUnits(form.budget.amount, currency);
    if (form.budget.type === 'DAILY') p.daily_budget = amount; else p.lifetime_budget = amount;
    p.bid_strategy = ctx.needsCampaign ? form.campaign.bidStrategy : 'LOWEST_COST_WITHOUT_CAP';
  }
  if (form.budget.endDate) p.end_time = new Date(form.budget.endDate).toISOString();

  if (ctx.needsCampaign) {
    const bid = BID_STRATEGIES.find((b) => b.key === form.campaign.bidStrategy);
    if (bid?.needs === 'bid') p.bid_amount = toMinorUnits(form.campaign.bidAmount, currency);
    if (bid?.needs === 'roas') p.bid_constraints = { roas_average_floor: Math.round(parseFloat(form.campaign.roasFloor) * 10000) };
  }
  return p;
}

export function creativeParams(form: FormState) {
  const ad = form.ad;
  const template: any = {
    message: ad.message,
    name: ad.headline,
    description: ad.description || undefined,
    link: ad.link.trim(),
    call_to_action: { type: ad.cta },
  };
  if (ad.format === 'SINGLE') template.force_single_link = true;
  else template.multi_share_end_card = ad.endCard;
  // Multiple images per product, animated inside each carousel card.
  if (ad.format === 'CAROUSEL' && ad.media === 'SLIDESHOW') template.format_option = 'carousel_slideshows';
  const story: any = { page_id: ad.pageId, template_data: template };
  if (ad.instagramUserId) story.instagram_user_id = ad.instagramUserId;
  const urlTags = buildUrlTags(ad.urlTags || {});
  return {
    name: `${ad.name.trim() || form.adset.name.trim()} - Catalog creative`,
    product_set_id: form.adset.productSetId,
    object_story_spec: story,
    ...(urlTags ? { url_tags: urlTags } : {}),
    // Show product videos from the catalog where products have them.
    ...(ad.media === 'VIDEO' ? { degrees_of_freedom_spec: { creative_features_spec: { media_type_automation: { enroll_status: 'OPT_IN' } } } } : {}),
  };
}

/** Normal (non-catalog) ad creative: uploaded image, or an existing Facebook / Instagram post. */
export function standardCreativeParams(form: FormState) {
  const ad = form.ad;
  const urlTags = buildUrlTags(ad.urlTags || {});
  const name = `${ad.name.trim() || form.adset.name.trim()} - Creative`;
  if (ad.kind === 'POST' && ad.postSource === 'FACEBOOK') {
    return { name, object_story_id: ad.postId, ...(urlTags ? { url_tags: urlTags } : {}) };
  }
  if (ad.kind === 'POST') {
    return {
      name,
      object_id: ad.pageId,
      instagram_user_id: ad.instagramUserId,
      source_instagram_media_id: ad.postId,
      ...(urlTags ? { url_tags: urlTags } : {}),
    };
  }
  const link: any = {
    image_hash: ad.imageHash,
    link: ad.link.trim(),
    message: ad.message,
    call_to_action: { type: ad.cta, value: { link: ad.link.trim() } },
  };
  if (ad.headline.trim()) link.name = ad.headline;
  if (ad.description.trim()) link.description = ad.description;
  const story: any = { page_id: ad.pageId, link_data: link };
  if (ad.instagramUserId) story.instagram_user_id = ad.instagramUserId;
  return { name, object_story_spec: story, ...(urlTags ? { url_tags: urlTags } : {}) };
}

export async function launch(req: LaunchRequest, token: string): Promise<LaunchResult> {
  const { accountId, currency, mode, form } = req;
  const act = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  const ctx = buildContext(mode, form, req.existingCampaign, req.sourceAdset);
  const result: LaunchResult = { ok: false, created: { ads: [] }, activated: false };
  let step = 'campaign';

  try {
    // 1. Campaign (always created paused; activated at the end so nothing spends on a half-built launch)
    let campaignId = req.existingCampaign?.id || '';
    if (ctx.needsCampaign) {
      const res = await graph.post<{ id: string }>(`${act}/campaigns`, token, campaignParams(form, ctx, currency));
      campaignId = res.id;
      result.created.campaign = { id: res.id, name: form.campaign.name.trim() };
    }
    if (!campaignId) throw new GraphError({ message: 'No campaign selected.' });

    // 2. Ad set
    step = 'adset';
    let saved: any;
    const usesAudience = !ctx.isCatalog || form.adset.catalogAudience === 'BROAD';
    if (usesAudience && form.adset.audienceType === 'SAVED') {
      const s = await graph.get<{ targeting: any }>(form.adset.savedAudienceId, token, { fields: 'targeting' });
      saved = s.targeting;
    }
    const targeting = buildTargeting(form, ctx, req.sourceAdset?.targeting, saved);
    const adset = await graph.post<{ id: string }>(`${act}/adsets`, token, adsetParams(form, ctx, currency, campaignId, targeting));
    result.created.adset = { id: adset.id, name: form.adset.name.trim() };

    // 3a. New ad: catalog template, or a normal ad from an uploaded image / existing post
    if (ctx.needsAd || ctx.needsStandardAd) {
      step = 'creative';
      const creative = await graph.post<{ id: string }>(`${act}/adcreatives`, token, ctx.needsAd ? creativeParams(form) : standardCreativeParams(form));
      result.created.creative = { id: creative.id };
      step = 'ad';
      const adName = form.ad.name.trim() || `${form.adset.name.trim()} - ${ctx.needsAd ? 'Catalog ad' : 'Ad'}`;
      const ad = await graph.post<{ id: string }>(`${act}/ads`, token, {
        name: adName,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: 'PAUSED',
      });
      result.created.ads.push({ id: ad.id, name: adName });
    }

    // 3b. Duplicate: copy every ad of the source ad set into the new one
    if (ctx.copyAds && req.sourceAdset) {
      step = 'copy ads';
      const ads = await graph.list<{ id: string; name: string }>(`${req.sourceAdset.id}/ads`, token, { fields: 'id,name', limit: 100 });
      for (const ad of ads) {
        const copy = await graph.post<{ copied_ad_id?: string; ad_object_ids?: { copied_id: string }[] }>(`${ad.id}/copies`, token, {
          adset_id: adset.id,
          status_option: 'PAUSED',
        });
        const id = copy.copied_ad_id || copy.ad_object_ids?.[0]?.copied_id || '';
        result.created.ads.push({ id, name: ad.name });
      }
    }

    // 4. Activate everything we created
    if (req.status === 'ACTIVE') {
      step = 'activate';
      if (result.created.campaign) await graph.post(result.created.campaign.id, token, { status: 'ACTIVE' });
      await graph.post(adset.id, token, { status: 'ACTIVE' });
      for (const ad of result.created.ads) if (ad.id) await graph.post(ad.id, token, { status: 'ACTIVE' });
      result.activated = true;
    }

    result.ok = true;
    return result;
  } catch (e) {
    result.step = step;
    result.error = e instanceof GraphError ? e.meta : { message: (e as Error).message };
    return result;
  }
}
