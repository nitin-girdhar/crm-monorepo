import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { RoleTxContext } from '@crm/db';
import type { CreateUserInput, UpdateUserInput, ResetPasswordInput } from '@crm/validation';
import { NotFoundError, ConflictError } from '../../../lib/errors.js';
import { logActivity } from '../../../lib/activity-logger.js';
import { config } from '../../../config/index.js';
import * as repo from './users.repository.js';
import type { UpdateUserFields } from './users.repository.js';

function generateTemporaryPassword(): string {
  return randomBytes(16).toString('base64url');
}

export async function listUsers(ctx: RoleTxContext, page: number, pageSize: number) {
  return repo.listUsers(ctx, page, pageSize);
}

export async function getUserById(ctx: RoleTxContext, targetUserId: string) {
  const user = await repo.getUserById(ctx, targetUserId);
  if (!user) throw new NotFoundError('User not found');
  return user;
}

export async function getAssignableUsers(ctx: RoleTxContext, actorRank: number) {
  return repo.getAssignableUsers(ctx, actorRank);
}

export async function getAssignmentWeights(ctx: RoleTxContext) {
  return repo.getAssignmentWeights(ctx);
}

export async function updateAssignmentWeights(
  ctx: RoleTxContext,
  weights: Array<{ user_id: string; weight: number }>,
) {
  await repo.updateAssignmentWeights(ctx, weights);
  await logActivity({ action_type: 'assignment_weights_updated', performed_by: ctx.user_id });
}

export async function getTeamMembers(ctx: RoleTxContext) {
  return repo.getTeamMembers(ctx);
}

export async function getOrgChart(ctx: RoleTxContext) {
  return repo.getOrgChart(ctx);
}

export async function createUser(ctx: RoleTxContext, data: CreateUserInput) {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, config.bcryptRounds);

  try {
    const result = await repo.createUser(ctx, {
      first_name: data.first_name,
      ...(data.middle_name !== undefined ? { middle_name: data.middle_name } : {}),
      ...(data.last_name !== undefined ? { last_name: data.last_name } : {}),
      email: data.email,
      ...(data.mobile !== undefined ? { mobile: data.mobile } : {}),
      role_name: data.role_name,
      ...(data.manager_id !== undefined ? { manager_id: data.manager_id } : {}),
      ...(data.force_password_change !== undefined ? { force_password_change: data.force_password_change } : {}),
      password_hash: passwordHash,
    });

    await logActivity({
      action_type: 'user_created',
      performed_by: ctx.user_id,
      subject_user_id: result.id,
      new_value: { email: data.email, role: data.role_name },
    });

    return { id: result.id, email: data.email, temporary_password: temporaryPassword };
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('unique') || msg.includes('uq_users')) {
      throw new ConflictError('A user with this email already exists.');
    }
    throw err;
  }
}

export async function updateUser(ctx: RoleTxContext, targetUserId: string, data: UpdateUserInput) {
  const beforeUser = await repo.getUserByIdAsService(targetUserId);

  const fields: UpdateUserFields = {};
  if (data.first_name !== undefined)            fields.first_name = data.first_name;
  if (data.last_name !== undefined)             fields.last_name = data.last_name;
  if (data.middle_name !== undefined)           fields.middle_name = data.middle_name;
  if (data.email !== undefined)                 fields.email = data.email;
  if (data.mobile !== undefined)                fields.mobile = data.mobile;
  if (data.is_active !== undefined)             fields.is_active = data.is_active;
  if (data.force_password_change !== undefined) fields.force_password_change = data.force_password_change;
  if (data.manager_id !== undefined)            fields.manager_id = data.manager_id;

  if (data.role_name !== undefined) {
    const roleRow = await repo.resolveRoleByName(data.role_name);
    if (!roleRow) throw new NotFoundError(`Role not found: ${data.role_name}`);
    fields.role_id = roleRow.id;
    fields.password_changed_at = new Date();
  }

  const targetOrgId = (beforeUser as Record<string, unknown> | null)?.['org_id'] as string ?? ctx.org_id;
  const targetCtx: RoleTxContext = { ...ctx, org_id: targetOrgId };
  const result = await repo.updateUser(targetCtx, targetUserId, fields);
  if (!result) throw new NotFoundError('User not found');

  if (fields.role_id !== undefined) {
    await repo.syncOrgMappingRole(targetCtx, targetUserId, fields.role_id);
  }

  if (data.is_active === false) {
    await logActivity({ action_type: 'user_deactivated', performed_by: ctx.user_id, subject_user_id: targetUserId });
  } else if (data.is_active === true) {
    await logActivity({ action_type: 'user_reactivated', performed_by: ctx.user_id, subject_user_id: targetUserId });
  } else if (data.role_name !== undefined) {
    await logActivity({
      action_type: 'role_changed',
      performed_by: ctx.user_id,
      subject_user_id: targetUserId,
      old_value: { role: (beforeUser as Record<string, unknown> | null)?.['role_name'] },
      new_value: { role: data.role_name },
    });
  } else {
    await logActivity({ action_type: 'user_updated', performed_by: ctx.user_id, subject_user_id: targetUserId });
  }
}

export async function deleteUser(ctx: RoleTxContext, targetUserId: string) {
  await repo.softDeleteUser(ctx, targetUserId);
  await logActivity({ action_type: 'user_deactivated', performed_by: ctx.user_id, subject_user_id: targetUserId });
}

export async function resetPassword(
  ctx: RoleTxContext,
  targetUserId: string,
  data: ResetPasswordInput,
) {
  const temporaryPassword = data.new_password ?? generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, config.bcryptRounds);

  const result = await repo.adminResetPassword(ctx, targetUserId, passwordHash);
  if (!result) throw new NotFoundError('User not found');

  await logActivity({
    action_type: 'password_reset_by_admin',
    performed_by: ctx.user_id,
    subject_user_id: targetUserId,
  });

  return { temporary_password: temporaryPassword };
}
