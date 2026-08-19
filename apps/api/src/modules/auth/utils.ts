import { isProduction } from '../../config/env';
import { authService } from './service';

export function setAuthCookies(set: any, accessToken: string, refreshToken: string) {
  set.cookie['accessToken'] = {
    value: accessToken,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000,
  };

  set.cookie['refreshToken'] = {
    value: refreshToken,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function clearAuthCookies(set: any) {
  set.cookie['accessToken'] = {
    value: '',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  };

  set.cookie['refreshToken'] = {
    value: '',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  };
}

export function verifyAuth({ cookie, headers }: { cookie: any; headers: any }): number | Response {
  const authHeader = headers.authorization;
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length).trim();
  } else if (cookie?.accessToken?.value) {
    token = cookie.accessToken.value;
  }

  if (!token) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { userId } = authService.verifyAccessToken(token);
    return userId;
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' },
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
