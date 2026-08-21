import { Elysia, t } from 'elysia';

import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../../middleware/auth';
import { reportsService } from './service';

export const reportRoutes = new Elysia({ prefix: '/reports' }).guard({}, (route) =>
  route.derive(authMiddleware).group('', (group) =>
    group
      // Generate or retrieve a cached report for a session
      .post(
        '/',
        async ({ userId, body }) => {
          const report = await reportsService.getOrGenerate(body.sessionId, userId, body.format);
          return { success: true, data: report };
        },
        {
          body: t.Object({
            sessionId: t.String(),
            format: t.Union([t.Literal('MD'), t.Literal('CSV'), t.Literal('PDF')]),
          }),
        }
      )
      // List reports for a session
      .get(
        '/:sessionId',
        async ({ userId, params }) => {
          const reports = await prisma.report.findMany({
            where: { sessionId: params.sessionId, session: { agentId: userId } },
            orderBy: { generatedAt: 'desc' },
          });
          return { success: true, data: reports };
        },
        {
          params: t.Object({ sessionId: t.String() }),
        }
      )
  )
);
