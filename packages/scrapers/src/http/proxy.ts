import { readFileSync } from 'node:fs';

import type { ScraperConfig } from '../types';

let cachedFileList: string[] | null = null;
let cachedFilePath: string | null = null;

function readProxyFile(path: string): string[] {
  if (cachedFilePath === path && cachedFileList) return cachedFileList;
  const text = readFileSync(path, 'utf8');
  cachedFileList = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  cachedFilePath = path;
  return cachedFileList;
}

// Precedence: SCOUT_PROXY > SCOUT_PROXY_FILE > SCOUT_FREE_PROXY > direct.
export function resolveProxy(config: ScraperConfig, random: () => number): string | undefined {
  if (config.proxy) return config.proxy;

  if (config.proxyFile) {
    const list = readProxyFile(config.proxyFile);
    if (list.length > 0) {
      const idx = Math.floor(random() * list.length);
      return list[Math.min(idx, list.length - 1)];
    }
  }

  if (config.freeProxy) {
    // Best-effort only — no guaranteed list. Caller's logger should warn.
    return undefined;
  }

  return undefined;
}

export function __resetProxyFileCacheForTests(): void {
  cachedFileList = null;
  cachedFilePath = null;
}
