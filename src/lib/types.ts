/** AD_ONLY = reverse journey: an ad built first, added to an existing ad set */
export type Mode = 'NEW' | 'EXISTING' | 'DUP_NEW' | 'DUP_EXISTING' | 'AD_ONLY';

export interface GeoItem { key: string; name: string; type: string; country_code?: string }
export interface LocaleItem { key: number; name: string }
export interface InterestItem { id: string; name: string }

export interface AdAccount { id: string; account_id: string; name: string; currency: string; account_status?: number; business?: { id: string; name: string } }

export interface CampaignLite {
  id: string;
  name: string;
  objective: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
  promoted_object?: { product_catalog_id?: string };
  adsets?: { summary?: { total_count?: number } };
}

export interface AdsetLite {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  campaign?: CampaignLite;
  optimization_goal?: string;
  billing_event?: string;
  destination_type?: string;
  promoted_object?: { pixel_id?: string; custom_event_type?: string; product_set_id?: string; product_catalog_id?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targeting?: any;
  attribution_spec?: { event_type: string; window_days: number }[];
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
  bid_amount?: number;
  start_time?: string;
  end_time?: string;
  ads?: { summary?: { total_count?: number } };
}

export interface FormState {
  campaign: {
    name: string;
    objective: string;
    setup: 'MANUAL' | 'ADVANTAGE_PLUS';
    bidStrategy: string;
    bidAmount: string;
    roasFloor: string;
    catalogEnabled: boolean;
    catalogId: string;
  };
  /** level = where the budget lives; entering an amount at one level disables the other */
  budget: { level: 'CAMPAIGN' | 'ADSET'; type: 'DAILY' | 'LIFETIME'; amount: string; endDate: string };
  adset: {
    name: string;
    goal: string;
    event: string;
    pixelId: string;
    /** SOURCE = keep the duplicated ad set's audience (custom audiences, lookalikes) */
    audienceType: 'ADVANTAGE' | 'INTEREST' | 'SAVED' | 'SOURCE';
    interests: InterestItem[];
    savedAudienceId: string;
    locations: GeoItem[];
    ageMin: number;
    ageMax: number;
    gender: 'ALL' | 'MALE' | 'FEMALE';
    locales: LocaleItem[];
    placement: 'ADVANTAGE' | 'MANUAL';
    platforms: string[];
    attribution: string;
    /** Schedule: empty = start as soon as published (datetime-local value) */
    startTime: string;
    // catalog only
    productSetId: string;
    catalogAudience: 'RETARGET' | 'BROAD';
    /** Meta's retargeting presets; UPSELL / CROSS_SELL target people from crossSellSourceSetId */
    retargetPreset: 'VIEWED_OR_ATC' | 'ATC' | 'UPSELL' | 'CROSS_SELL' | 'CUSTOM';
    retargetEvents: string[];
    retargetDays: number;
    excludePurchasers: boolean;
    excludeDays: number;
    crossSellSourceSetId: string;
  };
  ad: {
    /** CATALOG = catalog template ad; UPLOAD = new ad from an uploaded image; POST = existing FB/IG post; NONE = no ad */
    kind: 'CATALOG' | 'UPLOAD' | 'POST' | 'NONE';
    /** Duplicates: copy the original ad set's ads, and/or add a new ad */
    copyOriginal: boolean;
    addNew: boolean;
    /** Reverse journey: the ad was built before choosing where it goes */
    adFirst: boolean;
    imageHash: string;
    imageUrl: string;
    imageName: string;
    postSource: 'FACEBOOK' | 'INSTAGRAM';
    postId: string;
    postPreview: string;
    name: string;
    pageId: string;
    instagramUserId: string;
    format: 'CAROUSEL' | 'SINGLE';
    /** Meta catalog media: product images, multi-image slideshow per card, or product video when available */
    media: 'IMAGES' | 'SLIDESHOW' | 'VIDEO';
    /** Catalog ads: website only, or open the app via the catalog's deep links with the website as backup */
    destination: 'WEBSITE' | 'APP_WEB';
    message: string;
    headline: string;
    description: string;
    cta: string;
    link: string;
    endCard: boolean;
    /** URL parameters (UTM) appended to every product link */
    urlTags: UrlTags;
  };
}

export interface UrlTags { source: string; medium: string; campaign: string; content: string; term: string }

/** What the current screen is building. Derived from mode + chosen campaign. */
export interface FlowContext {
  mode: Mode;
  needsCampaign: boolean;
  objective: string;
  isCatalog: boolean;
  catalogId: string;
  /** Budget lives on the ad set (new campaign with ad set budget, or existing campaign without one) */
  adsetBudget: boolean;
  /** Existing campaign already has a campaign budget */
  campaignHasBudget: boolean;
  showBudget: boolean;
  /** A catalog template ad will be created */
  needsAd: boolean;
  /** Catalog ad inside a campaign without a catalog (ad-level catalog and product set) */
  adLevelCatalog: boolean;
  /** A normal (non-catalog) ad will be created: uploaded image or existing post */
  needsStandardAd: boolean;
  /** Duplicate: copy the original ad set's ads */
  copyAds: boolean;
  isDup: boolean;
  /** Catalog choice is fixed (existing catalog campaign, or duplicating a catalog ad set) */
  catalogLocked: boolean;
}

export interface LaunchRequest {
  accountId: string;
  currency: string;
  mode: Mode;
  status: 'PAUSED' | 'ACTIVE';
  form: FormState;
  existingCampaign?: CampaignLite;
  sourceAdset?: AdsetLite;
  /** AD_ONLY: the existing ad set the ad is added to */
  targetAdset?: AdsetLite;
}

export interface LaunchResult {
  ok: boolean;
  created: { campaign?: { id: string; name: string }; adset?: { id: string; name: string }; creative?: { id: string }; ads: { id: string; name: string }[] };
  activated: boolean;
  error?: MetaError;
  step?: string;
}

/** One Graph API request, recorded on the server and shown in the API log. Secrets are removed. */
export interface GraphCall {
  id: string;
  at: number;
  method: string;
  path: string;
  params: Record<string, unknown>;
  status: number;
  ms: number;
  ok: boolean;
  response?: unknown;
  truncated?: boolean;
}

export interface MetaError { message: string; title?: string; userMessage?: string; code?: number; subcode?: number; fbtraceId?: string }
