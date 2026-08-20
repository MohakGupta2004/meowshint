import { describe, expect, it, spyOn } from 'bun:test';

import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../src/errors';
import { errorHandler, notFound } from '../../src/middleware/error';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

describe('errorHandler', () => {
  it('should handle AppError correctly', async () => {
    const error = new BadRequestError('Custom bad request', { field: 'email' });
    const response = errorHandler({ error });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).toBe('Custom bad request');
    expect(body.error.details).toEqual({ field: 'email' });
  });

  it('should handle UnauthorizedError', async () => {
    const response = errorHandler({ error: new UnauthorizedError('Not authenticated') });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Not authenticated');
  });

  it('should handle ForbiddenError', async () => {
    const response = errorHandler({ error: new ForbiddenError('No permission') });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toBe('No permission');
  });

  it('should handle NotFoundError', async () => {
    const response = errorHandler({ error: new NotFoundError('Resource missing') });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Resource missing');
  });

  it('should handle ConflictError', async () => {
    const response = errorHandler({ error: new ConflictError('Duplicate entry') });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('Duplicate entry');
  });

  it('should handle ValidationError', async () => {
    const response = errorHandler({
      error: new ValidationError('Invalid input', { reason: 'too short' }),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Invalid input');
    expect(body.error.details).toEqual({ reason: 'too short' });
  });

  it('should map Prisma P2002 (unique constraint violation)', async () => {
    const response = errorHandler({
      error: { code: 'P2002', message: 'Unique constraint failed' },
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('A record with this value already exists');
  });

  it('should map Prisma P2025 (record not found)', async () => {
    const response = errorHandler({
      error: { code: 'P2025', message: 'Record not found' },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Record not found');
  });

  it('should map Prisma P2003 (foreign key violation)', async () => {
    const response = errorHandler({
      error: { code: 'P2003', message: 'Foreign key constraint failed' },
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('FOREIGN_KEY_VIOLATION');
    expect(body.error.message).toBe('Related record constraint failed');
  });

  it('should handle SyntaxError with body property as malformed JSON', async () => {
    const syntaxError = new SyntaxError('Unexpected end of JSON input');
    (syntaxError as any).body = { raw: 'invalid json' };

    const response = errorHandler({ error: syntaxError });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_JSON');
    expect(body.error.message).toBe('Malformed JSON in request body');
  });

  it('should handle unknown errors as 500', async () => {
    const response = errorHandler({ error: new Error('Something broke') });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error.message).toBe('Something went wrong');
  });

  it('should not include details on generic 500 errors', async () => {
    const response = errorHandler({ error: new Error('Database connection lost') });
    const body = await response.json();

    expect(body.error.details).toBeUndefined();
  });

  it('should redact 500+ errors in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const response = errorHandler({ error: new Error('Secret database password exposed') });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.message).toBe('Something went wrong');
    expect(body.error.details).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });

  it('should preserve AppError details in non-production mode', async () => {
    const response = errorHandler({
      error: new ValidationError('Failed', { errors: ['a is required'] }),
    });
    const body = await response.json();

    expect(body.error.details).toEqual({ errors: ['a is required'] });
  });

  it('should return response with correct content-type header', async () => {
    const response = errorHandler({ error: new BadRequestError() });
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });
});

describe('notFound', () => {
  it('should return 404 response', async () => {
    const response = notFound();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Route not found');
  });
});
