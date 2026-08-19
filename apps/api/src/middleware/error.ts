import { isProduction } from '../config/env';
import { AppError } from '../errors';

export const notFound = () => {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    }),
    { status: 404, headers: { 'Content-Type': 'application/json' } }
  );
};

const prismaErrors: Record<string, { status: number; code: string; message: string }> = {
  P2002: { status: 409, code: 'CONFLICT', message: 'A record with this value already exists' },
  P2025: { status: 404, code: 'NOT_FOUND', message: 'Record not found' },
  P2003: {
    status: 409,
    code: 'FOREIGN_KEY_VIOLATION',
    message: 'Related record constraint failed',
  },
};

export const errorHandler = ({ error }: { error: any }) => {
  let status = 500;
  let errorResponse: { code: string; message: string; details?: unknown } = {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Something went wrong',
  };

  if (error instanceof AppError) {
    status = error.statusCode;
    errorResponse = { code: error.code, message: error.message, details: error.details };
  } else if (error?.code && prismaErrors[error.code]) {
    const mapped = prismaErrors[error.code]!;
    status = mapped.status;
    errorResponse = { code: mapped.code, message: mapped.message };
  } else if (error instanceof SyntaxError && 'body' in error) {
    status = 400;
    errorResponse = { code: 'INVALID_JSON', message: 'Malformed JSON in request body' };
  }

  if (status >= 500) {
    if (isProduction)
      errorResponse = { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong' };
  }

  return new Response(JSON.stringify({ success: false, error: errorResponse }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};
