import { describe, expect, it } from 'bun:test';

import { authMiddleware } from '../../src/middleware/auth';
import { authService } from '../../src/modules/auth/service';
import { verifyAuth } from '../../src/modules/auth/utils';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

describe('authMiddleware', () => {
  it('should extract Bearer token from Authorization header', async () => {
    const token = authService.generateAccessToken(1, 'USER');

    const result = await authMiddleware({
      cookie: {},
      headers: { authorization: `Bearer ${token}` },
    } as any);

    expect(result.userId).toBe(1);
    expect(result.role).toBe('USER');
  });

  it('should extract token from cookie when no Bearer header', async () => {
    const token = authService.generateAccessToken(2, 'ADMIN');

    const result = await authMiddleware({
      cookie: { accessToken: { value: token } },
      headers: {},
    } as any);

    expect(result.userId).toBe(2);
    expect(result.role).toBe('ADMIN');
  });

  it('should prefer Bearer header over cookie', async () => {
    const bearerToken = authService.generateAccessToken(1, 'USER');

    const result = await authMiddleware({
      cookie: { accessToken: { value: 'cookie-token' } },
      headers: { authorization: `Bearer ${bearerToken}` },
    } as any);

    expect(result.userId).toBe(1);
    expect(result.role).toBe('USER');
  });

  it('should throw UnauthorizedError if no token provided', async () => {
    expect(async () => {
      await authMiddleware({
        cookie: {},
        headers: {},
      } as any);
    }).toThrow('Authentication required');
  });

  it('should throw UnauthorizedError if token is invalid', async () => {
    expect(async () => {
      await authMiddleware({
        cookie: {},
        headers: { authorization: 'Bearer invalid-token' },
      } as any);
    }).toThrow('Invalid or expired access token');
  });

  it('should trim Bearer token value', async () => {
    const token = authService.generateAccessToken(1, 'USER');

    const result = await authMiddleware({
      cookie: {},
      headers: { authorization: `Bearer  ${token}  ` },
    } as any);

    expect(result.userId).toBe(1);
  });

  it('should handle missing authorization header gracefully', async () => {
    expect(async () => {
      await authMiddleware({
        cookie: {},
        headers: {},
      } as any);
    }).toThrow('Authentication required');
  });
});

describe('verifyAuth', () => {
  it('should return userId from Bearer token', async () => {
    const token = authService.generateAccessToken(1, 'USER');

    const result = verifyAuth({
      cookie: {},
      headers: { authorization: `Bearer ${token}` },
    });

    expect(result).toBe(1);
  });

  it('should return userId from cookie token', async () => {
    const token = authService.generateAccessToken(2, 'USER');

    const result = verifyAuth({
      cookie: { accessToken: { value: token } },
      headers: {},
    });

    expect(result).toBe(2);
  });

  it('should return 401 Response when no token provided', async () => {
    const result = verifyAuth({
      cookie: {},
      headers: {},
    });

    expect(result instanceof Response).toBe(true);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('should return 401 Response when token is invalid', async () => {
    const result = verifyAuth({
      cookie: {},
      headers: { authorization: 'Bearer invalid-token' },
    });

    expect(result instanceof Response).toBe(true);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.error.message).toBe('Invalid or expired access token');
    }
  });
});
