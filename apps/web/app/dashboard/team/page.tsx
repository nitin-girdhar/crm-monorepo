import { redirect } from 'next/navigation';
import { RANKS } from '@crm/permissions';
import { getServerSession } from '@/src/lib/server-session';
import Placeholder from '@/components/dashboard/Placeholder';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const result = await getServerSession();
  if (!result) redirect('/login?callbackUrl=%2Fdashboard%2Fteam');
  if (result.session.rank < RANKS.MANAGER) redirect('/dashboard/leads');

  return (
    <Placeholder
      title="Team"
      body="Members of your org and their current pipeline load."
    />
  );
}
