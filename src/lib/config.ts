// Server-side configuration. Values come from Vercel environment variables.

/**
 * Every permission the launcher asks for, and why. Shown on the login screen
 * and sent to Facebook Login unless FACEBOOK_CONFIG_ID or FACEBOOK_SCOPES is set.
 */
export const PERMISSIONS: { scope: string; why: string }[] = [
  { scope: 'public_profile', why: 'Your name and photo in the sidebar' },
  { scope: 'email', why: 'Identify your login' },
  { scope: 'ads_management', why: 'Create campaigns, ad sets, ads and copies' },
  { scope: 'ads_read', why: 'Read campaigns, ad sets and results' },
  { scope: 'business_management', why: 'Find catalogs and pixels owned by your business' },
  { scope: 'catalog_management', why: 'Read catalogs and product sets, link a pixel to a catalog' },
  { scope: 'pages_show_list', why: 'List the Pages your ads can run from' },
  { scope: 'pages_read_engagement', why: 'Read Page details used in ad creatives' },
  { scope: 'instagram_basic', why: 'Find the Instagram account connected to a Page' },
];

export function getScopes(): string[] {
  const override = process.env.FACEBOOK_SCOPES;
  if (override && override.trim()) {
    return override.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return PERMISSIONS.map((p) => p.scope);
}

export const GRAPH_VERSION = process.env.META_API_VERSION || 'v23.0';
export const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

export function missingEnv(): string[] {
  const required = ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'SESSION_SECRET'];
  return required.filter((k) => !process.env[k]);
}

export const SESSION_COOKIE = 'sr_launch_session';
export const STATE_COOKIE = 'sr_launch_oauth_state';
