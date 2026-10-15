import 'server-only';
import { headers } from 'next/headers';

/**
 * Public origin of this deployment. APP_URL is required: the OAuth redirect URI is
 * always <APP_URL>/api/auth/callback, which must be registered in the Meta app.
 * The request-host fallback is only used to show the "missing settings" screen.
 */
export function appOrigin(): string {
  const fromEnv = process.env.APP_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const h = headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
