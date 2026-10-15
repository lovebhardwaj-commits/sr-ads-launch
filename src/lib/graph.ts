import 'server-only';
import { createHmac } from 'crypto';
import { GRAPH_URL } from './config';
import type { MetaError } from './types';

export class GraphError extends Error {
  meta: MetaError;
  status: number;
  constructor(meta: MetaError, status = 400) {
    super(meta.message);
    this.meta = meta;
    this.status = status;
  }
}

type Params = Record<string, string | number | boolean | object | undefined | null>;

function encode(params: Params): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    out.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  return out;
}

function proof(token: string): string | undefined {
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!secret) return undefined;
  return createHmac('sha256', secret).update(token).digest('hex');
}

async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, token: string, params: Params = {}): Promise<T> {
  const auth: Params = { access_token: token, appsecret_proof: proof(token) };
  const url = path.startsWith('http') ? new URL(path) : new URL(`${GRAPH_URL}/${path.replace(/^\//, '')}`);
  let res: Response;
  if (method === 'GET') {
    const qs = encode({ ...params, ...auth });
    qs.forEach((v, k) => url.searchParams.set(k, v));
    res = await fetch(url, { method, cache: 'no-store' });
  } else {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encode({ ...params, ...auth }),
      cache: 'no-store',
    });
  }
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try { json = JSON.parse(text); } catch { json = { error: { message: text || res.statusText } }; }
  if (!res.ok || json?.error) {
    const e = json?.error || {};
    throw new GraphError(
      {
        message: e.message || `Facebook returned ${res.status}`,
        title: e.error_user_title,
        userMessage: e.error_user_msg,
        code: e.code,
        subcode: e.error_subcode,
        fbtraceId: e.fbtrace_id,
      },
      e.code === 190 ? 401 : res.status >= 400 ? res.status : 400,
    );
  }
  return json as T;
}

export const graph = {
  get: <T>(path: string, token: string, params?: Params) => call<T>('GET', path, token, params),
  post: <T>(path: string, token: string, params?: Params) => call<T>('POST', path, token, params),
  /** GET a list edge and follow `paging.next` up to `maxPages`. */
  async list<T>(path: string, token: string, params: Params = {}, maxPages = 5): Promise<T[]> {
    const out: T[] = [];
    let page = await call<{ data: T[]; paging?: { next?: string } }>('GET', path, token, params);
    out.push(...(page.data || []));
    let n = 1;
    while (page.paging?.next && n < maxPages) {
      page = await call<{ data: T[]; paging?: { next?: string } }>('GET', page.paging.next, token);
      out.push(...(page.data || []));
      n++;
    }
    return out;
  },
};

/** Token exchange calls that don't use a user token. */
export async function oauthGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_URL}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok || json.error) throw new GraphError({ message: json.error?.message || 'Token exchange failed', code: json.error?.code });
  return json as T;
}
