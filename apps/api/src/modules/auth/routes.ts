import { Elysia } from 'elysia';
import { t } from 'elysia';

import { authService } from './service';
import type { ChangePasswordInput, LoginInput, RegisterInput } from './types';
import { clearAuthCookies, setAuthCookies, verifyAuth } from './utils';

export const authRoutes = new Elysia({ prefix: '/auth' })
  .post(
    '/register',
    async ({ body, cookie }) => {
      const input = body as RegisterInput;
      const result = await authService.register(input);
      setAuthCookies(cookie, result.accessToken, result.refreshToken);
      return { success: true, data: result };
    },
    {
      body: t.Object({
        email: t.String({ format: 'email' }),
        password: t.String({ minLength: 8, maxLength: 100 }),
        name: t.Optional(t.String()),
      }),
    }
  )
  .post(
    '/login',
    async ({ body, cookie }) => {
      const input = body as LoginInput;
      const result = await authService.login(input);
      setAuthCookies(cookie, result.accessToken, result.refreshToken);
      return { success: true, data: result };
    },
    {
      body: t.Object({
        email: t.String({ format: 'email' }),
        password: t.String({ minLength: 1 }),
      }),
    }
  )
  .post(
    '/refresh',
    async ({ body, cookie }) => {
      const refreshToken = cookie?.refreshToken?.value || (body as any)?.refreshToken;
      const result = await authService.refresh(refreshToken);
      setAuthCookies(cookie, result.accessToken, result.refreshToken);
      return { success: true, data: { accessToken: result.accessToken } };
    },
    {
      body: t.Object({
        refreshToken: t.Optional(t.String()),
      }),
    }
  )
  .post(
    '/logout',
    async ({ body, cookie }) => {
      const refreshToken = cookie?.refreshToken?.value || (body as any)?.refreshToken;
      await authService.logout(refreshToken);
      clearAuthCookies(cookie);
      return { success: true, data: { message: 'Logged out successfully' } };
    },
    {
      body: t.Object({
        refreshToken: t.Optional(t.String()),
      }),
    }
  )
  .get('/me', async ({ cookie, headers }) => {
    const userId = verifyAuth({ cookie, headers });
    if (userId instanceof Response) return userId;
    const user = await authService.getMe(userId);
    return { success: true, data: user };
  })
  .post(
    '/change-password',
    async ({ body, cookie, headers }) => {
      const userId = verifyAuth({ cookie, headers });
      if (userId instanceof Response) return userId;
      const input = body as ChangePasswordInput;
      const result = await authService.changePassword(userId, input);
      clearAuthCookies(cookie);
      return { success: true, data: result };
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 1 }),
        newPassword: t.String({ minLength: 8, maxLength: 100 }),
      }),
    }
  );
