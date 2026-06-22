import Image from 'next/image';
import Link from 'next/link';
import type { SessionUser } from '@crm/types';
import UserMenu from './UserMenu';
import HamburgerButton from './HamburgerButton';
import NotificationBell from '@/components/layout/NotificationBell';

interface Props {
  user: SessionUser;
}

export default function DashboardNavbar({ user }: Props) {
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-[#E2E8F0] bg-white">
      <div className="flex h-14 items-center gap-2 px-2 sm:gap-4 sm:px-5">
        <HamburgerButton />
        <Link
          href="/dashboard/leads"
          className="shrink-0"
          aria-label="FitClass dashboard home"
        >
          <Image
            src="/fitclass-logo-white.webp"
            alt="FitClass"
            width={220}
            height={50}
            priority
            className="h-9 w-auto object-contain sm:h-10"
          />
        </Link>
        <div className="hidden h-5 w-px shrink-0 bg-[#E2E8F0] sm:block" />
        <span className="hidden text-sm font-bold tracking-tight text-[#0F172A] sm:block">
          Workspace
        </span>
        <div className="flex-1" />
        <NotificationBell />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
