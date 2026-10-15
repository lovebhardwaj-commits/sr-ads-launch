import 'server-only';
import { headers } from 'next/headers';

/** Public origin of this deployment, used for the OAuth redirect URI. */
export function appOrigin(): string {
  const fromEnv = process.env.APP_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const h = headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
