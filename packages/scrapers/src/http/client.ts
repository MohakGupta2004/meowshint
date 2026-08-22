import type { ScrapeDeps, ScrapePlatform } from '../types';
import { resolveProxy } from './proxy';
import { httpStatusToScrapeError } from './status-map';
import { pickUserAgent } from './user-agents';

export interface HttpRequest {
  url: string;
  headers?: Record<string, string>;
  platform: ScrapePlatform;
  expect?: 'json' | 'text';
  skipDelay?: boolean;
}

export interface HttpResponse<T> {
  status: number;
  headers: Headers;
  body: T;
}

function jitter(min: number, max: number, random: () => number): number {
  return Math.round(min + random() * (max - min));
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function doFetch(deps: ScrapeDeps, req: HttpRequest): Promise<Response> {
  if (!req.skipDelay) {
    await deps.sleep(jitter(deps.config.delayMinMs, deps.config.delayMaxMs, deps.random));
  }

  const proxy = resolveProxy(deps.config, deps.random);

  const init: RequestInit & { proxy?: string } = {
    headers: {
      'user-agent': pickUserAgent(deps.random),
      'accept-language': 'en-US,en;q=0.9',
      ...req.headers,
    },
    redirect: 'manual',
    signal: deps.signal ?? AbortSignal.timeout(deps.config.timeoutMs),
  };
  if (proxy) init.proxy = proxy;

  return deps.fetchImpl(req.url, init);
}

export function createHttpClient(deps: ScrapeDeps) {
  return {
    // Throws a mapped ScrapeError on any non-2xx or redirect status.
    async request<T>(req: HttpRequest): Promise<HttpResponse<T>> {
      const res = await doFetch(deps, req);

      const isRedirect = res.status >= 300 && res.status < 400;
      if (!res.ok || isRedirect) {
        const text = await safeText(res);
        throw httpStatusToScrapeError(res, text, req.platform);
      }

      const body = req.expect === 'text' ? await res.text() : await res.json();
      return { status: res.status, headers: res.headers, body: body as T };
    },

    // Returns the raw Response untouched — for callers that need to inspect
    // status/redirect Location themselves (e.g. Instagram login-wall detection).
    async requestRaw(req: HttpRequest): Promise<Response> {
      return doFetch(deps, req);
    },
  };
}
