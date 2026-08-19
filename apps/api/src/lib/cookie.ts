type CookieOptions = {
  maxAge?: number;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
};

const DEFAULT_PATH = '/';

const encode = (value: string) => encodeURIComponent(value);

const decode = (value: string) => decodeURIComponent(value);

const buildCookieString = (name: string, value: string, options: CookieOptions = {}): string => {
  const parts = [`${encode(name)}=${encode(value)}`];

  parts.push(`Path=${options.path ?? DEFAULT_PATH}`);

  if (typeof options.maxAge === 'number') {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }

  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }

  if (options.secure) {
    parts.push('Secure');
  }

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  return parts.join('; ');
};

export const cookieService = {
  set(name: string, value: string, options?: CookieOptions): string {
    return buildCookieString(name, value, options);
  },

  delete(name: string, options: Omit<CookieOptions, 'maxAge'> = {}): string {
    return buildCookieString(name, '', { ...options, maxAge: 0 });
  },

  parse(cookieHeader: string | undefined | null): Record<string, string> {
    if (!cookieHeader) return {};

    return cookieHeader.split(';').reduce<Record<string, string>>((acc, pair) => {
      const [rawName, ...rest] = pair.trim().split('=');
      if (!rawName) return acc;

      const rawValue = rest.join('=');
      acc[decode(rawName)] = decode(rawValue ?? '');
      return acc;
    }, {});
  },

  get(cookieHeader: string | undefined | null, name: string): string | undefined {
    return this.parse(cookieHeader)[name];
  },
};

export type { CookieOptions };
