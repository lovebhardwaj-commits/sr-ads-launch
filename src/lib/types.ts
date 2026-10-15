export type Mode = 'NEW' | 'EXISTING' | 'DUP_NEW' | 'DUP_EXISTING';

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
  budget: { type: 'DAILY' | 'LIFETIME'; amount: string; endDate: string };
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
    // catalog only
    productSetId: string;
    catalogAudience: 'RETARGET' | 'BROAD' | 'CROSS_SELL';
    retargetEvents: string[];
    retargetDays: number;
    excludePurchasers: boolean;
    excludeDays: number;
    crossSellSourceSetId: string;
  };
  ad: {
    name: string;
    pageId: string;
    instagramUserId: string;
    format: 'CAROUSEL' | 'SINGLE';
    message: string;
    headline: string;
    description: string;
    cta: string;
    link: string;
    endCard: boolean;
  };
}

/** What the current screen is building. Derived from mode + chosen campaign. */
export interface FlowContext {
  mode: Mode;
  needsCampaign: boolean;
  objective: string;
  isCatalog: boolean;
  catalogId: string;
  /** Budget shown on the ad set instead of the campaign */
  adsetBudget: boolean;
  showBudget: boolean;
  /** Catalog ad step (new catalog ad sets need a template ad; duplicates copy their ads) */
  needsAd: boolean;
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
}

export interface LaunchResult {
  ok: boolean;
  created: { campaign?: { id: string; name: string }; adset?: { id: string; name: string }; creative?: { id: string }; ads: { id: string; name: string }[] };
  activated: boolean;
  error?: MetaError;
  step?: string;
}

export interface MetaError { message: string; title?: string; userMessage?: string; code?: number; subcode?: number; fbtraceId?: string }
