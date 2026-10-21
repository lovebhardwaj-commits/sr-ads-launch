import { redirect } from 'next/navigation';
import ApiLogPanel from '@/components/ApiLogPanel';
import CatalogAdsApp from '@/components/CatalogAdsApp';
import AppShell from '@/components/Sidebar';
import { missingEnv } from '@/lib/config';
import { getSession } from '@/lib/session';
import '../api-log.css';
import '../launch.css';

export const dynamic = 'force-dynamic';

export default async function CatalogAdsPage() {
  if (missingEnv().length) redirect('/login?error=config');
  const session = await getSession();
  if (!session) redirect('/login');
  return (
    <AppShell section="catalog" user={{ name: session.name, picture: session.picture }}>
      <CatalogAdsApp declined={session.declined || []} />
      <ApiLogPanel />
    </AppShell>
  );
}
