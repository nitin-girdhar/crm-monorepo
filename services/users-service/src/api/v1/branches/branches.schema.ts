import { z } from 'zod';

export const getBranchesQuerySchema = z.object({
  cityIds:    z.string().optional().transform((v: string | undefined) => v ? v.split(',').map(Number).filter(Boolean) : []),
  stateIds:   z.string().optional().transform((v: string | undefined) => v ? v.split(',').map(Number).filter(Boolean) : []),
  countryIds: z.string().optional().transform((v: string | undefined) => v ? v.split(',').map(Number).filter(Boolean) : []),
});

export type GetBranchesQuery = z.infer<typeof getBranchesQuerySchema>;
