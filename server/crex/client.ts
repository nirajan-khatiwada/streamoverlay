import fs from 'node:fs';
import { ENV, ENTITY_CACHE_FILE, ensureDataDirectories } from '../config.js';
import { logger } from '../utils/logger.js';

export interface CrexTeamEntity {
  f_key: string;
  n: string;
  sn: string;
  cc?: string;
  uc?: string;
  dc?: string;
}

export interface CrexPlayerEntity {
  f_key: string;
  n: string;
}

export interface CrexSeriesEntity {
  f_key: string;
  n: string;
  sn?: string;
  tour?: string;
}

export interface CrexVenueEntity {
  f_key: string;
  n: string;
}

export interface CrexEntityStore {
  teams: Record<string, CrexTeamEntity>;
  players: Record<string, CrexPlayerEntity>;
  series: Record<string, CrexSeriesEntity>;
  venues: Record<string, CrexVenueEntity>;
  umpires: Record<string, { f_key: string; n: string }>;
}

export interface CrexFetchResult<T> {
  status: number;
  notModified: boolean;
  etag: string | null;
  data: T | null;
}

const DEFAULT_TIMEOUT_MS = 8500;
const BASE_URLS = {
  goscorer: 'https://api.goscorer.com/api/v3',
  goscorerV4: 'https://api.goscorer.com/api/v4',
  mapping: 'https://oc.crickapi.com/mapping/getHomeMapData',
  stats: 'https://stats.crickapi.com',
  commentary: 'https://content.crickapi.com/commentary/v2/getBallFeeds',
} as const;

export class CrexClient {
  private entities: CrexEntityStore;
  private persistTimer: NodeJS.Timeout | null = null;
  private etags = new Map<string, string>();
  private lastPayloads = new Map<string, unknown>();

  constructor() {
    ensureDataDirectories();
    this.entities = this.loadEntityCache();
  }

  private getBaseHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      Version: ENV.CREX_API_VERSION,
      authorization: ENV.CREX_AUTH_TOKEN,
      'Content-Type': 'application/json',
      Origin: 'https://crex.com',
      Referer: 'https://crex.com/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ...(extra ?? {}),
    };
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    retries = 2
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });
        if (res.status >= 500 && attempt < retries) {
          const backoff = 300 * Math.pow(2, attempt) + Math.floor(Math.random() * 150);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        return res;
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          const backoff = 350 * Math.pow(2, attempt) + Math.floor(Math.random() * 150);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Crex network request failed');
  }

  clearMatchEtags(matchKey: string): void {
    this.etags.delete(`sv3:${matchKey}`);
    this.etags.delete(`bf:${matchKey}`);
    this.lastPayloads.delete(`sv3:${matchKey}`);
    this.lastPayloads.delete(`bf:${matchKey}`);
  }

  async getSV3(matchKey: string, useEtag = true): Promise<CrexFetchResult<Record<string, unknown>>> {
    const cacheKey = `sv3:${matchKey}`;
    const headers = this.getBaseHeaders();
    const prevEtag = useEtag ? this.etags.get(cacheKey) : undefined;
    if (prevEtag) {
      headers['If-None-Match'] = prevEtag;
    }

    const res = await this.fetchWithRetry(
      `${BASE_URLS.goscorer}/getSV3?key=${encodeURIComponent(matchKey)}`,
      { method: 'GET', headers }
    );

    if (res.status === 304) {
      return {
        status: 304,
        notModified: true,
        etag: prevEtag ?? null,
        data: (this.lastPayloads.get(cacheKey) as Record<string, unknown> | undefined) ?? null,
      };
    }

    if (!res.ok) {
      throw new Error(`Crex getSV3 failed with HTTP ${res.status} for match ${matchKey}`);
    }

    const etag = res.headers.get('etag');
    const text = await res.text();
    if (!text.trim()) {
      return { status: res.status, notModified: false, etag, data: null };
    }

    const data = JSON.parse(text) as Record<string, unknown>;
    if (etag) this.etags.set(cacheKey, etag);
    this.lastPayloads.set(cacheKey, data);

    return { status: res.status, notModified: false, etag, data };
  }

  async getSC4(matchKey: string): Promise<Record<string, unknown>[]> {
    const res = await this.fetchWithRetry(
      `${BASE_URLS.goscorer}/getSC4?key=${encodeURIComponent(matchKey)}`,
      { method: 'GET', headers: this.getBaseHeaders() },
      1
    );
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.trim()) return [];
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  }

  async getIV4(matchKey: string): Promise<Record<string, unknown> | null> {
    const res = await this.fetchWithRetry(
      `${BASE_URLS.goscorer}/getIV4?key=${encodeURIComponent(matchKey)}`,
      { method: 'GET', headers: this.getBaseHeaders() },
      1
    );
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && 'error' in parsed) return null;
    return parsed;
  }

  async getMatchMetaData(matchKey: string): Promise<Record<string, unknown> | null> {
    const res = await this.fetchWithRetry(
      `${BASE_URLS.stats}/live/getMatchMetaData`,
      {
        method: 'POST',
        headers: this.getBaseHeaders(),
        body: JSON.stringify({ mf: matchKey }),
      },
      1
    );
    if (!res.ok) return null;
    const parsed = (await res.json()) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
      return parsed[0] as Record<string, unknown>;
    }
    return null;
  }

  async getBallFeeds(matchKey: string): Promise<Record<string, unknown>[]> {
    const cacheKey = `bf:${matchKey}`;
    const headers = this.getBaseHeaders();
    const prevEtag = this.etags.get(cacheKey);
    if (prevEtag) {
      headers['If-None-Match'] = prevEtag;
    }

    const res = await this.fetchWithRetry(
      BASE_URLS.commentary,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          matchKey,
          lastDocId: null,
          filters: {
            highlights: false,
            overs: false,
            wickets: false,
            sixes: false,
            fours: false,
            firstInning: false,
            secondInning: false,
            milestones: false,
            thirdInning: false,
            fourthInning: false,
          },
          lang: 'en',
        }),
      },
      1
    );

    if (res.status === 304) {
      return (this.lastPayloads.get(cacheKey) as Record<string, unknown>[] | undefined) ?? [];
    }
    if (!res.ok) return [];
    const etag = res.headers.get('etag');
    const parsed = (await res.json()) as unknown;
    const list = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
    if (etag) this.etags.set(cacheKey, etag);
    this.lastPayloads.set(cacheKey, list);
    return list;
  }

  async getLiveMatchesRaw(): Promise<Record<string, Record<string, unknown>>> {
    const [liveRes, topRes] = await Promise.allSettled([
      this.fetchWithRetry(`${BASE_URLS.goscorer}/getLiveMatches`, {
        method: 'GET',
        headers: this.getBaseHeaders(),
      }),
      this.fetchWithRetry(`${BASE_URLS.goscorerV4}/getTopMatches`, {
        method: 'POST',
        headers: this.getBaseHeaders({ cc: 'IN', platform: 'crex-web' }),
        body: JSON.stringify({ cc: 'IN' }),
      }),
    ]);

    const merged: Record<string, Record<string, unknown>> = {};
    for (const outcome of [liveRes, topRes]) {
      if (outcome.status === 'fulfilled' && outcome.value.ok) {
        try {
          const data = (await outcome.value.json()) as Record<string, unknown>;
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            for (const [k, v] of Object.entries(data)) {
              if (v && typeof v === 'object' && !Array.isArray(v)) {
                merged[k] = v as Record<string, unknown>;
              }
            }
          }
        } catch {
          // ignore malformed response
        }
      }
    }
    return merged;
  }

  async ensureEntitiesResolved(keys: {
    p?: Iterable<string>;
    t?: Iterable<string>;
    s?: Iterable<string>;
    v?: Iterable<string>;
    u?: Iterable<string>;
  }): Promise<CrexEntityStore> {
    const missingP = this.filterMissing(keys.p, this.entities.players);
    const missingT = this.filterMissing(keys.t, this.entities.teams);
    const missingS = this.filterMissing(keys.s, this.entities.series);
    const missingV = this.filterMissing(keys.v, this.entities.venues);
    const missingU = this.filterMissing(keys.u, this.entities.umpires);

    if (
      missingP.length === 0 &&
      missingT.length === 0 &&
      missingS.length === 0 &&
      missingV.length === 0 &&
      missingU.length === 0
    ) {
      return this.entities;
    }

    try {
      const res = await this.fetchWithRetry(
        BASE_URLS.mapping,
        {
          method: 'POST',
          headers: this.getBaseHeaders({ type: 'liveparsing' }),
          body: JSON.stringify({
            p: missingP,
            t: missingT,
            s: missingS,
            v: missingV,
            u: missingU,
            lc: 'en',
          }),
        },
        1
      );

      if (res.ok) {
        const data = (await res.json()) as {
          p?: CrexPlayerEntity[];
          t?: CrexTeamEntity[];
          s?: CrexSeriesEntity[];
          v?: CrexVenueEntity[];
          u?: { f_key: string; n: string }[];
        };

        let updated = false;
        for (const item of data.p ?? []) {
          if (item?.f_key) {
            this.entities.players[item.f_key] = item;
            updated = true;
          }
        }
        for (const item of data.t ?? []) {
          if (item?.f_key) {
            this.entities.teams[item.f_key] = item;
            updated = true;
          }
        }
        for (const item of data.s ?? []) {
          if (item?.f_key) {
            this.entities.series[item.f_key] = item;
            updated = true;
          }
        }
        for (const item of data.v ?? []) {
          if (item?.f_key) {
            this.entities.venues[item.f_key] = item;
            updated = true;
          }
        }
        for (const item of data.u ?? []) {
          if (item?.f_key) {
            this.entities.umpires[item.f_key] = item;
            updated = true;
          }
        }

        if (updated) {
          this.schedulePersistEntities();
        }
      }
    } catch (err) {
      logger.warn('Failed to resolve Crex entity mapping batch', { err });
    }

    return this.entities;
  }

  getEntities(): CrexEntityStore {
    return this.entities;
  }

  private filterMissing(input: Iterable<string> | undefined, cache: Record<string, unknown>): string[] {
    if (!input) return [];
    const out = new Set<string>();
    for (const raw of input) {
      const k = (raw || '').replace(/[*^]/g, '').trim();
      if (k && /^[A-Za-z0-9_]+$/.test(k) && !(k in cache)) {
        out.add(k);
      }
    }
    return [...out];
  }

  private loadEntityCache(): CrexEntityStore {
    try {
      if (fs.existsSync(ENTITY_CACHE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(ENTITY_CACHE_FILE, 'utf8')) as Partial<CrexEntityStore>;
        return {
          teams: raw.teams ?? {},
          players: raw.players ?? {},
          series: raw.series ?? {},
          venues: raw.venues ?? {},
          umpires: raw.umpires ?? {},
        };
      }
    } catch (err) {
      logger.warn('Failed to load Crex entity cache; starting fresh', { err });
    }
    return { teams: {}, players: {}, series: {}, venues: {}, umpires: {} };
  }

  private schedulePersistEntities(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      try {
        const tmp = `${ENTITY_CACHE_FILE}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.entities), 'utf8');
        fs.renameSync(tmp, ENTITY_CACHE_FILE);
      } catch (err) {
        logger.warn('Failed to persist Crex entity cache', { err });
      }
    }, 1500);
  }
}
