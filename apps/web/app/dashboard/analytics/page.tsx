import { redirect } from 'next/navigation';
import { RANKS } from '@crm/permissions';
import { getServerSession } from '@/src/lib/server-session';
import AnalyticsClient from '@/components/analytics/AnalyticsClient';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const result = await getServerSession();
  if (!result) redirect('/login?callbackUrl=%2Fdashboard%2Fanalytics');
  const { session } = result;
  if (session.rank < RANKS.ADMIN) redirect('/dashboard/leads');
  return <AnalyticsClient actorRank={session.rank} orgId={session.org_id} />;
}
