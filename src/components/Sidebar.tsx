'use client';
import { LogOut, Moon, PanelLeft, Rocket, Sun, Terminal } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toggleLog, useApiLog } from '@/lib/api-log';
import './shell.css';

/** Fastrr Ads wordmark: speed lines + italic "fastrr" with "Ads" below. */
function Logo({ compact }: { compact: boolean }) {
  if (compact) return <div className="logo" aria-label="Fastrr Ads">f</div>;
  return (
    <div className="wordmark" aria-label="Fastrr Ads">
      <div className="wm-row">
        <span className="wm-lines" aria-hidden><i /><i /></span>
        <span className="wm-name">fastrr</span>
      </div>
      <span className="wm-sub">Ads</span>
    </div>
  );
}

/**
 * App shell matching Fastrr Ads: sidebar with the logo and a single "Launch Ads" item,
 * top bar with breadcrumb and actions. `user` is absent on the login screen.
 */
export default function AppShell({ user, children }: { user?: { name: string; picture?: string }; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const log = useApiLog();
  const errors = log.groups.filter((g) => !g.ok || g.calls.some((c) => !c.ok)).length;

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    try { setCollapsed(localStorage.getItem('sr-side') === 'collapsed'); } catch { /* ignore */ }
  }, []);

  const flipTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('sr-theme', next); } catch { /* storage unavailable */ }
  };
  const flipSide = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('sr-side', next ? 'collapsed' : 'open'); } catch { /* ignore */ }
  };

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <aside className="side" aria-label="Main">
        <div className="side-top">
          <Logo compact={collapsed} />
          <button type="button" className="side-toggle" onClick={flipSide} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand' : 'Collapse'}>
            <PanelLeft size={18} strokeWidth={1.7} />
          </button>
        </div>
        <nav className="side-nav">
          <div className="side-section">Create</div>
          <a className="side-item" aria-current="page" href="/launch" title="Launch Ads">
            <Rocket size={19} strokeWidth={1.7} />
            <span>Launch Ads</span>
          </a>
        </nav>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="crumbs"><span>Fastrr Ads</span><span className="sep">/</span><span className="here">Launch Ads</span></div>
          <div className="top-actions">
            {user ? (
              <button type="button" className="icon-btn" onClick={toggleLog} aria-pressed={log.open} aria-label="API log" title="API log" style={{ position: 'relative' }}>
                <Terminal size={18} strokeWidth={1.7} />
                {errors ? <span className="nav-dot" aria-label={`${errors} with errors`} /> : null}
              </button>
            ) : null}
            <button type="button" className="icon-btn" onClick={flipTheme} aria-label="Switch theme" title="Switch theme">
              {theme === 'dark' ? <Sun size={18} strokeWidth={1.7} /> : <Moon size={18} strokeWidth={1.7} />}
            </button>
            {user ? (
              <>
                <span className="who" title={user.name}>
                  {user.picture ? <img className="avatar" src={user.picture} alt="" /> : <span className="avatar">{user.name.slice(0, 1)}</span>}
                </span>
                <form action="/api/auth/logout" method="post" style={{ display: 'contents' }}>
                  <button className="icon-btn" type="submit" aria-label="Log out" title="Log out"><LogOut size={18} strokeWidth={1.7} /></button>
                </form>
              </>
            ) : null}
          </div>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
