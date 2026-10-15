import { redirect } from 'next/navigation';
import ApiLogPanel from '@/components/ApiLogPanel';
import LaunchApp from '@/components/LaunchApp';
import Sidebar from '@/components/Sidebar';
import { missingEnv } from '@/lib/config';
import { getSession } from '@/lib/session';
import '../api-log.css';

export const dynamic = 'force-dynamic';

export default async function LaunchPage() {
  if (missingEnv().length) redirect('/login?error=config');
  const session = await getSession();
  if (!session) redirect('/login');
  return (
    <div className="shell">
      <Sidebar name={session.name} picture={session.picture} />
      <main className="main">
        <LaunchApp declined={session.declined || []} />
      </main>
      <ApiLogPanel />
    </div>
  );
}
