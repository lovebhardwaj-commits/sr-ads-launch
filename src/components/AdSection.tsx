'use client';
import { useEffect, useMemo } from 'react';
import { apiGet } from '@/lib/client-api';
import { CTAS, PRODUCT_TOKENS, URL_DYNAMIC_PARAMS, UTM_FIELDS, buildUrlTags } from '@/lib/constants';
import { useAsync } from '@/lib/hooks';
import type { FormState } from '@/lib/types';
import { Field, Loading, Segmented, Select, TextInput, Toggle } from './ui';

interface Page { id: string; name: string; instagram_business_account?: { id: string; username?: string } }
interface Product { id: string; name: string; price?: string; sale_price?: string; image_url?: string; brand?: string; url?: string }

function fill(text: string, p?: Product): string {
  if (!p) return text;
  const current = p.sale_price && p.sale_price !== p.price ? p.sale_price : p.price;
  return text
    .replace(/\{\{\s*product\.name[^}]*\}\}/g, p.name || '')
    .replace(/\{\{\s*product\.current_price[^}]*\}\}/g, current || '')
    .replace(/\{\{\s*product\.price[^}]*\}\}/g, p.price || '')
    .replace(/\{\{\s*product\.brand[^}]*\}\}/g, p.brand || '')
    .replace(/\{\{\s*product\.description[^}]*\}\}/g, '');
}

function Tokens({ onInsert }: { onInsert: (t: string) => void }) {
  return (
    <div className="tokens">
      {PRODUCT_TOKENS.map((t) => <button key={t.token} type="button" onClick={() => onInsert(t.token)} title={t.token}>+ {t.label}</button>)}
    </div>
  );
}

export default function AdSection({ form, setAd, productSetId, catalogId }: {
  form: FormState;
  setAd: (p: Partial<FormState['ad']>) => void;
  productSetId: string;
  catalogId: string;
}) {
  const ad = form.ad;
  const pages = useAsync<Page[]>('pages', () => apiGet('pages'));
  const products = useAsync<Product[]>(productSetId ? `products-${productSetId}` : catalogId ? `products-c-${catalogId}` : null,
    () => apiGet('products', { set: productSetId || undefined, catalog: catalogId }));

  const page = pages.data?.find((p) => p.id === ad.pageId);
  const ig = page?.instagram_business_account;

  useEffect(() => {
    if (!ad.pageId && pages.data?.length === 1) setAd({ pageId: pages.data[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.data]);

  // Use the Page's Instagram account by default; clear it if the Page changes.
  useEffect(() => {
    setAd({ instagramUserId: ig?.id || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.pageId, ig?.id]);

  // Pre-fill the website from the first product's domain.
  useEffect(() => {
    const url = products.data?.find((p) => p.url)?.url;
    if (!ad.link && url) {
      try { setAd({ link: new URL(url).origin }); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.data]);

  const sample = useMemo(() => (products.data || []).slice(0, ad.format === 'SINGLE' ? 1 : 5), [products.data, ad.format]);
  const ctaLabel = CTAS.find((c) => c.key === ad.cta)?.label || 'Shop now';
  const urlTags = buildUrlTags(ad.urlTags || {});

  return (
    <div className="card">
      <Field label="Facebook Page">
        {pages.loading ? <Loading text="Loading Pages…" /> : pages.error ? <div className="notice bad">{pages.error}</div> : (
          <Select value={ad.pageId} onChange={(v) => setAd({ pageId: v })} placeholder="Select a Page..." options={(pages.data || []).map((p) => ({ key: p.id, label: p.name }))} />
        )}
      </Field>
      {page ? (
        <Field>
          {ig ? (
            <Toggle checked={!!ad.instagramUserId} onChange={(v) => setAd({ instagramUserId: v ? ig.id : '' })} label={<>Run on Instagram as <span className="strong">@{ig.username || ig.id}</span></>} />
          ) : (
            <p className="hint" style={{ margin: 0 }}>This Page has no connected Instagram account, so Instagram placements use the Page name.</p>
          )}
        </Field>
      ) : null}
      <Field label="Ad name">
        <TextInput value={ad.name} onChange={(e) => setAd({ name: e.target.value })} placeholder={`e.g. ${form.adset.name || 'Catalog'} - Carousel`} />
      </Field>
      <Field label="Format">
        <Segmented value={ad.format} onChange={(v) => setAd({ format: v })} options={[{ key: 'CAROUSEL', label: 'Carousel' }, { key: 'SINGLE', label: 'Single image or video' }]} />
      </Field>
      <Field label="Primary text">
        <textarea className="input" value={ad.message} onChange={(e) => setAd({ message: e.target.value })} rows={3} />
        <Tokens onInsert={(t) => setAd({ message: `${ad.message}${ad.message.endsWith(' ') || !ad.message ? '' : ' '}${t}` })} />
      </Field>
      <div className="row field">
        <Field label="Headline">
          <TextInput value={ad.headline} onChange={(e) => setAd({ headline: e.target.value })} />
          <Tokens onInsert={(t) => setAd({ headline: `${ad.headline}${ad.headline && !ad.headline.endsWith(' ') ? ' ' : ''}${t}` })} />
        </Field>
        <Field label="Description">
          <TextInput value={ad.description} onChange={(e) => setAd({ description: e.target.value })} />
          <Tokens onInsert={(t) => setAd({ description: `${ad.description}${ad.description && !ad.description.endsWith(' ') ? ' ' : ''}${t}` })} />
        </Field>
      </div>
      <div className="row field">
        <Field label="Call to action">
          <Select value={ad.cta} onChange={(v) => setAd({ cta: v })} options={CTAS} />
        </Field>
        <Field label="See more URL" hint="Where the card at the end sends people. Each product card opens its own product page.">
          <TextInput value={ad.link} onChange={(e) => setAd({ link: e.target.value })} placeholder="https://yourstore.com" />
        </Field>
      </div>
      {ad.format === 'CAROUSEL' ? (
        <Field>
          <Toggle checked={ad.endCard} onChange={(v) => setAd({ endCard: v })} label="Add a card at the end with your Page profile picture" />
        </Field>
      ) : null}

      <h3 className="label strong" style={{ marginTop: 22, fontSize: 13 }}>Tracking</h3>
      <div className="row field" style={{ marginTop: 6 }}>
        {UTM_FIELDS.slice(0, 2).map((f) => (
          <Field key={f.key} label={f.label}>
            <TextInput value={ad.urlTags[f.key]} placeholder={f.placeholder} onChange={(e) => setAd({ urlTags: { ...ad.urlTags, [f.key]: e.target.value } })} />
          </Field>
        ))}
      </div>
      <div className="row field">
        {UTM_FIELDS.slice(2, 4).map((f) => (
          <Field key={f.key} label={f.label}>
            <TextInput value={ad.urlTags[f.key]} placeholder={f.placeholder} onChange={(e) => setAd({ urlTags: { ...ad.urlTags, [f.key]: e.target.value } })} />
          </Field>
        ))}
      </div>
      <Field label={UTM_FIELDS[4].label}>
        <TextInput value={ad.urlTags.term} placeholder={UTM_FIELDS[4].placeholder} onChange={(e) => setAd({ urlTags: { ...ad.urlTags, term: e.target.value } })} />
      </Field>
      <Field label="URL parameters" hint={<>Added to every product link. Dynamic parameters Meta fills per ad: {URL_DYNAMIC_PARAMS.join(', ')}</>}>
        <TextInput readOnly value={urlTags || 'No URL parameters'} aria-label="URL parameters" />
      </Field>

      <div className="preview" aria-label="Ad preview">
        <div className="preview-head">
          <div className="pg">{(page?.name || 'P').slice(0, 1)}</div>
          <div><div className="n">{page?.name || 'Your Page'}</div><div className="s">Sponsored</div></div>
        </div>
        <div className="preview-text">{fill(ad.message, sample[0])}</div>
        {products.loading ? <Loading text="Loading products…" /> : products.error ? <div className="notice warn">Preview unavailable: {products.error}</div> : !sample.length ? (
          <div className="note">Pick a product set to preview real products.</div>
        ) : (
          <div className="cards-row">
            {sample.map((p) => (
              <div key={p.id} className={`p-card ${ad.format === 'SINGLE' ? 'single' : ''}`}>
                <div className="img" style={{ backgroundImage: p.image_url ? `url("${p.image_url}")` : undefined }} />
                <div className="body">
                  <div style={{ minWidth: 0 }}>
                    <div className="h">{fill(ad.headline, p) || p.name}</div>
                    <div className="ds">{fill(ad.description, p)}</div>
                  </div>
                  <span className="cta">{ctaLabel}</span>
                </div>
              </div>
            ))}
            {ad.format === 'CAROUSEL' && ad.endCard ? (
              <div className="p-card end">
                <div className="img">See more at<br />{ad.link.replace(/^https?:\/\//, '') || 'your website'}</div>
                <div className="body"><div className="h">Shop all</div><span className="cta">{ctaLabel}</span></div>
              </div>
            ) : null}
          </div>
        )}
        <p className="hint">Preview with {sample.length || 'no'} {sample.length === 1 ? 'product' : 'products'} from the selected set. Meta picks the products per shopper when the ad runs.</p>
      </div>
    </div>
  );
}
