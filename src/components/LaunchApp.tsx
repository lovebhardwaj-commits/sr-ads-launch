'use client';
import { ChevronLeft, List, Rocket } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/client-api';
import { goalsFor } from '@/lib/constants';
import { defaultForm, formFromAdset } from '@/lib/form';
import { useAsync } from '@/lib/hooks';
import type { AdAccount, AdsetLite, CampaignLite, FormState, LaunchResult, Mode } from '@/lib/types';
import AdFirstWorkspace from './AdFirstWorkspace';
import LaunchForm from './LaunchForm';
import { AdsetPicker, CampaignPicker } from './Pickers';
import LegalLinks from './LegalLinks';
import ResultView from './ResultView';
import { Loading, SearchSelect } from './ui';

type View =
  | { kind: 'home' }
  | { kind: 'pick-campaign'; next: 'EXISTING' | 'DUP_EXISTING' }
  | { kind: 'pick-adset' }
  | { kind: 'dup-dest' }
  | { kind: 'ad-first' }
  | { kind: 'form'; mode: Mode }
  | { kind: 'done'; result: LaunchResult; mode: Mode };

/** Meta account_status codes; active (1) shows nothing. */
const ACCOUNT_STATUS: Record<number, string> = { 2: 'Disabled', 3: 'Unsettled', 7: 'Pending review', 8: 'Pending settlement', 9: 'In grace period', 100: 'Pending closure', 101: 'Closed' };

const CHOICES = [
  { key: 'new', title: 'New Campaign + Ad Set', text: 'Create a brand-new campaign and its first ad set together.' },
  { key: 'existing', title: 'New Ad Set → Existing Campaign', text: 'Add a new ad set to a campaign you already have.' },
  { key: 'duplicate', title: 'Duplicate an Ad Set', text: "Copy an existing ad set's settings into a new or existing campaign." },
  { key: 'adfirst', title: 'Start with an Ad', text: 'Create a catalog, image or post ad first, then choose where it runs.' },
] as const;

const adFirstForm = (): FormState => { const f = defaultForm(); return { ...f, ad: { ...f.ad, adFirst: true } }; };

export default function LaunchApp({ declined }: { declined: string[] }) {
  const accounts = useAsync<AdAccount[]>('accounts', () => apiGet('adaccounts'));
  const [accountId, setAccountId] = useState('');
  const [view, setView] = useState<View>({ kind: 'home' });
  const [form, setForm] = useState<FormState>(defaultForm());
  const [campaign, setCampaign] = useState<CampaignLite | undefined>();
  const [source, setSource] = useState<AdsetLite | undefined>();
  const [fabOpen, setFabOpen] = useState(false);
  // The ad from the last "Start with an Ad" launch, so it can be added to another ad set.
  const [lastAd, setLastAd] = useState<{ form: FormState; adsetName: string } | null>(null);
  const [repeatOf, setRepeatOf] = useState('');
  const [wsKey, setWsKey] = useState(0);

  // Facebook appends "#_=_" to the URL after login; remove it.
  useEffect(() => {
    if (window.location.hash === '#_=_') window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  // Restore the last ad account, else take the first.
  useEffect(() => {
    if (!accounts.data?.length || accountId) return;
    let saved = '';
    try { saved = localStorage.getItem('sr-ad-account') || ''; } catch { /* ignore */ }
    setAccountId((accounts.data.find((a) => a.id === saved) || accounts.data[0]).id);
  }, [accounts.data, accountId]);

  const account = useMemo(() => accounts.data?.find((a) => a.id === accountId), [accounts.data, accountId]);

  const startOver = () => {
    setLastAd(null); setRepeatOf('');
    setView({ kind: 'home' });
    setForm(defaultForm());
    setCampaign(undefined);
    setSource(undefined);
    window.scrollTo({ top: 0 });
  };

  const changeAccount = (id: string) => {
    if (id === accountId) return;
    setAccountId(id);
    try { localStorage.setItem('sr-ad-account', id); } catch { /* ignore */ }
    startOver();
  };

  const choose = (key: string) => {
    setFabOpen(false);
    setCampaign(undefined);
    setSource(undefined);
    if (key === 'new') { setForm(defaultForm()); setView({ kind: 'form', mode: 'NEW' }); }
    if (key === 'existing') { setForm(defaultForm()); setView({ kind: 'pick-campaign', next: 'EXISTING' }); }
    if (key === 'duplicate') { setView({ kind: 'pick-adset' }); }
    if (key === 'adfirst') { setForm(adFirstForm()); setRepeatOf(''); setView({ kind: 'ad-first' }); }
    window.scrollTo({ top: 0 });
  };

  const adsCount = source?.ads?.summary?.total_count ?? 0;
  const done = (result: LaunchResult, mode: Mode) => { setView({ kind: 'done', result, mode }); window.scrollTo({ top: 0 }); };
  const doneAdFirst = (result: LaunchResult, mode: Mode) => {
    setLastAd(result.ok ? { form, adsetName: result.created.adset?.name || '' } : null);
    done(result, mode);
  };
  // Same ad, fresh destination: keep the ad (and its catalog and product set), reset campaign and ad set settings.
  const repeatAd = () => {
    if (!lastAd) return;
    const f = adFirstForm();
    const prev = lastAd.form;
    setForm({
      ...f,
      campaign: { ...f.campaign, catalogEnabled: prev.campaign.catalogEnabled, catalogId: prev.campaign.catalogId, objective: prev.campaign.catalogEnabled ? 'OUTCOME_SALES' : f.campaign.objective },
      adset: { ...f.adset, productSetId: prev.adset.productSetId },
      ad: { ...prev.ad, adFirst: true },
    });
    setRepeatOf(lastAd.adsetName || 'the last ad set');
    setWsKey((k) => k + 1);
    setView({ kind: 'ad-first' });
    window.scrollTo({ top: 0 });
  };

  return (
    <div className={`content ${view.kind === 'ad-first' ? 'wide' : ''}`}>
      <div className={`page-top ${view.kind === 'ad-first' ? 'compact' : ''}`}>
        {view.kind === 'ad-first' ? (
          <div>
            <h1 className="page-title">Start with an Ad</h1>
            <p className="page-sub">Create the ad, choose where it runs, launch.</p>
          </div>
        ) : (
          <div>
            <h1 className="page-title">Launch</h1>
            <p className="page-sub">Launch campaigns, ad sets and ads straight to Facebook — pre-filled for Indian D2C, every field editable.</p>
          </div>
        )}
        <div className="account-pick">
          <span className="label">Ad account</span>
          {accounts.loading ? <Loading text="Loading ad accounts…" /> : accounts.error ? (
            <div className="notice bad">{accounts.error}</div>
          ) : accounts.data && !accounts.data.length ? (
            <div className="notice warn">No ad accounts found for this Facebook login. Ask a business admin to give you access to one.</div>
          ) : (
            <SearchSelect
              value={accountId}
              onChange={changeAccount}
              ariaLabel="Ad account"
              noun="ad accounts"
              placeholder="Select an ad account..."
              searchPlaceholder={`Search ${(accounts.data || []).length.toLocaleString('en-IN')} ad accounts by name or ID`}
              options={(accounts.data || []).map((a) => ({ key: a.id, label: a.name || a.account_id, meta: [a.account_id, ACCOUNT_STATUS[a.account_status ?? 1]].filter(Boolean).join(' · ') }))}
            />
          )}
        </div>
      </div>

      {declined.length ? (
        <div className="notice warn" style={{ marginBottom: 16 }}>
          You didn&apos;t allow <b>{declined.join(', ')}</b>. Some options won&apos;t load. <a href="/api/auth/login">Log in again</a> to grant them.
        </div>
      ) : null}

      {!account ? null : view.kind === 'home' ? (
        <div className="choices">
          {CHOICES.map((c) => (
            <button key={c.key} type="button" className="choice" onClick={() => choose(c.key)}>
              <Rocket size={22} strokeWidth={1.8} />
              <h3>{c.title}</h3>
              <p>{c.text}</p>
            </button>
          ))}
        </div>
      ) : view.kind === 'pick-campaign' ? (
        <>
          <button type="button" className="back" onClick={startOver}><ChevronLeft size={13} /> Start over</button>
          <CampaignPicker
            account={account}
            title={view.next === 'EXISTING' ? 'Pick a campaign for the new ad set' : 'Pick the campaign the duplicate goes into'}
            source={view.next === 'DUP_EXISTING' ? source : undefined}
            onPick={(c) => {
              setCampaign(c);
              // Existing campaign with a campaign budget keeps it; otherwise the ad set needs its own.
              const level = c.daily_budget || c.lifetime_budget ? 'CAMPAIGN' : 'ADSET';
              setForm((f) => ({ ...f, budget: { ...f.budget, level } }));
              if (view.next === 'EXISTING') {
                const goal = goalsFor(c.objective, !!c.promoted_object?.product_catalog_id)[0].key;
                setForm((f) => ({ ...f, adset: { ...f.adset, goal } }));
              }
              setView({ kind: 'form', mode: view.next });
              window.scrollTo({ top: 0 });
            }}
          />
        </>
      ) : view.kind === 'pick-adset' ? (
        <>
          <button type="button" className="back" onClick={startOver}><ChevronLeft size={13} /> Start over</button>
          <AdsetPicker
            account={account}
            onCreateNew={() => choose('new')}
            onPick={(a) => {
              setSource(a);
              setForm(formFromAdset(a, account.currency));
              setView({ kind: 'dup-dest' });
            }}
          />
        </>
      ) : view.kind === 'dup-dest' && source ? (
        <>
          <button type="button" className="back" onClick={startOver}><ChevronLeft size={13} /> Start over</button>
          <h2 className="section-title" style={{ marginTop: 0 }}>Where should the duplicate go?</h2>
          <p className="note">
            Duplicating “{source.name}” (currently in <span className="strong">{source.campaign?.name}</span>) — its settings are pre-filled below, still fully editable.
            {' '}{adsCount === 1 ? 'Its 1 ad' : `Its ${adsCount} ads`} will be duplicated into the new ad set too, using the same creative.
          </p>
          <div className="choices" style={{ marginTop: 14 }}>
            <button type="button" className="choice" onClick={() => setView({ kind: 'form', mode: 'DUP_NEW' })}>
              <Rocket size={22} strokeWidth={1.8} />
              <h3>New Campaign</h3>
              <p>Create a new campaign for this ad set.</p>
            </button>
            <button type="button" className="choice" onClick={() => setView({ kind: 'pick-campaign', next: 'DUP_EXISTING' })}>
              <Rocket size={22} strokeWidth={1.8} />
              <h3>Existing Campaign</h3>
              <p>Attach it to a campaign you already have.</p>
            </button>
          </div>
        </>
      ) : view.kind === 'ad-first' ? (
        <AdFirstWorkspace key={`${account.id}-${wsKey}`} account={account} form={form} setForm={setForm} onDone={doneAdFirst} onExit={startOver} repeatOf={repeatOf || undefined} />
      ) : view.kind === 'form' ? (
        <LaunchForm
          key={`${view.mode}-${campaign?.id || ''}-${source?.id || ''}`}
          mode={view.mode}
          account={account}
          form={form}
          setForm={setForm}
          campaign={campaign}
          source={source}
          onStartOver={startOver}
          onDone={(result) => done(result, view.mode)}
        />
      ) : view.kind === 'done' ? (
        <ResultView result={view.result} account={account} onAgain={startOver} onRepeat={lastAd && view.result.ok ? repeatAd : undefined} />
      ) : null}

      <LegalLinks style={{ marginTop: 48 }} />

      {view.kind !== 'ad-first' ? (
        <>
          <button type="button" className="fab" aria-label="Launch options" onClick={() => setFabOpen(!fabOpen)}>
            <List size={20} strokeWidth={1.8} />
          </button>
          {fabOpen ? (
            <div className="fab-menu" role="menu">
              {CHOICES.map((c) => <button key={c.key} type="button" role="menuitem" onClick={() => choose(c.key)}>{c.title}</button>)}
              <button type="button" role="menuitem" onClick={() => { setFabOpen(false); startOver(); }}>Back to start</button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
