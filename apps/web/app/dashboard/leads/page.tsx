import { redirect } from 'next/navigation';
import { getServerSession } from '@/src/lib/server-session';
import LeadDashboardShell from '@/components/dashboard/LeadDashboardShell';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const result = await getServerSession();
  if (!result) redirect('/login?callbackUrl=%2Fdashboard%2Fleads');
  return <LeadDashboardShell actor={result.session} />;
}
