import { Router } from 'express';

const SAFE_KEY_REGEX = /^[A-Za-z0-9_-]{1,24}$/;

type ProxyKind = 'team' | 'player' | 'jersey-limited' | 'jersey-test' | 'series';

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ITEMS = 400;

interface CachedImage {
  body: Buffer;
  contentType: string;
  storedAt: number;
}

const imageCache = new Map<string, CachedImage>();

function putCache(cacheKey: string, entry: CachedImage): void {
  if (imageCache.size >= MAX_CACHE_ITEMS) {
    const oldestKey = imageCache.keys().next().value;
    if (oldestKey) imageCache.delete(oldestKey);
  }
  imageCache.set(cacheKey, entry);
}

function buildUpstreamUrl(kind: ProxyKind, key: string): string {
  switch (kind) {
    case 'team':
      return `https://cricketvectors.akamaized.net/Teams/${encodeURIComponent(key)}.png`;
    case 'player':
      return `https://cricketvectors.akamaized.net/players/org/${encodeURIComponent(key)}.png`;
    case 'jersey-limited':
      return `https://cricketvectors.akamaized.net/jersey/limited/org/${encodeURIComponent(key)}.png`;
    case 'jersey-test':
      return `https://cricketvectors.akamaized.net/jersey/test/org/${encodeURIComponent(key)}.png`;
    case 'series':
      return `https://cricketvectors.akamaized.net/Series/${encodeURIComponent(key)}.png`;
  }
}

/**
 * Helmeted batsman silhouette SVG matching the SK Advise / Crex broadcast fallback
 * when a player's portrait image is unavailable on Crex CDN.
 */
function fallbackPlayerSvg(): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <defs>
    <linearGradient id="helm" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3c4c63"/>
      <stop offset="100%" stop-color="#1b2638"/>
    </linearGradient>
    <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2c3a4f"/>
      <stop offset="100%" stop-color="#172030"/>
    </linearGradient>
  </defs>
  <ellipse cx="90" cy="84" rx="37" ry="44" fill="url(#face)"/>
  <path d="M50 76 C50 38, 130 38, 130 76 L132 90 C122 83, 108 79, 90 79 C72 79, 58 83, 48 90 Z" fill="url(#helm)" stroke="#617899" stroke-width="2"/>
  <path d="M46 78 C66 71, 114 71, 134 78 L131 85 C112 79, 68 79, 49 85 Z" fill="#101826"/>
  <path d="M58 92 L122 92 M61 102 L119 102 M66 112 L114 112 M78 88 L76 116 M90 88 L90 118 M102 88 L104 116" stroke="#7d95b5" stroke-width="2.4" stroke-linecap="round" opacity="0.82"/>
  <rect x="76" y="122" width="28" height="22" rx="8" fill="#1d283b"/>
</svg>`,
    'utf8'
  );
}

function fallbackTeamSvg(label: string): Buffer {
  const safe = label.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'CRX';
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <path d="M60 10 L104 26 V64 C104 88 85 104 60 112 C35 104 16 88 16 64 V26 Z" fill="#102952" stroke="#ffffff" stroke-width="5"/>
  <text x="60" y="70" text-anchor="middle" fill="#ffffff" font-family="Arial Black, sans-serif" font-size="28" font-weight="900">${safe}</text>
</svg>`,
    'utf8'
  );
}

function fallbackJerseySvg(isTest: boolean): Buffer {
  const fill = isTest ? '#d8e0ec' : '#1b355e';
  const stroke = isTest ? '#94a3b8' : '#3b5d94';
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">
  <path d="M22 120 L38 42 L72 22 L100 38 L128 22 L162 42 L178 120 Z" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
</svg>`,
    'utf8'
  );
}

export function createProxyRouter(): Router {
  const router = Router();

  router.get('/proxy-image', async (req, res) => {
    const kind = String(req.query.kind ?? '') as ProxyKind;
    const key = String(req.query.key ?? '').trim();

    if (
      !['team', 'player', 'jersey-limited', 'jersey-test', 'series'].includes(kind) ||
      !SAFE_KEY_REGEX.test(key)
    ) {
      res.status(400).json({ error: 'Invalid proxy-image parameters.' });
      return;
    }

    const cacheKey = `${kind}:${key}`;
    const cached = imageCache.get(cacheKey);
    if (cached && Date.now() - cached.storedAt < CACHE_TTL_MS) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(cached.body);
      return;
    }

    try {
      const upstreamUrl = buildUpstreamUrl(kind, key);
      const upstream = await fetch(upstreamUrl, {
        headers: {
          Referer: 'https://crex.com/',
          'User-Agent': 'Mozilla/5.0',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (upstream.ok) {
        const contentType = upstream.headers.get('content-type') || 'image/png';
        if (contentType.startsWith('image/')) {
          const buf = Buffer.from(await upstream.arrayBuffer());
          if (buf.length > 0) {
            putCache(cacheKey, { body: buf, contentType, storedAt: Date.now() });
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.send(buf);
            return;
          }
        }
      }
    } catch {
      // Fall through cleanly to local broadcast SVG fallback
    }

    // Serve clean SVG fallback so OBS never shows broken image icons
    const fallback =
      kind === 'player'
        ? fallbackPlayerSvg()
        : kind === 'team' || kind === 'series'
          ? fallbackTeamSvg(key)
          : fallbackJerseySvg(kind === 'jersey-test');

    putCache(cacheKey, { body: fallback, contentType: 'image/svg+xml', storedAt: Date.now() });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.send(fallback);
  });

  return router;
}
