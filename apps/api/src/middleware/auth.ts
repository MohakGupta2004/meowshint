import { UnauthorizedError } from '../errors';
import { authService } from '../modules/auth/service';

export const authMiddleware = async ({ cookie, headers }: { cookie: any; headers: any }) => {
  const authHeader = headers.authorization;
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length).trim();
  } else if (cookie?.accessToken?.value) {
    token = cookie.accessToken.value;
  }

  if (!token) {
    throw new UnauthorizedError('Authentication required');
  }

  try {
    const { userId, role } = authService.verifyAccessToken(token);
    return { userId, role };
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
};
