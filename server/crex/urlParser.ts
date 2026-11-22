export interface ParsedCrexTarget {
  matchKey: string;
  canonicalUrl: string;
}

const MATCH_KEY_REGEX = /^[A-Za-z0-9]{2,12}$/;
const ALLOWED_HOSTS = new Set(['crex.com', 'www.crex.com', 'm.crex.com']);
const KNOWN_SUBROUTES = new Set([
  'match-details',
  'match-scorecard',
  'stats',
  'news',
  'live',
  'info',
  'scorecard',
  'commentary',
  'overs',
  'squads',
]);

/**
 * Safely extracts and validates a Crex matchKey from either:
 * - A full crex.com URL (live, match-details, match-scorecard, social, etc.)
 * - A raw alphanumeric match key (e.g. "12JM", "11BO", "12XY", "1346")
 *
 * Never performs outbound network requests to arbitrary hostnames (SSRF-safe).
 */
export function parseCrexMatchInput(rawInput: string): ParsedCrexTarget {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    throw new Error('Please provide a Crex match URL or match key.');
  }

  // Direct matchKey shortcut (e.g., "12JM")
  if (!trimmed.includes('/') && !trimmed.includes('.') && MATCH_KEY_REGEX.test(trimmed)) {
    return {
      matchKey: trimmed,
      canonicalUrl: `https://crex.com/cricket-live-score/match-updates-${trimmed}`,
    };
  }

  let parsedUrl: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsedUrl = new URL(withProtocol);
  } catch {
    throw new Error('Invalid URL format. Paste a valid https://crex.com/cricket-live-score/... link.');
  }

  const host = parsedUrl.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(`Unsupported host "${host}". Only crex.com match URLs are supported.`);
  }

  // Strip empty segments and known tab sub-routes (/match-details, /match-scorecard, etc.)
  const segments = parsedUrl.pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error('URL points to Crex homepage. Please paste a specific match URL.');
  }

  // Check for route prefixes: /cricket-live-score/<slug>-<key>[/<subroute>]
  // or /scoreboard/<key>/... or /social/<slug>-<key>
  const first = segments[0]?.toLowerCase() ?? '';
  let candidateKey = '';

  if (first === 'scoreboard' && segments[1] && MATCH_KEY_REGEX.test(segments[1])) {
    candidateKey = segments[1];
  } else {
    // Walk from the end, skipping known sub-routes to find the matchTitle slug
    const filtered = [...segments];
    while (filtered.length > 1 && KNOWN_SUBROUTES.has((filtered[filtered.length - 1] ?? '').toLowerCase())) {
      filtered.pop();
    }

    // For /social/<slug>/<commentSegment>, prefer segment index 1 if index 0 === 'social'
    const slugSegment =
      first === 'social' && filtered.length >= 2
        ? filtered[1] ?? ''
        : filtered[filtered.length - 1] ?? '';

    const parts = slugSegment.split('-').filter(Boolean);
    const tail = parts[parts.length - 1] ?? '';

    if (MATCH_KEY_REGEX.test(tail)) {
      candidateKey = tail;
    }
  }

  if (!candidateKey || !MATCH_KEY_REGEX.test(candidateKey)) {
    throw new Error(
      'Could not extract a valid Crex match key from that URL. Example: https://crex.com/cricket-live-score/ind-vs-nz-1st-test-india-tour-of-new-zealand-2026-match-updates-12JM'
    );
  }

  const cleanPath = parsedUrl.pathname.replace(/\/(match-details|match-scorecard|stats|news|live|info)\/?$/i, '');
  return {
    matchKey: candidateKey,
    canonicalUrl: `https://crex.com${cleanPath}`,
  };
}
