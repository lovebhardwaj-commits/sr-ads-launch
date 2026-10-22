'use client';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { AiStatus, CopyLanguage, CopyOption, CopyResult } from '@/lib/ai-types';
import { apiGet, apiPost, errorText } from '@/lib/client-api';
import { CTAS } from '@/lib/constants';
import { useAsync } from '@/lib/hooks';
import type { FormState } from '@/lib/types';
import { Segmented, TextInput } from './ui';
import './aicopy.css';

const ANGLE: Record<string, string> = { benefit: 'Benefit-led', scene: 'A moment', offer: 'Offer or reassurance' };
const LANGS: { key: CopyLanguage; label: string }[] = [{ key: 'EN', label: 'English' }, { key: 'HINGLISH', label: 'Hinglish' }, { key: 'HI', label: 'हिन्दी' }];

/** Image and video ads: the AI looks at the creative and writes three options for the text fields. */
export default function AiCopy({ ad, accountId, pageName, setAd }: {
  ad: FormState['ad'];
  accountId: string;
  pageName: string;
  setAd: (p: Partial<FormState['ad']>) => void;
}) {
  const status = useAsync<AiStatus>('ai-status', () => apiGet('ai-status'));
  const [language, setLanguage] = useState<CopyLanguage>('EN');
  const [offer, setOffer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ r: CopyResult; media: string } | null>(null);
  const [undo, setUndo] = useState<{ message: string; headline: string; description: string } | null>(null);

  if (!status.data?.enabled) return null; // not set up on this server

  const isVideo = !!ad.videoId || !!ad.videoStatus;
  const media = (isVideo ? ad.videoId : ad.imageHash) || '';
  const ready = isVideo ? ad.videoStatus === 'ready' : !!ad.imageHash;
  const waiting = isVideo
    ? ad.videoStatus === 'uploading' ? 'Available once the video has uploaded and Meta has processed it.'
      : ad.videoStatus === 'processing' ? 'Available once Meta finishes processing the video.'
        : ad.videoStatus === 'error' ? '' : 'Add an image or video first.'
    : 'Add an image or video first.';

  const write = async () => {
    setBusy(true); setError(''); setUndo(null);
    try {
      const r = await apiPost<CopyResult>('ai-copy', {
        accountId, kind: isVideo ? 'VIDEO' : 'IMAGE', imageHash: ad.imageHash, videoId: isVideo ? ad.videoId : '',
        pageName, link: ad.link, cta: CTAS.find((c) => c.key === ad.cta)?.label || '', language, offer,
        draft: { message: ad.message, headline: ad.headline, description: ad.description },
      });
      setResult({ r, media });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const use = (o: CopyOption) => {
    setUndo({ message: ad.message, headline: ad.headline, description: ad.description });
    setAd({ message: o.primary_text, headline: o.headline, description: o.description });
  };

  const shown = result && result.media === media ? result.r : null; // options belong to the creative they were written for
  const hears = shown ? /omni/i.test(shown.model) : false;
  const saw = !shown ? '' : shown.saw === 'VIDEO'
    ? (hears ? 'Watched and listened to the whole video.' : 'Watched the whole video and read the text on screen. This model doesn’t hear audio, so spoken words aren’t used.')
    : shown.saw === 'COVER' ? (shown.note || 'Based on the video’s cover image only.') : 'Looked at the image.';

  return (
    <div className="ai-box">
      <div className="ai-head">
        <Sparkles size={15} />
        <span className="strong">Write the text with AI</span>
        <span className="hint">{isVideo ? 'Watches your whole video and writes three options.' : 'Looks at your image and writes three options.'}</span>
      </div>
      <Segmented value={language} onChange={setLanguage} options={LANGS} />
      <TextInput value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={300} aria-label="Offer or details to mention" placeholder="Offer or details to mention (optional), e.g. Flat 20% off till Sunday" />
      <div className="ai-actions">
        <button type="button" className="btn-ghost" disabled={!ready || busy} onClick={write}>
          {busy ? <><span className="spinner" />{isVideo ? 'Watching the video and writing…' : 'Looking at the image and writing…'}</> : shown ? 'Write again' : 'Write three options'}
        </button>
        {!ready && waiting ? <span className="hint" style={{ margin: 0 }}>{waiting}</span> : null}
        {busy && isVideo ? <span className="hint" style={{ margin: 0 }}>Longer videos can take up to a minute.</span> : null}
      </div>
      {error ? <div className="notice bad" style={{ marginTop: 10 }}>{error}</div> : null}

      {shown ? (
        <>
          <div className="hint ai-saw">{saw}</div>
          <div className="ai-opts">
            {shown.options.map((o, i) => (
              <div className="ai-opt" key={i}>
                <div className="ai-angle">{ANGLE[o.angle] || 'Option'}</div>
                <div className="ai-primary">{o.primary_text}</div>
                <div className="ai-line"><span className="strong">Headline</span> · {o.headline}</div>
                {o.description ? <div className="ai-line"><span className="strong">Description</span> · {o.description}</div> : null}
                {o.warnings.map((w, k) => <div className="ai-warn" key={k}>{w}</div>)}
                <button type="button" className="btn-ghost" onClick={() => use(o)}>Use this text</button>
              </div>
            ))}
          </div>
          {undo ? (
            <div className="ai-used">
              Text filled in below.
              <button type="button" className="btn-link" onClick={() => { setAd(undo); setUndo(null); }}>Undo</button>
            </div>
          ) : null}
          <div className="hint" style={{ marginTop: 10 }}>The creative and these details are sent to an AI service ({shown.model}) to write the text. AI can get facts wrong: check every claim before you launch.</div>
        </>
      ) : null}
    </div>
  );
}
