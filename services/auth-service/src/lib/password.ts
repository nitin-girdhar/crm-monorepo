import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.bcryptRounds);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export function generateTemporaryPassword(): string {
  const bytes = crypto.randomBytes(12);
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = '';
  for (const b of bytes) {
    password += charset[b % charset.length];
  }
  return `${password}@1`;
}

