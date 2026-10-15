'use client';
import { addLogGroup } from './api-log';
import type { MetaError } from './types';

export class ApiError extends Error {
  meta: MetaError;
  constructor(meta: MetaError) { super(meta.message); this.meta = meta; }
}

async function handle<T>(res: Response, entry: { method: 'GET' | 'POST'; action: string; input: unknown; started: number }): Promise<T> {
  const json = await res.json().catch(() => ({ error: { message: `Request failed (${res.status})` } }));
  addLogGroup({
    at: entry.started,
    method: entry.method,
    action: entry.action,
    input: entry.input,
    status: res.status,
    ms: Date.now() - entry.started,
    ok: res.ok && !json.error && !(json.data && json.data.ok === false),
    output: json.error ? { error: json.error } : json.data,
    calls: Array.isArray(json.log) ? json.log : [],
  });
  if (res.status === 401) {
    window.location.href = '/login?error=expired';
    throw new ApiError({ message: 'Session expired' });
  }
  if (!res.ok || json.error) throw new ApiError(json.error || { message: `Request failed (${res.status})` });
  return json.data as T;
}

export async function apiGet<T>(action: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
  const started = Date.now();
  const res = await fetch(`/api/meta/${action}?${qs.toString()}`, { cache: 'no-store' });
  return handle<T>(res, { method: 'GET', action, input: Object.fromEntries(qs.entries()), started });
}

export async function apiPost<T>(action: string, body: unknown): Promise<T> {
  const started = Date.now();
  const res = await fetch(`/api/meta/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handle<T>(res, { method: 'POST', action, input: body, started });
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.meta.userMessage || e.meta.message;
  return (e as Error)?.message || 'Something went wrong';
}
