export type ScrapePlatform =
  | 'WEB_SEARCH'
  | 'INSTAGRAM'
  | 'LINKEDIN'
  | 'GITHUB'
  | 'TWITCH'
  | 'YOUTUBE'
  | 'TIKTOK'
  | 'PINTEREST'
  | 'LINKTREE';

export interface ScraperConfig {
  githubToken?: string;
  proxy?: string;
  proxyFile?: string;
  freeProxy?: boolean;
  delayMinMs: number;
  delayMaxMs: number;
  timeoutMs: number;
  maxCandidates: number;
}

export interface ScrapeLogger {
  debug(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

// A minimal structural subset of `typeof fetch` — avoids requiring test mocks to
// also implement fetch's static members (e.g. `preconnect`), which `typeof fetch`
// otherwise pulls in.
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface ScrapeDeps {
  fetchImpl: FetchLike;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  now: () => Date;
  logger: ScrapeLogger;
  config: ScraperConfig;
  signal?: AbortSignal;
}

export interface CandidateDraft {
  displayName: string;
  snippet?: string;
  sourceUrl?: string;
  location?: string;
  handles?: Record<string, string>;
  score?: number;
  rank: number;
}

export interface ScrapeInput {
  platform: ScrapePlatform;
  query?: string;
  queryContext?: string;
  handle?: string;
  displayName?: string;
  profileUrl?: string;
  locationHint?: string | null;
}

export type ScrapeOutcome<TOut = Record<string, unknown>> =
  | { status: 'FOUND'; result: TOut; candidates?: CandidateDraft[] }
  | { status: 'NOT_FOUND'; reason: string };

export type ScraperHandler<TOut = Record<string, unknown>> = (
  input: ScrapeInput,
  deps: ScrapeDeps
) => Promise<ScrapeOutcome<TOut>>;
