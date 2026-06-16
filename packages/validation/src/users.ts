import { z } from 'zod';

export const createUserSchema = z.object({
  first_name: z.string().min(1).max(50),
  middle_name: z.string().max(50).optional(),
  last_name: z.string().max(50).optional(),
  email: z.string().email(),
  mobile: z.string().max(20).optional(),
  role_name: z.string(),
  manager_id: z.string().uuid().optional(),
  force_password_change: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  first_name: z.string().min(1).max(50).optional(),
  middle_name: z.string().max(50).optional(),
  last_name: z.string().max(50).optional(),
  email: z.string().email().optional(),
  mobile: z.string().max(20).optional(),
  role_name: z.string().optional(),
  manager_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
  force_password_change: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  new_password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
