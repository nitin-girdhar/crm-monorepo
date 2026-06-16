'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  forced: boolean;
}

interface Rule {
  label: string;
  test: (v: string) => boolean;
}

const RULES: Rule[] = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'One lowercase letter',  test: (v) => /[a-z]/.test(v) },
  { label: 'One uppercase letter',  test: (v) => /[A-Z]/.test(v) },
  { label: 'One number',            test: (v) => /[0-9]/.test(v) },
];

function EyeToggle({ show, onToggle, disabled }: { show: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      tabIndex={-1}
      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-semibold text-[#64748B] hover:bg-[#F1F5F9] disabled:cursor-not-allowed"
    >
      {show ? 'Hide' : 'Show'}
    </button>
  );
}

export default function ChangePasswordForm({ forced }: Props) {
  const router = useRouter();
  const [current, setCurrent]       = useState('');
  const [next, setNext]             = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const allRulesPass = RULES.every((r) => r.test(next));
  const matches  = next.length > 0 && next === confirm;
  const differs  = next !== current;
  const canSubmit = current.length > 0 && allRulesPass && matches && differs && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next, confirm }),
        credentials: 'include',
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? 'Failed to change password.');
        setSubmitting(false);
        return;
      }
      setCurrent(''); setNext(''); setConfirm('');
      router.replace('/dashboard/leads');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm"
      noValidate
    >
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="cur-pw" className="text-xs font-semibold text-[#0F172A]">
          {forced ? 'Current (temporary) password' : 'Current password'}
        </label>
        <div className="relative">
          <input
            id="cur-pw"
            type={showCurrent ? 'text' : 'password'}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={submitting}
            autoComplete="current-password"
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 pr-16 text-sm text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20 disabled:bg-[#F8FAFC]"
          />
          <EyeToggle show={showCurrent} onToggle={() => setShowCurrent((s) => !s)} disabled={submitting} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-pw" className="text-xs font-semibold text-[#0F172A]">New password</label>
        <div className="relative">
          <input
            id="new-pw"
            type={showNew ? 'text' : 'password'}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            disabled={submitting}
            autoComplete="new-password"
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 pr-16 text-sm text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20 disabled:bg-[#F8FAFC]"
          />
          <EyeToggle show={showNew} onToggle={() => setShowNew((s) => !s)} disabled={submitting} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-pw" className="text-xs font-semibold text-[#0F172A]">Confirm new password</label>
        <div className="relative">
          <input
            id="confirm-pw"
            type={showConfirm ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={submitting}
            autoComplete="new-password"
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 pr-16 text-sm text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20 disabled:bg-[#F8FAFC]"
          />
          <EyeToggle show={showConfirm} onToggle={() => setShowConfirm((s) => !s)} disabled={submitting} />
        </div>
        {confirm.length > 0 && !matches && (
          <p className="text-xs text-red-600">Passwords do not match.</p>
        )}
        {next.length > 0 && !differs && (
          <p className="text-xs text-red-600">New password must differ from the current one.</p>
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {RULES.map((r) => {
          const ok = r.test(next);
          return (
            <li key={r.label} className={`flex items-center gap-1.5 text-[11px] ${ok ? 'text-emerald-600' : 'text-[#94A3B8]'}`}>
              <span aria-hidden>{ok ? '✓' : '○'}</span>
              {r.label}
            </li>
          );
        })}
      </ul>

      <button
        type="submit"
        disabled={!canSubmit}
        aria-busy={submitting}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b6cbf] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#095699] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
        )}
        Update password
      </button>
    </form>
  );
}
