import { redirect } from 'next/navigation';
import LegalLinks from '@/components/LegalLinks';
import AppShell from '@/components/Sidebar';
import { PERMISSIONS, getScopes, missingEnv } from '@/lib/config';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  config: 'The app is missing its Facebook settings. Add them in the Vercel dashboard and redeploy.',
  state: 'The login link expired or was opened in another browser. Start again.',
  expired: 'Your Facebook session expired. Log in again.',
  access_denied: 'Facebook login was cancelled.',
};

export default async function LoginPage({ searchParams }: { searchParams: { error?: string; missing?: string } }) {
  const configMissing = missingEnv();
  if (!configMissing.length && (await getSession())) redirect('/launch');
  const scopes = process.env.FACEBOOK_CONFIG_ID ? null : getScopes();
  const err = searchParams.error;
  const missing = searchParams.missing || configMissing.join(', ');

  return (
    <AppShell>
    <div className="login-in-shell">
      <div className="login-card">
        <h1 className="page-title" style={{ fontSize: 20 }}>Launch Ads</h1>
        <p className="page-sub" style={{ marginBottom: 24 }}>
          Launch campaigns, ad sets and catalog ads straight to Facebook, pre-filled for Indian D2C.
        </p>

        {err ? (
          <div className="notice bad" style={{ marginBottom: 16 }}>
            {ERRORS[err] || `Facebook login failed: ${err}`}
            {err === 'config' && missing ? <div style={{ marginTop: 6 }}>Missing: <b>{missing}</b></div> : null}
          </div>
        ) : configMissing.length ? (
          <div className="notice warn" style={{ marginBottom: 16 }}>
            Add <b>{configMissing.join(', ')}</b> in the Vercel dashboard before logging in.
          </div>
        ) : null}

        <a className="fb-btn" href="/api/auth/login">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="currentColor"><path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.62 23.1 24 18.1 24 12.07" /></svg>
          Continue with Facebook
        </a>

        <div className="card" style={{ marginTop: 22 }}>
          <div className="label" style={{ marginBottom: 12 }}>
            {scopes ? 'Facebook will ask you to allow:' : 'Permissions come from your Facebook Login for Business configuration.'}
          </div>
          {scopes ? (
            <ul className="perm-list">
              {scopes.map((s) => (
                <li key={s}><code>{s}</code><span>{PERMISSIONS.find((p) => p.scope === s)?.why || 'Requested by this app'}</span></li>
              ))}
            </ul>
          ) : null}
        </div>

        <p className="hint" style={{ marginTop: 16 }}>
          By continuing, you agree to Shiprocket&apos;s Terms &amp; Conditions and Privacy Policy.
        </p>
        <LegalLinks style={{ marginTop: 6 }} />
      </div>
    </div>
    </AppShell>
  );
}
