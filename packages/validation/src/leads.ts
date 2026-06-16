import { z } from 'zod';

export const createLeadSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  middle_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().regex(/^\+?[0-9]{7,15}$/, 'Invalid phone number').optional(),
  email: z.string().email('Invalid email address').optional(),
  city: z.string().max(100).optional(),
  address_line1: z.string().max(255).optional(),
  address_line2: z.string().max(255).optional(),
  pincode: z.string().regex(/^\d{4,10}$/, 'Invalid pincode').optional(),
  branch_id: z.string().uuid('Invalid branch_id').optional(),
  source_id: z.string().uuid('Invalid source_id').optional(),
  campaign_id: z.string().uuid('Invalid campaign_id').optional(),
  stage_id: z.string().uuid('Invalid stage_id').optional(),
  assigned_user_id: z.string().uuid('Invalid assigned_user_id').optional(),
  city_id: z.number().int().positive().optional(),
  state_id: z.number().int().positive().optional(),
  country_id: z.number().int().positive().optional(),
  raw_webhook_data: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
}).refine(
  (d) => Boolean(d.phone ?? d.email),
  { message: 'At least one of phone or email is required' },
);

export const updateLeadSchema = z.object({
  stage_id: z.string().uuid('Invalid stage_id').optional(),
  outcome_id: z.string().uuid('Invalid outcome_id').optional(),
  outcome_comment: z.string().max(2000).optional(),
  transition_note: z.string().max(1000).optional(),
  assigned_user_id: z.string().uuid('Invalid assigned_user_id').optional().nullable(),
  first_name: z.string().min(1).max(100).optional(),
  middle_name: z.string().max(100).optional().nullable(),
  last_name: z.string().max(100).optional(),
  phone: z.string().regex(/^\+?[0-9]{7,15}$/).optional(),
  email: z.string().email().optional(),
  city: z.string().max(100).optional(),
  city_id: z.number().int().positive().optional().nullable(),
  state_id: z.number().int().positive().optional().nullable(),
  country_id: z.number().int().positive().optional().nullable(),
  address_line1: z.string().max(255).optional(),
  address_line2: z.string().max(255).optional().nullable(),
  pincode: z.string().regex(/^\d{4,10}$/).optional(),
  branch_id: z.string().uuid().optional(),
  source_id: z.string().uuid().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  metadata: z.record(z.unknown()).optional(),
  note: z.string().max(5000).optional(),
}).refine(
  (d) => Object.keys(d).length > 0,
  { message: 'At least one field must be provided to update' },
);

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
