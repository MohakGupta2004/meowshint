import { Elysia, t } from 'elysia';

import { authMiddleware } from '../../middleware/auth';
import { creditsService } from './service';

export const creditRoutes = new Elysia({ prefix: '/credits' }).guard({}, (route) =>
  route.derive(authMiddleware).group('', (group) =>
    group
      // Get current credit balance
      .get('/', async ({ userId }) => {
        const balance = await creditsService.getBalance(userId);
        return { success: true, data: { balance } };
      })
      // Get credit transaction history
      .get(
        '/history',
        async ({ userId, query }) => {
          const { page = 1, limit = 20 } = query;
          const result = await creditsService.getHistory(userId, { page, limit });
          return {
            success: true,
            data: result.items,
            meta: {
              page: result.page,
              limit: result.limit,
              total: result.total,
              totalPages: result.totalPages,
            },
          };
        },
        {
          query: t.Object({
            page: t.Optional(t.Number({ minimum: 1 })),
            limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
          }),
        }
      )
  )
);
