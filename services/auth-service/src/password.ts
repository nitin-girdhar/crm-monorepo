import bcrypt from 'bcryptjs';
import { config } from './config.js';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.bcryptRounds);
}

export async function comparePassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export function generateTemporaryPassword(): string {
  const upper = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0').toUpperCase();
  const lower = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0').toLowerCase();
  return `${upper}${lower}@1`;
}
