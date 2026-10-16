'use client';
import { ImagePlus, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, errorText } from '@/lib/client-api';
import { CTAS, URL_DYNAMIC_PARAMS, UTM_FIELDS, buildUrlTags } from '@/lib/constants';
import { useAsync } from '@/lib/hooks';
import type { FormState } from '@/lib/types';
import { Field, Loading, SearchSelect, Segmented, Select, TextInput, Toggle } from './ui';

interface Page { id: string; name: string; website?: string; instagram_business_account?: { id: string; username?: string } }
interface Post { id: string; text: string; image: string; type: string; time: string; link?: string }

const MAX_BYTES = 3 * 1024 * 1024;

function pageWebsite(p?: Page): string {
  const first = (p?.website || '').split(/[\s,]+/).find(Boolean);
  if (!first) return '';
  return /^https?:\/\//i.test(first) ? first : `https://${first}`;
}

/** Normal (non-catalog) ad: upload an image, or promote an existing Facebook / Instagram post. */
export default function StandardAdSection({ form, setAd, accountId, allowSkip }: {
  form: FormState;
  setAd: (p: Partial<FormState['ad']>) => void;
  accountId: string;
  allowSkip: boolean;
}) {
  const ad = form.ad;
  const pages = useAsync<Page[]>('pages', () => apiGet('pages'));
  const page = pages.data?.find((p) => p.id === ad.pageId);
  const ig = page?.instagram_business_account;
  const [linkEdited, setLinkEdited] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const posts = useAsync<Post[]>(
    ad.kind === 'POST' && ad.pageId && (ad.postSource === 'FACEBOOK' || ig?.id) ? `posts-${ad.pageId}-${ad.postSource}` : null,
    () => apiGet('posts', { page: ad.pageId, source: ad.postSource, ig: ig?.id }),
  );

  // Product tokens only work in catalog ads; clear them if the text came from a catalog setup.
  useEffect(() => {
    const strip = (t: string) => (t.includes('{{product.') ? '' : t);
    if ([ad.message, ad.headline, ad.description].some((t) => t.includes('{{product.'))) {
      setAd({ message: strip(ad.message), headline: strip(ad.headline), description: strip(ad.description) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setAd({ instagramUserId: ig?.id || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.pageId, ig?.id]);

  useEffect(() => {
    if (!page || linkEdited) return;
    setAd({ link: pageWebsite(page) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.pageId, page?.website]);

  const onFile = async (file?: File) => {
    if (!file) return;
    setUploadError('');
    if (!/^image\/(jpeg|png)$/.test(file.type)) { setUploadError('Use a JPG or PNG image.'); return; }
    if (file.size > MAX_BYTES) { setUploadError('Image must be under 3 MB.'); return; }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read the file')); r.readAsDataURL(file); });
      const bytes = dataUrl.split(',')[1];
      const img = await apiPost<{ hash: string; url: string }>('upload-image', { account: accountId, name: file.name, bytes });
      setAd({ imageHash: img.hash, imageUrl: dataUrl, imageName: file.name });
    } catch (e) {
      setUploadError(errorText(e));
    } finally {
      setUploading(false);
    }
  };

  const urlTags = buildUrlTags(ad.urlTags || {});
  const ctaLabel = CTAS.find((c) => c.key === ad.cta)?.label || 'Shop now';
  const pageName = page?.name || 'Select a Page';

  return (
    <div className="card">
      <Field label="Ad setup">
        <Segmented
          value={ad.kind === 'CATALOG' ? 'UPLOAD' : ad.kind}
          onChange={(v) => setAd({ kind: v })}
          options={[
            { key: 'UPLOAD', label: 'Create ad' },
            { key: 'POST', label: 'Use existing post' },
            ...(allowSkip ? [{ key: 'NONE' as const, label: 'Skip, add ads later' }] : []),
          ]}
        />
      </Field>

      {ad.kind === 'NONE' ? (
        <p className="hint">The ad set is launched without ads. Add ads to it later in Ads Manager or Create Ads.</p>
      ) : (
        <>
          <Field label="Facebook Page">
            {pages.loading ? <Loading text="Loading Pages…" /> : pages.error ? <div className="notice bad">{pages.error}</div> : (
              <SearchSelect
                value={ad.pageId}
                onChange={(v) => setAd({ pageId: v, postId: '', postPreview: '' })}
                ariaLabel="Facebook Page"
                noun="Pages"
                placeholder="Select a Page..."
                searchPlaceholder={`Search ${(pages.data || []).length.toLocaleString('en-IN')} Pages by name or ID`}
                options={(pages.data || []).map((p) => ({ key: p.id, label: p.name, meta: [p.id, p.instagram_business_account?.username ? `@${p.instagram_business_account.username}` : ''].filter(Boolean).join(' · ') }))}
              />
            )}
          </Field>
          {page && ad.kind === 'UPLOAD' ? (
            <Field>
              {ig ? (
                <Toggle checked={!!ad.instagramUserId} onChange={(v) => setAd({ instagramUserId: v ? ig.id : '' })} label={<>Run on Instagram as <span className="strong">@{ig.username || ig.id}</span></>} />
              ) : (
                <p className="hint" style={{ margin: 0 }}>This Page has no connected Instagram account, so Instagram placements use the Page name.</p>
              )}
            </Field>
          ) : null}
          <Field label="Ad name">
            <TextInput value={ad.name} onChange={(e) => setAd({ name: e.target.value })} placeholder={`e.g. ${form.adset.name || 'Ad'} - ${ad.kind === 'POST' ? 'Existing post' : 'Image'}`} />
          </Field>

          {ad.kind === 'UPLOAD' ? (
            <>
              <Field label="Image" hint="JPG or PNG, under 3 MB. 1080×1080 (1:1) works across Feed, Stories and Reels.">
                <label className="upload">
                  <input type="file" accept="image/jpeg,image/png" onChange={(e) => onFile(e.target.files?.[0])} style={{ display: 'none' }} />
                  {ad.imageUrl ? <img src={ad.imageUrl} alt="" /> : <ImagePlus size={22} strokeWidth={1.6} />}
                  <span>{uploading ? 'Uploading to Meta…' : ad.imageName ? `${ad.imageName} · change` : 'Choose an image'}</span>
                </label>
                {uploadError ? <div className="notice bad" style={{ marginTop: 8 }}>{uploadError}</div> : null}
              </Field>
              <Field label="Primary text">
                <textarea className="input" value={ad.message} onChange={(e) => setAd({ message: e.target.value })} rows={3} placeholder="Tell people what your ad is about" />
              </Field>
              <div className="row field">
                <Field label="Headline"><TextInput value={ad.headline} onChange={(e) => setAd({ headline: e.target.value })} placeholder="Write a short headline" /></Field>
                <Field label="Description"><TextInput value={ad.description} onChange={(e) => setAd({ description: e.target.value })} placeholder="Optional" /></Field>
              </div>
              <div className="row field">
                <Field label="Call to action"><Select value={ad.cta} onChange={(v) => setAd({ cta: v })} options={CTAS} /></Field>
                <Field label="Website URL" hint={page && !linkEdited ? (pageWebsite(page) ? 'From the Page\u2019s website.' : 'This Page has no website listed; enter one.') : undefined}>
                  <TextInput value={ad.link} onChange={(e) => { setLinkEdited(true); setAd({ link: e.target.value }); }} placeholder="https://yourstore.com" />
                </Field>
              </div>
            </>
          ) : (
            <>
              <Field label="Post from">
                <Segmented
                  value={ad.postSource}
                  onChange={(v) => setAd({ postSource: v, postId: '', postPreview: '' })}
                  options={[{ key: 'FACEBOOK', label: 'Facebook Page' }, { key: 'INSTAGRAM', label: 'Instagram account', disabled: !ig, title: !ig ? 'This Page has no connected Instagram account' : undefined }]}
                />
              </Field>
              <Field label="Select post" hint="The post keeps its own text, media and engagement. Its call to action can't be changed.">
                {!ad.pageId ? <div className="note">Select a Page first.</div> : posts.loading ? <Loading text="Loading posts…" /> : posts.error ? <div className="notice bad">{posts.error}</div> : !posts.data?.length ? (
                  <div className="note">No recent posts found.</div>
                ) : (
                  <div className="post-grid" role="radiogroup" aria-label="Posts">
                    {posts.data.map((p) => (
                      <button key={p.id} type="button" role="radio" aria-checked={ad.postId === p.id} className={`post ${ad.postId === p.id ? 'on' : ''}`} onClick={() => setAd({ postId: p.id, postPreview: p.image })}>
                        <span className="thumb" style={{ backgroundImage: p.image ? `url("${p.image}")` : undefined }}>{p.type === 'VIDEO' || p.type === 'REELS' ? <Play size={14} fill="#fff" color="#fff" /> : null}</span>
                        <span className="cap">{p.text ? p.text.slice(0, 70) : 'No caption'}</span>
                        <span className="when">{p.time ? new Date(p.time).toLocaleDateString('en-IN') : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Field>
            </>
          )}

          <h3 className="label strong" style={{ marginTop: 22, fontSize: 13 }}>Tracking</h3>
          <div className="row field" style={{ marginTop: 6 }}>
            {UTM_FIELDS.slice(0, 2).map((f) => (
              <Field key={f.key} label={f.label}><TextInput value={ad.urlTags[f.key]} placeholder={f.placeholder} onChange={(e) => setAd({ urlTags: { ...ad.urlTags, [f.key]: e.target.value } })} /></Field>
            ))}
          </div>
          <div className="row field">
            {UTM_FIELDS.slice(2, 4).map((f) => (
              <Field key={f.key} label={f.label}><TextInput value={ad.urlTags[f.key]} placeholder={f.placeholder} onChange={(e) => setAd({ urlTags: { ...ad.urlTags, [f.key]: e.target.value } })} /></Field>
            ))}
          </div>
          <Field label={UTM_FIELDS[4].label}>
            <TextInput value={ad.urlTags.term} placeholder={UTM_FIELDS[4].placeholder} onChange={(e) => setAd({ urlTags: { ...ad.urlTags, term: e.target.value } })} />
          </Field>
          <Field label="URL parameters" hint={<>Added to the ad&apos;s link. Dynamic parameters Meta fills per ad: {URL_DYNAMIC_PARAMS.join(', ')}</>}>
            <TextInput readOnly value={urlTags || 'No URL parameters'} aria-label="URL parameters" />
          </Field>

          {ad.kind === 'UPLOAD' ? (
            <div className="preview" aria-label="Ad preview">
              <div className="preview-head">
                <div className="pg">{pageName.slice(0, 1)}</div>
                <div><div className="n">{pageName}</div><div className="s">Sponsored</div></div>
              </div>
              <div className="preview-text">{ad.message || 'Primary text'}</div>
              <div className="p-card single">
                <div className="img" style={{ backgroundImage: ad.imageUrl ? `url("${ad.imageUrl}")` : undefined, backgroundSize: 'cover' }} />
                <div className="body">
                  <div style={{ minWidth: 0 }}>
                    <div className="ds">{ad.link.replace(/^https?:\/\//, '').split('/')[0].toUpperCase() || 'YOURSTORE.COM'}</div>
                    <div className="h">{ad.headline || 'Headline'}</div>
                  </div>
                  <span className="cta">{ctaLabel}</span>
                </div>
              </div>
              <p className="hint">Feed preview. Meta adapts the image for Stories and Reels.</p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
