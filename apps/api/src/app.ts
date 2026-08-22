import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';

import { env } from './config/env';
import { errorHandler, notFound } from './middleware/error';
import { authRoutes } from './modules/auth/routes';
import { creditRoutes } from './modules/credits/routes';
import { healthRoutes } from './modules/health/routes';
import { reportRoutes } from './modules/reports/routes';
import { sessionRoutes } from './modules/sessions/routes';
import { userRoutes } from './modules/users/routes';

export function createApp() {
  const app = new Elysia()
    .use(
      cors({
        origin: corsOrigin(),
        credentials: true,
      })
    )
    .onError(errorHandler)
    .onRequest(({ request }) => {
      // Add request ID for logging
      const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
      (request as any).id = requestId;
    });

  // Health routes (no rate limiting)
  app.use(healthRoutes);

  // Auth routes
  app.use(authRoutes);

  // User routes (with auth middleware)
  app.use(userRoutes);

  // OSINT session routes
  app.use(sessionRoutes);

  // Credit ledger routes
  app.use(creditRoutes);

  // Report generation routes
  app.use(reportRoutes);

  return app;
}

function corsOrigin(): true | string[] {
  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
  return origins.includes('*') ? true : origins;
}
