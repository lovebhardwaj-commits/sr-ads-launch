import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { GRAPH_VERSION, STATE_COOKIE, getScopes, missingEnv } from '@/lib/config';
import { appOrigin } from '@/lib/origin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const origin = appOrigin();
  const missing = missingEnv();
  if (missing.length) {
    return NextResponse.redirect(`${origin}/login?error=config&missing=${missing.join(',')}`);
  }
  const state = randomBytes(24).toString('hex');
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', process.env.FACEBOOK_APP_ID!);
  url.searchParams.set('redirect_uri', `${origin}/api/auth/callback`);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  if (process.env.FACEBOOK_CONFIG_ID) {
    url.searchParams.set('config_id', process.env.FACEBOOK_CONFIG_ID);
  } else {
    url.searchParams.set('scope', getScopes().join(','));
    url.searchParams.set('auth_type', 'rerequest');
  }
  const res = NextResponse.redirect(url.toString());
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
