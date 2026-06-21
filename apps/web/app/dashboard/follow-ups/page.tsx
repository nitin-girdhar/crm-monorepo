import { redirect } from 'next/navigation';
import { getServerSession } from '@/src/lib/server-session';
import FollowUpsShell from '@/components/leads/FollowUpsShell';

export const dynamic = 'force-dynamic';

export default async function FollowUpsPage() {
  const result = await getServerSession();
  if (!result) redirect('/login?callbackUrl=%2Fdashboard%2Ffollow-ups');
  return <FollowUpsShell actor={result.session} />;
}
