import { describe, expect, it } from 'bun:test';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

describe('import test', () => {
  it('should import src/middleware/auth', async () => {
    const { authMiddleware } = await import('../src/middleware/auth');
    expect(typeof authMiddleware).toBe('function');
  });
});
