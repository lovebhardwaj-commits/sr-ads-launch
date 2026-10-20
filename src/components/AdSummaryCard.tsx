'use client';
import { apiGet } from '@/lib/client-api';
import { useAsync } from '@/lib/hooks';
import type { FormState } from '@/lib/types';

/** Compact view of the ad built first, with Edit. */
export default function AdSummaryCard({ form, onEdit }: { form: FormState; onEdit: () => void }) {
  const ad = form.ad;
  const isCatalog = ad.kind === 'CATALOG';
  const setId = form.adset.productSetId;
  const sets = useAsync<{ id: string; name: string; product_count?: number }[]>(isCatalog && form.campaign.catalogId ? `sets-${form.campaign.catalogId}` : null, () => apiGet('product-sets', { catalog: form.campaign.catalogId }));
  const products = useAsync<{ id: string; image_url?: string }[]>(isCatalog && setId ? `products-${setId}` : null, () => apiGet('products', { set: setId }));
  const set = sets.data?.find((s) => s.id === setId);
  const thumbs = isCatalog ? (products.data || []).map((p) => p.image_url).filter(Boolean).slice(0, 4) as string[] : [ad.imageUrl || ad.postPreview].filter(Boolean);

  const line = isCatalog
    ? ['Catalog ad', ad.format === 'CAROUSEL' ? 'Carousel' : 'Single image or video', set ? `${set.name}${set.product_count != null ? ` (${set.product_count} products)` : ''}` : 'Product set chosen', ad.destination === 'APP_WEB' ? 'App, website as backup' : 'Website'].join(' · ')
    : ad.kind === 'POST' ? `Existing ${ad.postSource === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} post` : ['Image ad', ad.imageName, ad.link.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ');

  return (
    <div className="card ad-summary">
      <div className="thumbs">{thumbs.length ? thumbs.map((src, i) => <img key={i} src={src} alt="" />) : <span className="thumb-empty" />}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="strong">{ad.name || 'Your ad'}</div>
        <div className="hint" style={{ marginTop: 2 }}>{line}</div>
        {ad.message ? <div className="hint" style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{ad.message}”</div> : null}
      </div>
      <button type="button" className="btn-ghost" onClick={onEdit}>Edit ad</button>
    </div>
  );
}
