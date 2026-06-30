'use client';

import type { DynamicOrg } from '@/hooks/useOrgs';

interface Props {
  orgs: DynamicOrg[];
  activeId: string;
  loading: boolean;
  onChange: (org: DynamicOrg) => void;
}

export default function OrgTabs({ orgs, activeId, loading, onChange }: Props) {
  if (loading) {
    return (
      <div className="w-full border-b border-[#E2E8F0] bg-white px-4 sm:px-6 py-2">
        <div className="flex gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 w-20 rounded bg-[#F1F5F9] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full border-b border-[#E2E8F0] bg-white">
      <div
        className="overflow-x-auto overflow-y-hidden pb-0 tabs-scrollbar"
        style={{ WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth' }}
      >
        <div className="flex min-w-max whitespace-nowrap px-4 sm:px-6">
          {orgs.map((org) => {
            const isActive = org.id === activeId;
            return (
              <button
                key={org.id}
                onClick={() => onChange(org)}
                className={[
                  'flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-150',
                  isActive
                    ? 'border-[#0A6BA8] text-[#0A6BA8]'
                    : 'border-transparent text-[#64748B] hover:text-[#0F172A] hover:border-[#CBD5E1]',
                ].join(' ')}
              >
                {org.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
