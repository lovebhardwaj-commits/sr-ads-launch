'use client';
import type { MetaError } from './types';

export class ApiError extends Error {
  meta: MetaError;
  constructor(meta: MetaError) { super(meta.message); this.meta = meta; }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    window.location.href = '/login?error=expired';
    throw new ApiError({ message: 'Session expired' });
  }
  const json = await res.json().catch(() => ({ error: { message: `Request failed (${res.status})` } }));
  if (!res.ok || json.error) throw new ApiError(json.error || { message: `Request failed (${res.status})` });
  return json.data as T;
}

export async function apiGet<T>(action: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
  return handle<T>(await fetch(`/api/meta/${action}?${qs.toString()}`, { cache: 'no-store' }));
}

export async function apiPost<T>(action: string, body: unknown): Promise<T> {
  return handle<T>(await fetch(`/api/meta/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.meta.userMessage || e.meta.message;
  return (e as Error)?.message || 'Something went wrong';
}
