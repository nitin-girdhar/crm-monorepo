import { z } from 'zod';

export const listUsersQuerySchema = z.object({
  page:      z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(500).default(100),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
