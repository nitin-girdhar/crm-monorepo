'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser, UserRole } from '@crm/types';
import Modal from './Modal';
import RoleSelector from './RoleSelector';
import ResetPasswordModal from './ResetPasswordModal';
import UserPicker from '@/components/common/UserPicker';

const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{9}$/;

interface Props {
  open: boolean;
  onClose: () => void;
  user: SessionUser;
  currentUserId: string;
  actorRank: number;
  users: SessionUser[];
}

export default function EditUserModal({ open, onClose, user, currentUserId, actorRank, users }: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(user.first_name ?? '');
  const [middleName, setMiddleName] = useState(user.middle_name ?? '');
  const [lastName, setLastName] = useState(user.last_name ?? '');
  const [mobile, setMobile] = useState(user.mobile ?? '');
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>(user.role);
  const [managerId, setManagerId] = useState(user.manager_id ?? '');
  const [forcePasswordChange, setForcePasswordChange] = useState(user.force_password_change);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    setFirstName(user.first_name ?? '');
    setMiddleName(user.middle_name ?? '');
    setLastName(user.last_name ?? '');
    setMobile(user.mobile ?? '');
    setMobileError(null);
    setRole(user.role);
    setManagerId(user.manager_id ?? '');
    setForcePasswordChange(user.force_password_change);
  }, [user]);

  const isSelf = user.id === currentUserId;
  const canSetPassword = actorRank >= 4 && !isSelf;

  const handleClose = () => {
    if (pending) return;
    setError(null);
    onClose();
    router.refresh();
  };

  const submitPatch = async (patch: Record<string, unknown>) => {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? 'Failed to update user.');
        return false;
      }
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      return false;
    } finally {
      setPending(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mobile && !PHONE_RE.test(mobile)) {
      setMobileError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setMobileError(null);
    const patch: Record<string, unknown> = {};
    if (firstName !== (user.first_name ?? '')) patch.firstName = firstName;
    if (middleName !== (user.middle_name ?? '')) patch.middleName = middleName || null;
    if (lastName !== (user.last_name ?? '')) patch.lastName = lastName || null;
    if (mobile !== (user.mobile ?? '')) patch.mobile = mobile || null;
    if (role !== user.role) patch.roleName = role;
    const newManagerId = managerId || null;
    if (newManagerId !== (user.manager_id ?? null)) patch.managerId = newManagerId;
    if (forcePasswordChange !== user.force_password_change) patch.forcePasswordChange = forcePasswordChange;
    if (Object.keys(patch).length === 0) {
      handleClose();
      return;
    }
    const ok = await submitPatch(patch);
    if (ok) handleClose();
  };

  const handleToggleActive = async () => {
    const ok = await submitPatch({ isActive: !user.is_active });
    if (ok) handleClose();
  };

  const locked = pending;

  return (
    <>
      <Modal open={open} onClose={handleClose} title={`Edit ${user.name || user.email}`} locked={locked}>
        <form onSubmit={handleSave} className="flex flex-col gap-4" noValidate>
          {error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="eu-first-name" className="text-xs font-semibold text-[#0F172A]">First name</label>
              <input
                id="eu-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={locked}
                className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20 disabled:cursor-not-allowed disabled:bg-[#F8FAFC]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="eu-last-name" className="text-xs font-semibold text-[#0F172A]">Last name</label>
              <input
                id="eu-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={locked}
                className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20 disabled:cursor-not-allowed disabled:bg-[#F8FAFC]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="eu-middle-name" className="text-xs font-semibold text-[#0F172A]">Middle name</label>
              <input
                id="eu-middle-name"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                disabled={locked}
                className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20 disabled:cursor-not-allowed disabled:bg-[#F8FAFC]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="eu-mobile" className="text-xs font-semibold text-[#0F172A]">Mobile</label>
              <input
                id="eu-mobile"
                type="tel"
                value={mobile}
                onChange={(e) => { setMobile(e.target.value); setMobileError(null); }}
                disabled={locked}
                placeholder="+91 98XXXXXXXX"
                className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20 disabled:cursor-not-allowed disabled:bg-[#F8FAFC]"
              />
              {mobileError && <p className="text-[11px] text-red-600">{mobileError}</p>}
            </div>
          </div>

          <RoleSelector id="eu-role" value={role} onChange={setRole} actorRank={actorRank} disabled={locked || isSelf} />
          {isSelf && (
            <p className="-mt-2 text-[11px] text-[#64748B]">You can&apos;t change your own role.</p>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#0F172A]">Manager</label>
            <UserPicker
              value={managerId}
              onChange={setManagerId}
              users={users.filter((u) => u.is_active && u.id !== user.id)}
              disabled={locked}
              allowEmpty
              emptyLabel="— None —"
              placeholder="— None —"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-[#0F172A]">
            <input
              type="checkbox"
              checked={forcePasswordChange}
              onChange={(e) => setForcePasswordChange(e.target.checked)}
              disabled={locked}
              className="h-4 w-4 rounded border-[#E2E8F0] text-[#0b6cbf] focus:ring-[#0b6cbf]/20"
            />
            <span>Require password change on next login</span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div className="flex gap-2">
              {canSetPassword && (
                <button type="button" onClick={() => setResetOpen(true)} disabled={locked}
                  className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60">
                  Set password
                </button>
              )}
              {!isSelf && (
                user.is_active ? (
                  <button type="button" onClick={handleToggleActive} disabled={locked}
                    className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60">
                    Deactivate
                  </button>
                ) : (
                  <button type="button" onClick={handleToggleActive} disabled={locked}
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60">
                    Reactivate
                  </button>
                )
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleClose} disabled={locked}
                className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60">
                Cancel
              </button>
              <button type="submit" disabled={locked} aria-busy={pending}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0b6cbf] px-3 py-2 text-xs font-semibold text-white hover:bg-[#095699] disabled:cursor-not-allowed disabled:opacity-70">
                {pending && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                )}
                Save changes
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {canSetPassword && (
        <ResetPasswordModal
          open={resetOpen}
          onClose={() => setResetOpen(false)}
          userId={user.id}
          email={user.email}
        />
      )}
    </>
  );
}
