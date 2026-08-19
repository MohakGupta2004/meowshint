import type { z } from 'zod';

import type { createUser, listQuery, updateUser, userId } from './schema';

export type CreateUserInput = z.infer<typeof createUser>;
export type UpdateUserInput = z.infer<typeof updateUser>;
export type UserIdParam = z.infer<typeof userId>;
export type ListQuery = z.infer<typeof listQuery>;
