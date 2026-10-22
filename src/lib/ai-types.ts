/** Shared by the server (writes the text) and the browser (shows it). */
export type CopyLanguage = 'EN' | 'HINGLISH' | 'HI';

export interface CopyRequest {
  accountId: string;
  kind: 'IMAGE' | 'VIDEO';
  /** The image, or the video's cover image (kept as a fallback when the video can't be opened) */
  imageHash: string;
  videoId: string;
  pageName: string;
  link: string;
  /** The call-to-action button's label, e.g. "Shop now" */
  cta: string;
  language: CopyLanguage;
  /** Offer or details the person wants mentioned. The only source of offers the AI may use. */
  offer: string;
  /** What is already written; the AI improves on it instead of ignoring it */
  draft: { message: string; headline: string; description: string };
}

export interface CopyOption {
  angle: string;
  primary_text: string;
  headline: string;
  description: string;
  /** Things in the text that Meta or ASCI often reject, or that need checking */
  warnings: string[];
}

export interface CopyResult {
  options: CopyOption[];
  /** What the AI actually looked at */
  saw: 'VIDEO' | 'IMAGE' | 'COVER';
  note?: string;
  model: string;
}

export interface AiStatus { enabled: boolean; model: string; maxVideoSeconds: number }

export const COPY_LIMITS = { primary: 300, headline: 40, description: 30 };
