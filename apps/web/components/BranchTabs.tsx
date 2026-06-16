'use client';

import type { DynamicBranch } from '@/hooks/useBranches';

interface Props {
  branches: DynamicBranch[];
  activeId: string;
  loading: boolean;
  onChange: (branch: DynamicBranch) => void;
}

export default function BranchTabs({ branches, activeId, loading, onChange }: Props) {
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
          {branches.map((branch) => {
            const isActive = branch.id === activeId;
            return (
              <button
                key={branch.id}
                onClick={() => onChange(branch)}
                className={[
                  'flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-150',
                  isActive
                    ? 'border-[#0A6BA8] text-[#0A6BA8]'
                    : 'border-transparent text-[#64748B] hover:text-[#0F172A] hover:border-[#CBD5E1]',
                ].join(' ')}
              >
                {branch.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
