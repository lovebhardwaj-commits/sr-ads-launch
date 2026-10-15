'use client';
import { Database, FileText, History, LineChart, List, LogOut, Moon, PanelLeft, Rocket, Sun, Target, Terminal } from 'lucide-react';
import { toggleLog, useApiLog } from '@/lib/api-log';
import { useEffect, useState } from 'react';

const NAV = [
  { icon: FileText, label: 'Reports' },
  { icon: Target, label: 'Audiences' },
  { icon: Rocket, label: 'Launch', current: true },
  { icon: LineChart, label: 'Meta Insights' },
  { icon: History, label: 'Launch history' },
  { icon: Database, label: 'Catalogs' },
  { icon: List, label: 'Campaigns' },
];

export default function Sidebar({ name, picture }: { name: string; picture?: string }) {
  const [wide, setWide] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const log = useApiLog();
  const errors = log.groups.filter((g) => !g.ok || g.calls.some((c) => !c.ok)).length;

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }, []);

  const flipTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('sr-theme', next); } catch { /* storage unavailable */ }
  };

  return (
    <aside className={`sidebar ${wide ? 'wide' : ''}`} aria-label="Main">
      <div className="logo" aria-hidden>f</div>
      <button className="nav-btn" type="button" onClick={() => setWide(!wide)} aria-label={wide ? 'Collapse sidebar' : 'Expand sidebar'} title={wide ? 'Collapse' : 'Expand'}>
        <PanelLeft size={20} strokeWidth={1.6} />
        <span className="nav-label">Collapse</span>
      </button>
      <div className="nav-gap" />
      {NAV.map(({ icon: Icon, label, current }) => (
        <button
          key={label}
          type="button"
          className="nav-btn"
          aria-current={current ? 'page' : undefined}
          aria-disabled={current ? undefined : true}
          title={current ? label : `${label} (in Shiprocket Ads)`}
          aria-label={label}
        >
          <Icon size={20} strokeWidth={1.6} />
          <span className="nav-label">{label}</span>
        </button>
      ))}
      <button type="button" className="nav-btn" onClick={toggleLog} aria-pressed={log.open} aria-current={log.open ? 'page' : undefined} aria-label="API log" title="API log" style={{ position: 'relative' }}>
        <Terminal size={20} strokeWidth={1.6} />
        <span className="nav-label">API log</span>
        {errors ? <span className="nav-dot" aria-label={`${errors} with errors`} /> : null}
      </button>
      <div className="nav-spacer" />
      <div className="nav-rule" />
      <div className="nav-btn" title={name} aria-label={name}>
        {picture ? <img className="avatar" src={picture} alt="" /> : <span className="avatar">{name.slice(0, 1)}</span>}
        <span className="nav-label">{name}</span>
      </div>
      <button className="nav-btn" type="button" onClick={flipTheme} aria-label="Switch theme" title="Switch theme">
        {theme === 'dark' ? <Sun size={20} strokeWidth={1.6} /> : <Moon size={20} strokeWidth={1.6} />}
        <span className="nav-label">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
      </button>
      <form action="/api/auth/logout" method="post" style={{ display: 'contents' }}>
        <button className="nav-btn" type="submit" aria-label="Log out" title="Log out">
          <LogOut size={20} strokeWidth={1.6} />
          <span className="nav-label">Log out</span>
        </button>
      </form>
    </aside>
  );
}
