import { redirect } from 'next/navigation';
import ApiLogPanel from '@/components/ApiLogPanel';
import LaunchApp from '@/components/LaunchApp';
import AppShell from '@/components/Sidebar';
import { missingEnv } from '@/lib/config';
import { getSession } from '@/lib/session';
import '../api-log.css';
import '../launch.css';

export const dynamic = 'force-dynamic';

export default async function LaunchPage() {
  if (missingEnv().length) redirect('/login?error=config');
  const session = await getSession();
  if (!session) redirect('/login');
  return (
    <AppShell user={{ name: session.name, picture: session.picture }}>
      <LaunchApp declined={session.declined || []} />
      <ApiLogPanel />
    </AppShell>
  );
}
