'use client';
import { apiGet } from '@/lib/client-api';
import { useAsync } from '@/lib/hooks';
import { Loading } from './ui';

/** Thumbnails of the products a catalog ad will draw from. */
export default function ProductStrip({ setId, label }: { setId: string; label?: string }) {
  const products = useAsync<{ id: string; name: string; image_url?: string; price?: string }[]>(setId ? `products-${setId}` : null, () => apiGet('products', { set: setId }));
  if (!setId) return null;
  if (products.loading) return <Loading text="Loading products…" />;
  const list = (products.data || []).filter((p) => p.image_url);
  if (!list.length) return <div className="hint">No product images to show.</div>;
  return (
    <div className="product-strip">
      {label ? <div className="label" style={{ marginBottom: 6 }}>{label}</div> : null}
      <div className="strip">
        {list.slice(0, 10).map((p) => (
          <figure key={p.id} title={`${p.name}${p.price ? ` · ${p.price}` : ''}`}>
            <img src={p.image_url} alt={p.name} />
            <figcaption>{p.name}</figcaption>
          </figure>
        ))}
        {(products.data || []).length > 10 ? <div className="more">+{(products.data || []).length - 10}{(products.data || []).length >= 25 ? '+' : ''} more</div> : null}
      </div>
    </div>
  );
}
