import { NextRequest, NextResponse } from 'next/server';
import { graph, graphLog, GraphError } from '@/lib/graph';
import { launch } from '@/lib/launch';
import { getSession } from '@/lib/session';
import type { GraphCall, LaunchRequest } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* eslint-disable @typescript-eslint/no-explicit-any */

const LIVE = ['ACTIVE', 'PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'];
const act = (id: string | null) => {
  if (!id) throw new GraphError({ message: 'Missing ad account' });
  return id.startsWith('act_') ? id : `act_${id}`;
};
const need = (v: string | null, name: string) => {
  if (!v) throw new GraphError({ message: `Missing ${name}` });
  return v;
};

async function safe<T>(fn: () => Promise<T>): Promise<T | { unavailable: string }> {
  try { return await fn(); } catch (e) { return { unavailable: (e as Error).message }; }
}

async function handleGet(action: string, q: URLSearchParams, token: string): Promise<any> {
  switch (action) {
    case 'adaccounts':
      return graph.list('me/adaccounts', token, { fields: 'id,account_id,name,currency,account_status,business{id,name}', limit: 100 }, 20);

    case 'campaigns':
      return graph.list(`${act(q.get('account'))}/campaigns`, token, {
        fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,promoted_object,updated_time,adsets.limit(0).summary(true),insights.date_preset(last_7d){spend}',
        filtering: [{ field: 'effective_status', operator: 'IN', value: LIVE }],
        limit: 100,
      });

    case 'adsets': {
      // One campaign's ad sets (loaded when it is expanded), a name search, or the whole account.
      const campaign = q.get('campaign');
      const search = (q.get('search') || '').trim();
      const filtering: any[] = [{ field: 'effective_status', operator: 'IN', value: q.get('archived') ? [...LIVE, 'ARCHIVED'] : LIVE }];
      if (search) filtering.push({ field: 'name', operator: 'CONTAIN', value: search });
      return graph.list(campaign ? `${campaign}/adsets` : `${act(q.get('account'))}/adsets`, token, {
        fields: 'id,name,status,effective_status,campaign{id,name,objective,daily_budget,lifetime_budget,bid_strategy,promoted_object},optimization_goal,billing_event,destination_type,promoted_object,targeting,attribution_spec,daily_budget,lifetime_budget,bid_strategy,bid_amount,start_time,end_time,updated_time,ads.limit(0).summary(true),insights.date_preset(last_7d){spend,actions,purchase_roas}',
        filtering,
        limit: search ? 50 : 100,
      }, search ? 1 : 5);
    }

    case 'pixels':
      return graph.list(`${act(q.get('account'))}/adspixels`, token, { fields: 'id,name', limit: 100 });

    case 'saved-audiences':
      return graph.list(`${act(q.get('account'))}/saved_audiences`, token, { fields: 'id,name', limit: 100 });

    case 'pages':
      return graph.list('me/accounts', token, { fields: 'id,name,website,link,instagram_business_account{id,username}', limit: 100 });

    case 'catalogs': {
      // Meta has no ad-account catalog edge: catalogs belong to a business. Scope them to this ad account by
      // (1) catalogs its campaigns already use, (2) catalogs linked to its datasets, then (3) the rest of its business.
      const actId = act(q.get('account'));
      const fields = 'id,name,product_count,vertical';
      const [account, campaigns, pixels] = await Promise.all([
        graph.get<{ business?: { id: string; name?: string } }>(actId, token, { fields: 'business{id,name}' }),
        safe(() => graph.list<any>(`${actId}/campaigns`, token, {
          fields: 'promoted_object',
          filtering: [{ field: 'effective_status', operator: 'IN', value: [...LIVE, 'ARCHIVED'] }],
          limit: 200,
        }, 3)),
        safe(() => graph.list<{ id: string }>(`${actId}/adspixels`, token, { fields: 'id', limit: 100 })),
      ]);
      const used = new Set<string>(Array.isArray(campaigns) ? campaigns.map((c) => c.promoted_object?.product_catalog_id).filter(Boolean) : []);
      const pixelIds = new Set<string>(Array.isArray(pixels) ? pixels.map((p) => p.id) : []);

      const seen = new Map<string, any>();
      const biz = account.business;
      if (biz?.id) {
        for (const edge of ['owned_product_catalogs', 'client_product_catalogs']) {
          const list = await safe(() => graph.list<any>(`${biz.id}/${edge}`, token, { fields, limit: 100 }));
          if (Array.isArray(list)) list.forEach((c) => seen.set(c.id, { ...c, business: biz.name, shared: edge === 'client_product_catalogs' }));
        }
      }
      // Catalogs this account uses but the business listing didn't return (e.g. shared from elsewhere).
      for (const id of Array.from(used)) {
        if (seen.has(id)) continue;
        const c = await safe(() => graph.get<any>(id, token, { fields }));
        if (c && !('unavailable' in c)) seen.set(id, c);
      }
      // Linked to one of this account's datasets (checked for up to 40 catalogs, in parallel).
      const all = Array.from(seen.values());
      const linked = new Set<string>();
      if (pixelIds.size) {
        await Promise.all(all.slice(0, 40).map(async (c) => {
          const src = await safe(() => graph.list<{ id: string }>(`${c.id}/external_event_sources`, token, { fields: 'id', limit: 50 }, 1));
          if (Array.isArray(src) && src.some((s) => pixelIds.has(s.id))) linked.add(c.id);
        }));
      }
      const rank = (c: any) => (used.has(c.id) ? 0 : linked.has(c.id) ? 1 : 2);
      return all
        .map((c) => ({ ...c, relevance: used.has(c.id) ? 'USED' : linked.has(c.id) ? 'LINKED' : 'BUSINESS' }))
        .sort((x, y) => rank(x) - rank(y) || String(x.name).localeCompare(String(y.name)));
    }

    case 'product-sets':
      // A few product images per set, in the same request, so sets can be recognised at a glance.
      return graph.list(`${need(q.get('catalog'), 'catalog')}/product_sets`, token, { fields: 'id,name,product_count,products.limit(4){id,image_url}', limit: 100 });

    case 'set-health': {
      // Out-of-stock count and a sample of product links opened to check they land on a real product page.
      const set = need(q.get('set'), 'set');
      const [oos, sample] = await Promise.all([
        safe(() => graph.get<{ data: any[]; summary?: { total_count?: number } }>(`${set}/products`, token, { fields: 'id', filter: { availability: { eq: 'out of stock' } }, limit: 100, summary: true })),
        graph.get<{ data: { id: string; name: string; url?: string }[] }>(`${set}/products`, token, { fields: 'id,name,url', limit: 8 }),
      ]);
      const outOfStock = 'unavailable' in oos ? null : (oos.summary?.total_count ?? oos.data.length);
      const links = await Promise.all(sample.data.filter((p) => p.url).map(async (p) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        try {
          let res = await fetch(p.url!, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal, cache: 'no-store' });
          if (res.status === 405 || res.status === 403) res = await fetch(p.url!, { method: 'GET', redirect: 'follow', signal: ctrl.signal, cache: 'no-store' });
          const from = new URL(p.url!); const to = new URL(res.url || p.url!);
          const toHome = from.pathname.replace(/\/$/, '') !== '' && (to.pathname === '/' || to.pathname === '');
          return { id: p.id, name: p.name, url: p.url, status: res.status, ok: res.ok && !toHome, reason: !res.ok ? `Returns ${res.status}` : toHome ? 'Redirects to the homepage' : '' };
        } catch (e) {
          return { id: p.id, name: p.name, url: p.url, status: 0, ok: false, reason: (e as Error).name === 'AbortError' ? 'Took too long to load' : 'Could not be opened' };
        } finally { clearTimeout(t); }
      }));
      return { outOfStock, links, noUrl: sample.data.filter((p) => !p.url).length };
    }

    case 'products': {
      const set = q.get('set');
      const path = set ? `${set}/products` : `${need(q.get('catalog'), 'catalog')}/products`;
      const res = await graph.get<{ data: any[] }>(path, token, { fields: 'id,name,price,sale_price,image_url,additional_image_urls,url,brand', limit: 25 });
      return res.data;
    }

    case 'health': {
      const catalog = need(q.get('catalog'), 'catalog');
      const pixel = q.get('pixel');
      const [info, sources, stats, diagnostics, checks] = await Promise.all([
        safe(() => graph.get<any>(catalog, token, { fields: 'id,name,product_count,vertical' })),
        safe(() => graph.list<any>(`${catalog}/external_event_sources`, token, { fields: 'id,name', limit: 50 })),
        safe(() => graph.get<any>(`${catalog}/event_stats`, token)),
        safe(() => graph.get<any>(`${catalog}/diagnostics`, token)),
        pixel ? safe(() => graph.get<any>(`${pixel}/da_checks`, token, { fields: 'key,title,description,result,action_uri' })) : Promise.resolve(null),
      ]);
      return { info, sources, stats, diagnostics, checks };
    }

    case 'search': {
      const type = need(q.get('type'), 'type');
      if (!['adgeolocation', 'adlocale', 'adinterest'].includes(type)) throw new GraphError({ message: 'Unsupported search type' });
      const params: any = { type, q: q.get('q') || '', limit: 10 };
      if (type === 'adgeolocation') params.location_types = ['country', 'region', 'city'];
      const res = await graph.get<{ data: any[] }>('search', token, params);
      return res.data;
    }

    case 'posts': {
      // Recent posts to promote as an existing-post ad.
      const page = need(q.get('page'), 'page');
      if (q.get('source') === 'INSTAGRAM') {
        const ig = need(q.get('ig'), 'Instagram account');
        const res = await graph.get<{ data: any[] }>(`${ig}/media`, token, { fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp,permalink', limit: 24 });
        return res.data.map((m) => ({ id: m.id, text: m.caption || '', image: m.thumbnail_url || m.media_url || '', type: m.media_type, time: m.timestamp, link: m.permalink }));
      }
      // Page posts need the Page's own token, read server-side and never sent to the browser.
      const pg = await graph.get<{ access_token?: string }>(page, token, { fields: 'access_token' });
      const res = await graph.get<{ data: any[] }>(`${page}/published_posts`, pg.access_token || token, { fields: 'id,message,full_picture,created_time,permalink_url', limit: 24 });
      return res.data.map((p) => ({ id: p.id, text: p.message || '', image: p.full_picture || '', type: 'POST', time: p.created_time, link: p.permalink_url }));
    }

    case 'me':
      return graph.get('me', token, { fields: 'id,name' });
  }
  throw new GraphError({ message: `Unknown action ${action}` }, 404);
}

async function handlePost(action: string, body: any, token: string): Promise<any> {
  switch (action) {
    case 'link-pixel':
      return graph.post(`${need(body.catalog, 'catalog')}/external_event_sources`, token, {
        external_event_sources: [need(body.pixel, 'pixel')],
      });
    case 'upload-image': {
      // Image for a new ad: stored in the ad account's image library, referenced by hash.
      const bytes = need(body.bytes, 'image');
      if (bytes.length > 4_200_000) throw new GraphError({ message: 'Image is too large. Use an image under 3 MB.' });
      const res = await graph.post<{ images: Record<string, { hash: string; url: string }> }>(`${act(body.account)}/adimages`, token, { bytes, name: body.name || 'image' });
      const first = Object.values(res.images || {})[0];
      if (!first) throw new GraphError({ message: 'Facebook did not return an image hash.' });
      return { hash: first.hash, url: first.url };
    }
    case 'launch':
      return launch(body as LaunchRequest, token);
  }
  throw new GraphError({ message: `Unknown action ${action}` }, 404);
}

function errorResponse(e: unknown, log: GraphCall[]) {
  if (e instanceof GraphError) return NextResponse.json({ error: e.meta, log }, { status: e.status });
  return NextResponse.json({ error: { message: (e as Error).message || 'Unexpected error' }, log }, { status: 500 });
}

// Every response carries `log`: the Graph API calls made to answer it (shown in the API log panel).
export async function GET(req: NextRequest, { params }: { params: { action: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: 'Not logged in' }, log: [] }, { status: 401 });
  const log: GraphCall[] = [];
  try {
    const data = await graphLog.run(log, () => handleGet(params.action, req.nextUrl.searchParams, session.token));
    return NextResponse.json({ data, log });
  } catch (e) {
    return errorResponse(e, log);
  }
}

export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: 'Not logged in' }, log: [] }, { status: 401 });
  const log: GraphCall[] = [];
  try {
    const body = await req.json();
    const data = await graphLog.run(log, () => handlePost(params.action, body, session.token));
    return NextResponse.json({ data, log });
  } catch (e) {
    return errorResponse(e, log);
  }
}
