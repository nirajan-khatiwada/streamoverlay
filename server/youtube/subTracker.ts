import { logger } from '../utils/logger.js';

export interface ParsedYoutubeInput {
  kind: 'handle' | 'channelId';
  value: string; // "@Mythpat" or "UC..."
  normalizedDisplay: string;
}

export interface ResolvedYoutubeChannel {
  channelId: string;
  handle: string;
  title: string;
  avatarUrl: string | null;
  fallbackCount: number | null;
}

export interface LiveSubCountResult {
  count: number;
  provider: 'socialcounts' | 'mixerno' | 'youtube-api' | 'youtube-page';
  fetchedAt: string;
}

const CHANNEL_ID_REGEX = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE_REGEX = /^[A-Za-z0-9._-]{2,60}$/;
const ALLOWED_YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Safely parses a YouTube username/handle (@Mythpat, Mythpat), channel ID (UC...),
 * or YouTube channel URL (https://www.youtube.com/@Mythpat or /channel/UC...).
 * Rejects non-YouTube hosts to prevent SSRF.
 */
export function parseYoutubeChannelInput(rawInput: string): ParsedYoutubeInput {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    throw new Error('Enter a YouTube handle like @Mythpat, a YouTube channel URL, or a UC... Channel ID.');
  }

  // Direct Channel ID
  if (CHANNEL_ID_REGEX.test(trimmed)) {
    return { kind: 'channelId', value: trimmed, normalizedDisplay: trimmed };
  }

  // Direct @handle or bare username
  if (!trimmed.includes('/') && !trimmed.includes(' ')) {
    const cleanHandle = trimmed.replace(/^@+/, '');
    if (HANDLE_REGEX.test(cleanHandle)) {
      return {
        kind: 'handle',
        value: `@${cleanHandle}`,
        normalizedDisplay: `@${cleanHandle}`,
      };
    }
    throw new Error('Invalid YouTube handle. Example: @Mythpat');
  }

  // Full YouTube URL
  let parsedUrl: URL;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsedUrl = new URL(withProto);
  } catch {
    throw new Error('Invalid YouTube channel URL or handle. Example: @Mythpat');
  }

  const host = parsedUrl.hostname.toLowerCase();
  if (!ALLOWED_YT_HOSTS.has(host)) {
    throw new Error(`Unsupported host "${host}". Use a youtube.com URL or a handle like @Mythpat.`);
  }

  const segments = parsedUrl.pathname
    .split('/')
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean);

  if (segments[0] === 'channel' && segments[1] && CHANNEL_ID_REGEX.test(segments[1])) {
    return { kind: 'channelId', value: segments[1], normalizedDisplay: segments[1] };
  }

  if (segments[0]?.startsWith('@')) {
    const cleanHandle = segments[0].slice(1);
    if (HANDLE_REGEX.test(cleanHandle)) {
      return {
        kind: 'handle',
        value: `@${cleanHandle}`,
        normalizedDisplay: `@${cleanHandle}`,
      };
    }
  }

  // Legacy /c/<name> or /user/<name>
  if ((segments[0] === 'c' || segments[0] === 'user') && segments[1] && HANDLE_REGEX.test(segments[1])) {
    return {
      kind: 'handle',
      value: `@${segments[1]}`,
      normalizedDisplay: `@${segments[1]}`,
    };
  }

  throw new Error('Could not find a YouTube @handle or /channel/UC... ID in that URL.');
}

export function parseAbbreviatedSubText(rawText: string | null | undefined): number | null {
  if (!rawText) return null;
  const match = rawText.replace(/,/g, '').match(/([0-9]+(?:\.[0-9]+)?)\s*([KMB])?/i);
  if (!match) return null;
  const num = Number.parseFloat(match[1] ?? '');
  if (Number.isNaN(num)) return null;
  const suffix = (match[2] ?? '').toUpperCase();
  const mult = suffix === 'B' ? 1_000_000_000 : suffix === 'M' ? 1_000_000 : suffix === 'K' ? 1_000 : 1;
  return Math.round(num * mult);
}

/**
 * Resolves @handle (e.g. @Mythpat) or UC... channel ID to canonical channel metadata.
 */
export async function resolveYoutubeChannel(rawInput: string): Promise<ResolvedYoutubeChannel> {
  const parsed = parseYoutubeChannelInput(rawInput);

  const targetUrl =
    parsed.kind === 'channelId'
      ? `https://www.youtube.com/channel/${encodeURIComponent(parsed.value)}`
      : `https://www.youtube.com/${encodeURIComponent(parsed.value)}`;

  let channelId = parsed.kind === 'channelId' ? parsed.value : '';
  let title = parsed.normalizedDisplay;
  let avatarUrl: string | null = null;
  let fallbackCount: number | null = null;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const html = await res.text();
      const extractedId =
        html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/)?.[1] ||
        html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/)?.[1] ||
        html.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1];

      if (extractedId) channelId = extractedId;

      const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
      if (ogTitle) title = ogTitle.trim();

      const ogImg = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
      if (ogImg) avatarUrl = ogImg.trim();

      const subMatch = html.match(/([0-9.,]+\s*[KMB]?\s*subscribers)/i)?.[1];
      fallbackCount = parseAbbreviatedSubText(subMatch);
    }
  } catch (err) {
    logger.warn('Direct YouTube channel page resolution failed; trying search fallback', {
      input: parsed.normalizedDisplay,
      err,
    });
  }

  // Fallback search via Mixerno / SocialCounts search API if YouTube HTML did not yield a channel ID
  if (!channelId && parsed.kind === 'handle') {
    const query = parsed.value.replace(/^@/, '');
    try {
      const searchRes = await fetch(
        `https://api.socialcounts.org/youtube-live-subscriber-count/search/${encodeURIComponent(query)}`,
        {
          headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (searchRes.ok) {
        const json = (await searchRes.json()) as {
          items?: Array<{ id?: string; title?: string; picture?: string }>;
        };
        const hit = json.items?.find((item) => item.id && CHANNEL_ID_REGEX.test(item.id));
        if (hit?.id) {
          channelId = hit.id;
          if (hit.title) title = hit.title;
          if (hit.picture) avatarUrl = hit.picture;
        }
      }
    } catch {
      // Fall through to error check
    }
  }

  if (!channelId || !CHANNEL_ID_REGEX.test(channelId)) {
    throw new Error(
      `Could not find YouTube channel for "${parsed.normalizedDisplay}". Check the spelling (e.g. @Mythpat) and try again.`
    );
  }

  return {
    channelId,
    handle: parsed.normalizedDisplay,
    title,
    avatarUrl,
    fallbackCount,
  };
}

/**
 * Fetches live ticking YouTube subscriber count using a fault-tolerant provider cascade:
 * 1. SocialCounts live estimation API (exact real-time digits, zero API key needed)
 * 2. Mixerno live counter API (exact real-time digits, zero API key needed)
 * 3. Optional Official YouTube Data API v3 (if user supplied a key)
 * 4. Optional fallback count from public YouTube page
 */
export async function fetchLiveSubscriberCount(opts: {
  channelId: string;
  youtubeApiKey?: string;
  preferredProvider?: 'socialcounts' | 'mixerno';
  fallbackCount?: number | null;
}): Promise<LiveSubCountResult | null> {
  const { channelId, youtubeApiKey, preferredProvider = 'socialcounts', fallbackCount } = opts;
  if (!CHANNEL_ID_REGEX.test(channelId)) return null;

  const fetchSocialCounts = async (): Promise<LiveSubCountResult | null> => {
    try {
      const res = await fetch(
        `https://api.socialcounts.org/youtube-live-subscriber-count/${encodeURIComponent(channelId)}`,
        {
          headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(5500),
        }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        counters?: {
          estimation?: { subscriberCount?: number };
          api?: { subscriberCount?: number };
        };
      };
      const est = data.counters?.estimation?.subscriberCount;
      const api = data.counters?.api?.subscriberCount;
      const count =
        typeof est === 'number' && est > 0
          ? Math.round(est)
          : typeof api === 'number' && api > 0
            ? Math.round(api)
            : null;
      if (count !== null) {
        return { count, provider: 'socialcounts', fetchedAt: new Date().toISOString() };
      }
    } catch {
      return null;
    }
    return null;
  };

  const fetchMixerno = async (): Promise<LiveSubCountResult | null> => {
    try {
      const res = await fetch(
        `https://mixerno.space/api/youtube-channel-counter/user/${encodeURIComponent(channelId)}`,
        {
          headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(5500),
        }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        counts?: Array<{ value?: string; count?: number }>;
      };
      const subEntry = data.counts?.find((c) => c.value === 'subscribers');
      const apiEntry = data.counts?.find((c) => c.value === 'apisubscribers');
      const raw =
        typeof subEntry?.count === 'number' && subEntry.count > 0
          ? subEntry.count
          : typeof apiEntry?.count === 'number' && apiEntry.count > 0
            ? apiEntry.count
            : null;
      if (raw !== null) {
        return { count: Math.round(raw), provider: 'mixerno', fetchedAt: new Date().toISOString() };
      }
    } catch {
      return null;
    }
    return null;
  };

  // Stick to preferred provider first for monotonic smooth odometer updates
  const ordered =
    preferredProvider === 'mixerno'
      ? [fetchMixerno, fetchSocialCounts]
      : [fetchSocialCounts, fetchMixerno];

  for (const providerFn of ordered) {
    const result = await providerFn();
    if (result) return result;
  }

  // Optional YouTube Data API v3 fallback if user configured a key
  const cleanKey = (youtubeApiKey || '').trim();
  if (cleanKey && cleanKey !== '••••••••') {
    try {
      const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(cleanKey)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const json = (await res.json()) as {
          items?: Array<{ statistics?: { subscriberCount?: string } }>;
        };
        const count = Number.parseInt(json.items?.[0]?.statistics?.subscriberCount ?? '', 10);
        if (!Number.isNaN(count) && count >= 0) {
          return { count, provider: 'youtube-api', fetchedAt: new Date().toISOString() };
        }
      }
    } catch {
      // continue to fallback
    }
  }

  if (typeof fallbackCount === 'number' && fallbackCount >= 0) {
    return { count: fallbackCount, provider: 'youtube-page', fetchedAt: new Date().toISOString() };
  }

  return null;
}
