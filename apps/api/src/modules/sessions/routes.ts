import { Elysia, t } from 'elysia';

import { authMiddleware } from '../../middleware/auth';
import { sessionsService } from './service';

// Platform enum validation — matches Prisma Platform enum exactly
const PlatformEnum = t.Union([
  t.Literal('WEB_SEARCH'),
  t.Literal('INSTAGRAM'),
  t.Literal('LINKEDIN'),
  t.Literal('GITHUB'),
  t.Literal('TWITCH'),
  t.Literal('YOUTUBE'),
  t.Literal('TIKTOK'),
  t.Literal('PINTEREST'),
  t.Literal('LINKTREE'),
]);

export const sessionRoutes = new Elysia({ prefix: '/sessions' }).guard({}, (route) =>
  route.derive(authMiddleware).group('', (group) =>
    group
      // List all sessions for the authenticated agent
      .get(
        '/',
        async ({ userId, query }) => {
          const { page = 1, limit = 20 } = query;
          const result = await sessionsService.list(userId, { page, limit });
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
      // Create a new OSINT session — starts in DISAMBIGUATION
      .post(
        '/',
        async ({ userId, body }) => {
          const session = await sessionsService.create(userId, body);
          return { success: true, data: session };
        },
        {
          body: t.Object({
            query: t.String({ minLength: 1, maxLength: 500 }),
            queryContext: t.Optional(t.String({ maxLength: 1000 })),
            platforms: t.Array(PlatformEnum, { minItems: 1 }),
          }),
        }
      )
      // Get a single session with candidates and tasks
      .get(
        '/:id',
        async ({ userId, params }) => {
          const session = await sessionsService.get(params.id, userId);
          return { success: true, data: session };
        },
        {
          params: t.Object({ id: t.String() }),
        }
      )
      // Select a candidate — transitions DISAMBIGUATION → ENRICHING
      .post(
        '/:id/select-candidate',
        async ({ userId, params, body }) => {
          const session = await sessionsService.selectCandidate(
            params.id,
            body.candidateId,
            userId
          );
          return { success: true, data: session };
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({ candidateId: t.String() }),
        }
      )
      // Close and lock a session permanently
      .post(
        '/:id/close',
        async ({ userId, params }) => {
          const session = await sessionsService.close(params.id, userId);
          return { success: true, data: session };
        },
        {
          params: t.Object({ id: t.String() }),
        }
      )
  )
);
