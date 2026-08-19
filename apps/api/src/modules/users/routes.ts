import { Elysia } from 'elysia';
import { t } from 'elysia';
import { get } from 'http';

import { authMiddleware } from '../../middleware/auth';
import { usersService } from './service';
import type { CreateUserInput, ListQuery, UpdateUserInput } from './types';

export const userRoutes = new Elysia({ prefix: '/users' })
  .get(
    '/',
    async ({ query }) => {
      const { page = 1, limit = 20 } = query as ListQuery;
      const { items, ...meta } = await usersService.list({ page, limit });
      return { success: true, data: items, meta };
    },
    {
      query: t.Object({
        page: t.Optional(t.Number({ minimum: 1 })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
    }
  )
  .guard(
    {
      beforeHandle({ cookie, headers }) {},
    },
    (protectedRoute) =>
      protectedRoute
        .derive(authMiddleware)
        .get(
          '/:id',
          async ({ params }) => {
            const id = Number(params.id);
            const user = await usersService.get(id);
            return { success: true, data: user };
          },
          {
            params: t.Object({
              id: t.Number({ minimum: 1 }),
            }),
          }
        )
        .post(
          '/',
          async ({ body }) => {
            const result = await usersService.create(body as CreateUserInput);
            return { success: true, data: result };
          },
          {
            body: t.Object({
              email: t.String({ format: 'email' }),
              name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
            }),
          }
        )
        .patch(
          '/:id',
          async ({ params, body }) => {
            const id = Number(params.id);
            const result = await usersService.update(id, body as UpdateUserInput);
            return { success: true, data: result };
          },
          {
            params: t.Object({
              id: t.Number({ minimum: 1 }),
            }),
            body: t.Object({
              email: t.Optional(t.String({ format: 'email' })),
              name: t.Optional(t.Nullable(t.String({ minLength: 1, maxLength: 120 }))),
            }),
          }
        )
        .delete(
          '/:id',
          async ({ params }) => {
            const id = Number(params.id);
            await usersService.remove(id);
            return new Response(null, { status: 204 });
          },
          {
            params: t.Object({
              id: t.Number({ minimum: 1 }),
            }),
          }
        )
  );
