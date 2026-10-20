'use client';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { apiGet } from '@/lib/client-api';
import { CATALOG_AD_TEXT, validateAd } from '@/lib/form';
import { useAsync } from '@/lib/hooks';
import type { AdAccount, FormState } from '@/lib/types';
import AdSection from './AdSection';
import CatalogPanel from './CatalogPanel';
import StandardAdSection from './StandardAdSection';
import { Field, Segmented } from './ui';

/** Reverse journey, step 1: build the ad (catalog or normal) before choosing where it goes. */
export default function AdFirstBuilder({ account, form, setForm, onNext, onStartOver }: {
  account: AdAccount;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onNext: () => void;
  onStartOver: () => void;
}) {
  const isCatalog = form.campaign.catalogEnabled;
  const catalogId = form.campaign.catalogId;
  const productSets = useAsync<{ id: string; name: string; product_count?: number }[]>(isCatalog && catalogId ? `sets-${catalogId}` : null, () => apiGet('product-sets', { catalog: catalogId }));

  // A product set that doesn't belong to the loaded catalog is cleared; nothing is picked automatically.
  useEffect(() => {
    const sets = productSets.data;
    if (sets?.length && form.adset.productSetId && !sets.some((s) => s.id === form.adset.productSetId)) setForm((f) => ({ ...f, adset: { ...f.adset, productSetId: '' } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSets.data]);

  const setType = (t: 'CATALOG' | 'NORMAL') => setForm((f) => ({
    ...f,
    campaign: { ...f.campaign, catalogEnabled: t === 'CATALOG', objective: t === 'CATALOG' ? 'OUTCOME_SALES' : f.campaign.objective },
    ad: {
      ...f.ad,
      kind: t === 'CATALOG' ? 'CATALOG' : 'UPLOAD',
      // Catalog ads start from the product-token template; normal ads start empty.
      ...(t === 'CATALOG' ? CATALOG_AD_TEXT : { message: '', headline: '', description: '' }),
    },
  }));
  const setAd = (p: Partial<FormState['ad']>) => setForm((f) => ({ ...f, ad: { ...f.ad, ...p } }));
  const missing = useMemo(() => validateAd(form, isCatalog, true), [form, isCatalog]);

  return (
    <>
      <button type="button" className="back" onClick={onStartOver}><ChevronLeft size={13} /> Start over</button>
      <h2 className="section-title" style={{ marginTop: 0 }}><span className="step-no">1</span> Build your ad</h2>
      <p className="note">Build the ad first. Next, add it to an existing ad set, or create a new ad set or campaign for it. Catalog ads can also go into Sales campaigns without a catalog.</p>

      <div className="card">
        <Field label="Ad type" hint={isCatalog ? 'Catalog ads show products from a catalog and run in Sales campaigns.' : 'Upload an image or promote an existing Facebook or Instagram post.'}>
          <Segmented value={isCatalog ? 'CATALOG' : 'NORMAL'} onChange={setType} options={[{ key: 'CATALOG', label: 'Catalog ad' }, { key: 'NORMAL', label: 'Normal ad' }]} />
        </Field>
      </div>

      {isCatalog ? (
        <>
          <h2 className="section-title">Catalog</h2>
          <CatalogPanel
            account={account}
            catalogId={catalogId}
            locked={false}
            onCatalog={(id) => setForm((f) => ({ ...f, campaign: { ...f.campaign, catalogId: id }, adset: { ...f.adset, productSetId: '', crossSellSourceSetId: '' } }))}
            productSets={productSets.data || []}
            productSetsLoading={productSets.loading}
            productSetsError={productSets.error}
            productSetId={form.adset.productSetId}
            onProductSet={(id) => setForm((f) => ({ ...f, adset: { ...f.adset, productSetId: id } }))}
            pixelId=""
            onReady={() => undefined}
            showHealth={false}
          />
          <h2 className="section-title">Ad</h2>
          <AdSection key="catalog" form={form} setAd={setAd} productSetId={form.adset.productSetId} catalogId={catalogId} />
        </>
      ) : (
        <>
          <h2 className="section-title">Ad</h2>
          <StandardAdSection key="normal" form={form} setAd={setAd} accountId={account.id} allowSkip={false} />
        </>
      )}

      <div className="launch-bar">
        <button type="button" className="btn-primary" disabled={missing.length > 0} onClick={onNext}>Done: choose where it goes</button>
        {missing.length ? <span className="missing">Still needed: {missing.map((m) => m.label).join(', ')}</span> : null}
      </div>
    </>
  );
}
