import { redirect } from 'next/navigation';
import { getServerSession } from '@/src/lib/server-session';
import LeadsHistoryShell from '@/components/leads-history/LeadsHistoryShell';

export const dynamic = 'force-dynamic';

export default async function LeadsHistoryPage() {
  const result = await getServerSession();
  if (!result) redirect('/login?callbackUrl=%2Fdashboard%2Fleads-history');
  return <LeadsHistoryShell actor={result.session} />;
}
