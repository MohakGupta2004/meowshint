import { z } from 'zod';

export const createUser = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(120).optional(),
});

export const updateUser = z
  .object({
    email: z.string().trim().email().optional(),
    name: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'At least one field must be provided');

export const userId = z.object({ id: z.coerce.number().int().positive() });

export const listQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
