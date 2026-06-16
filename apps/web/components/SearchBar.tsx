'use client';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function SearchBar({ value, onChange }: Props) {
  return (
    <div className="relative w-full sm:w-72">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] w-4 h-4 pointer-events-none"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
      </svg>
      <input
        type="text"
        placeholder="Search leads…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-9 pr-4 py-2.5 text-sm border border-[#E2E8F0] rounded-lg bg-white text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0A6BA8]/20 focus:border-[#0A6BA8] transition-colors hover:border-[#94A3B8]"
      />
    </div>
  );
}
