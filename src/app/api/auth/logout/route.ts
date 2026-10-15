import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/config';
import { appOrigin } from '@/lib/origin';

export const dynamic = 'force-dynamic';

function out() {
  const res = NextResponse.redirect(`${appOrigin()}/login`, { status: 303 });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
export const GET = out;
export const POST = out;
