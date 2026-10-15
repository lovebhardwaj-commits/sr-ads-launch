import 'server-only';
import { createHash } from 'crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from './config';

export interface Session {
  token: string;
  userId: string;
  name: string;
  picture?: string;
  declined: string[];
  tokenExpiresAt?: number;
}

const SIXTY_DAYS = 60 * 24 * 60 * 60;

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return new Uint8Array(createHash('sha256').update(secret).digest());
}

export async function sealSession(session: Session): Promise<string> {
  return new EncryptJWT({ ...session })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${SIXTY_DAYS}s`)
    .encrypt(key());
}

export async function getSession(): Promise<Session | null> {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtDecrypt(raw, key());
    if (!payload.token) return null;
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SIXTY_DAYS,
};
