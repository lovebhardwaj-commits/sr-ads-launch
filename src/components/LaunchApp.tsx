'use client';
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/client-api';
import { defaultForm } from '@/lib/form';
import { useAsync } from '@/lib/hooks';
import type { AdAccount, FormState, LaunchResult } from '@/lib/types';
import AdFirstWorkspace from './AdFirstWorkspace';
import LegalLinks from './LegalLinks';
import ResultView from './ResultView';
import { Loading, SearchSelect } from './ui';

/** Meta account_status codes; active (1) shows nothing. */
const ACCOUNT_STATUS: Record<number, string> = { 2: 'Disabled', 3: 'Unsettled', 7: 'Pending review', 8: 'Pending settlement', 9: 'In grace period', 100: 'Pending closure', 101: 'Closed' };

const freshForm = (): FormState => { const f = defaultForm(); return { ...f, ad: { ...f.ad, adFirst: true } }; };

/** Launch Ads: pick an ad account, then create an ad and choose where it runs. */
export default function LaunchApp({ declined }: { declined: string[] }) {
  const accounts = useAsync<AdAccount[]>('accounts', () => apiGet('adaccounts'));
  const [accountId, setAccountId] = useState('');
  const [form, setForm] = useState<FormState>(freshForm);
  const [result, setResult] = useState<LaunchResult | null>(null);

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

  const changeAccount = (id: string) => {
    if (id === accountId) return;
    setAccountId(id);
    try { localStorage.setItem('sr-ad-account', id); } catch { /* ignore */ }
    setForm(freshForm());
    setResult(null);
  };
  const again = () => { setForm(freshForm()); setResult(null); window.scrollTo({ top: 0 }); };

  return (
    <div className="content wide">
      <div className="page-top">
        <div>
          <h1 className="page-title">Launch Ads</h1>
          <p className="page-sub">Create an ad, choose where it runs, and launch it to Meta.</p>
        </div>
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

      {!account ? null : result ? (
        <ResultView result={result} account={account} onAgain={again} />
      ) : (
        <AdFirstWorkspace key={account.id} account={account} form={form} setForm={setForm} onDone={(r) => { setResult(r); window.scrollTo({ top: 0 }); }} />
      )}

      <LegalLinks style={{ marginTop: 48 }} />
    </div>
  );
}
