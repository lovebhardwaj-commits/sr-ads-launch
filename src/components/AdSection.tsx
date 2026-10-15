'use client';
import { ChevronLeft, ChevronRight, Heart, MessageCircle, Play, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/client-api';
import { CTAS, PRODUCT_TOKENS, URL_DYNAMIC_PARAMS, UTM_FIELDS, buildUrlTags } from '@/lib/constants';
import { useAsync } from '@/lib/hooks';
import type { FormState } from '@/lib/types';
import { Field, Loading, SearchSelect, Segmented, Select, TextInput, Toggle } from './ui';

interface Page { id: string; name: string; instagram_business_account?: { id: string; username?: string } }
interface Product { id: string; name: string; price?: string; sale_price?: string; image_url?: string; additional_image_urls?: string[]; brand?: string; url?: string }

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

/** All images of a product: main image plus catalog additional images. */
const imagesOf = (p: Product) => [p.image_url, ...(p.additional_image_urls || [])].filter(Boolean).slice(0, 5) as string[];

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
  const [placement, setPlacement] = useState<'FEED' | 'STORIES' | 'REELS'>('FEED');
  const [idx, setIdx] = useState(0);
  const [tick, setTick] = useState(0);

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

  // Pre-fill the See more URL from the first product's domain.
  useEffect(() => {
    const url = products.data?.find((p) => p.url)?.url;
    if (!ad.link && url) {
      try { setAd({ link: new URL(url).origin }); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.data]);

  // Slideshow preview: rotate each product's images.
  useEffect(() => {
    if (ad.media !== 'SLIDESHOW') return;
    const t = setInterval(() => setTick((n) => n + 1), 1400);
    return () => clearInterval(t);
  }, [ad.media]);

  // Slideshow only exists for carousels.
  useEffect(() => {
    if (ad.format === 'SINGLE' && ad.media === 'SLIDESHOW') setAd({ media: 'IMAGES' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.format]);

  const sample = useMemo(() => (products.data || []).slice(0, ad.format === 'SINGLE' ? 1 : 5), [products.data, ad.format]);
  const cur = sample[Math.min(idx, Math.max(sample.length - 1, 0))];
  const ctaLabel = CTAS.find((c) => c.key === ad.cta)?.label || 'Shop now';
  const urlTags = buildUrlTags(ad.urlTags || {});
  const imageFor = (p: Product) => {
    const imgs = imagesOf(p);
    return ad.media === 'SLIDESHOW' && imgs.length ? imgs[tick % imgs.length] : imgs[0];
  };
  const badge = (p: Product) => {
    const imgs = imagesOf(p);
    if (ad.media === 'VIDEO') return <span className="media-badge"><Play size={9} fill="#fff" /> Video if available</span>;
    if (ad.media === 'SLIDESHOW') return <span className="media-badge">{imgs.length > 1 ? `${(tick % imgs.length) + 1}/${imgs.length}` : '1 image'}</span>;
    return null;
  };
  const pageName = page?.name || 'Your Page';

  return (
    <div className="card">
      <Field label="Facebook Page">
        {pages.loading ? <Loading text="Loading Pages…" /> : pages.error ? <div className="notice bad">{pages.error}</div> : (
          <SearchSelect
            value={ad.pageId}
            onChange={(v) => setAd({ pageId: v })}
            ariaLabel="Facebook Page"
            noun="Pages"
            placeholder="Select a Page..."
            searchPlaceholder={`Search ${(pages.data || []).length.toLocaleString('en-IN')} Pages by name or ID`}
            options={(pages.data || []).map((p) => ({ key: p.id, label: p.name, meta: [p.id, p.instagram_business_account?.username ? `@${p.instagram_business_account.username}` : ''].filter(Boolean).join(' · ') }))}
          />
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
      <Field
        label="Catalog media"
        hint={ad.media === 'SLIDESHOW'
          ? 'Each card plays the product\u2019s images from the catalog (main image plus additional images).'
          : ad.media === 'VIDEO'
            ? 'Products with a video in the catalog show it; others show their image.'
            : 'Each product shows its main catalog image.'}
      >
        <Segmented
          value={ad.media}
          onChange={(v) => setAd({ media: v })}
          options={[
            { key: 'IMAGES', label: 'Images' },
            { key: 'SLIDESHOW', label: 'Multiple images (slideshow)', disabled: ad.format === 'SINGLE', title: ad.format === 'SINGLE' ? 'Carousel only' : undefined },
            { key: 'VIDEO', label: 'Product videos' },
          ]}
        />
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
        <div className="preview-tabs">
          <span className="label" style={{ margin: 0 }}>Preview</span>
          <Segmented value={placement} onChange={(v) => { setPlacement(v); setIdx(0); }} options={[{ key: 'FEED', label: 'Feed' }, { key: 'STORIES', label: 'Stories' }, { key: 'REELS', label: 'Reels' }]} />
        </div>

        {products.loading ? <Loading text="Loading products…" /> : products.error ? <div className="notice warn">Preview unavailable: {products.error}</div> : !sample.length ? (
          <div className="note">Pick a product set to preview real products.</div>
        ) : placement === 'FEED' ? (
          <>
            <div className="preview-head">
              <div className="pg">{pageName.slice(0, 1)}</div>
              <div><div className="n">{pageName}</div><div className="s">Sponsored</div></div>
            </div>
            <div className="preview-text">{fill(ad.message, sample[0])}</div>
            <div className="cards-row">
              {sample.map((p) => {
                const imgs = imagesOf(p);
                return (
                  <div key={p.id} className={`p-card ${ad.format === 'SINGLE' ? 'single' : ''}`}>
                    <div className="img" style={{ backgroundImage: imageFor(p) ? `url("${imageFor(p)}")` : undefined }}>
                      {badge(p)}
                      {ad.media === 'SLIDESHOW' && imgs.length > 1 ? <div className="dots">{imgs.map((_, i) => <span key={i} className={i === tick % imgs.length ? 'on' : ''} />)}</div> : null}
                    </div>
                    <div className="body">
                      <div style={{ minWidth: 0 }}>
                        <div className="h">{fill(ad.headline, p) || p.name}</div>
                        <div className="ds">{fill(ad.description, p)}</div>
                      </div>
                      <span className="cta">{ctaLabel}</span>
                    </div>
                  </div>
                );
              })}
              {ad.format === 'CAROUSEL' && ad.endCard ? (
                <div className="p-card end">
                  <div className="img">See more at<br />{ad.link.replace(/^https?:\/\//, '') || 'your website'}</div>
                  <div className="body"><div className="h">{pageName}</div><span className="cta">{ctaLabel}</span></div>
                </div>
              ) : null}
            </div>
          </>
        ) : cur ? (
          <div className="phone" aria-label={`${placement === 'STORIES' ? 'Stories' : 'Reels'} preview`}>
            {placement === 'STORIES' ? (
              <>
                <div className="bg" style={{ backgroundImage: imageFor(cur) ? `url("${imageFor(cur)}")` : undefined }} />
                <div className="bars">{sample.map((p, i) => <span key={p.id} className={i <= idx ? 'on' : ''} />)}</div>
                <div className="who"><div className="pg">{pageName.slice(0, 1)}</div><div><div>{ig?.username ? ig.username : pageName}</div><div className="s">Sponsored</div></div></div>
                <div className="story-card">
                  <div className="img" style={{ backgroundImage: imageFor(cur) ? `url("${imageFor(cur)}")` : undefined, position: 'relative' }}>{badge(cur)}</div>
                  <div className="meta"><b>{fill(ad.headline, cur) || cur.name}</b>{fill(ad.description, cur)}</div>
                </div>
                <div className="cta-pill">{ctaLabel}</div>
              </>
            ) : (
              <>
                <div className="reel-img" style={{ backgroundImage: imageFor(cur) ? `url("${imageFor(cur)}")` : undefined }} />
                <div className="reel-shade" />
                {badge(cur)}
                <div className="rail"><Heart size={18} /><MessageCircle size={18} /><Send size={18} /></div>
                <div className="reel-text"><b>{ig?.username ? ig.username : pageName} · Sponsored</b>{fill(ad.message, cur).slice(0, 110)}</div>
                <div className="reel-cta"><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fill(ad.headline, cur) || cur.name}</span><b>{ctaLabel}</b></div>
              </>
            )}
            {sample.length > 1 ? (
              <>
                <button type="button" className="nav" style={{ left: 6 }} aria-label="Previous product" onClick={() => setIdx((i) => Math.max(0, i - 1))}><ChevronLeft size={14} /></button>
                <button type="button" className="nav" style={{ right: 6 }} aria-label="Next product" onClick={() => setIdx((i) => Math.min(sample.length - 1, i + 1))}><ChevronRight size={14} /></button>
              </>
            ) : null}
          </div>
        ) : null}
        <p className="hint">
          {placement === 'FEED' ? 'Facebook and Instagram feed.' : placement === 'STORIES' ? 'Stories: catalog images are shown 1:1 inside the story frame.' : 'Reels: product images fill the frame; Meta may crop them.'}
          {' '}Preview uses {sample.length || 'no'} {sample.length === 1 ? 'product' : 'products'} from the selected set. Meta picks the products per shopper when the ad runs.
        </p>
      </div>
    </div>
  );
}
