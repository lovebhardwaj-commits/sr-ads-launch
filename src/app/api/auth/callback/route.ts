import { NextRequest, NextResponse } from 'next/server';
import { PERMISSIONS, SESSION_COOKIE, STATE_COOKIE, getScopes } from '@/lib/config';
import { graph, oauthGet } from '@/lib/graph';
import { appOrigin } from '@/lib/origin';
import { sealSession, sessionCookieOptions } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const origin = appOrigin();
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  const params = req.nextUrl.searchParams;
  if (params.get('error')) return fail(params.get('error_description') || params.get('error') || 'denied');
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state || state !== req.cookies.get(STATE_COOKIE)?.value) return fail('state');

  try {
    const redirectUri = `${origin}/api/auth/callback`;
    const short = await oauthGet<{ access_token: string }>('oauth/access_token', {
      client_id: process.env.FACEBOOK_APP_ID!,
      client_secret: process.env.FACEBOOK_APP_SECRET!,
      redirect_uri: redirectUri,
      code,
    });
    // Swap for a long-lived (about 60 day) token.
    const long = await oauthGet<{ access_token: string; expires_in?: number }>('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: process.env.FACEBOOK_APP_ID!,
      client_secret: process.env.FACEBOOK_APP_SECRET!,
      fb_exchange_token: short.access_token,
    });
    const token = long.access_token;
    const me = await graph.get<{ id: string; name: string; picture?: { data?: { url?: string } } }>('me', token, { fields: 'id,name,picture.width(96).height(96)' });
    const perms = await graph.get<{ data: { permission: string; status: string }[] }>('me/permissions', token);
    // /me/permissions lists everything this Meta app ever asked this user for (other apps or
    // older logins on the same app ID included). Only flag permissions this app requests.
    const granted = new Set(perms.data.filter((p) => p.status === 'granted').map((p) => p.permission));
    const declined = process.env.FACEBOOK_CONFIG_ID
      // Login for Business: the configuration decides the scopes, so only flag known ones Facebook marks declined.
      ? perms.data.filter((p) => p.status === 'declined' && PERMISSIONS.some((x) => x.scope === p.permission)).map((p) => p.permission)
      : getScopes().filter((s) => !granted.has(s));

    const sealed = await sealSession({
      token,
      userId: me.id,
      name: me.name,
      picture: me.picture?.data?.url,
      declined,
      tokenExpiresAt: long.expires_in ? Date.now() + long.expires_in * 1000 : undefined,
    });
    const res = NextResponse.redirect(`${origin}/launch`);
    res.cookies.set(SESSION_COOKIE, sealed, sessionCookieOptions);
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (e) {
    return fail((e as Error).message || 'exchange');
  }
}
