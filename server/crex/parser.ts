import type {
  BallEntry,
  BallKind,
  BatsmanState,
  BowlerState,
  CenterBadgeState,
  ChaseInfo,
  CrexLiveMatchItem,
  InningsScorecard,
  LastWicketInfo,
  MatchFormat,
  MatchInfoDetails,
  MatchSnapshot,
  MatchStatus,
  OverSummary,
  PartnershipInfo,
  PlayingXIPlayer,
  ScorecardBatter,
  ScorecardBowler,
  TeamDisplay,
  TestMatchInfo,
  WinProbability,
  YetToBatPlayer,
} from '../../shared/types.js';
import type { CrexEntityStore } from './client.js';

export interface CrexRawBundle {
  matchKey: string;
  sourceUrl: string;
  sv3: Record<string, unknown> | null;
  sc4: Record<string, unknown>[];
  iv4: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  ballFeeds: Record<string, unknown>[];
  entities: CrexEntityStore;
}

interface ParsedScoreParts {
  runs: number;
  wickets: number;
  oversWhole: number;
  ballsInOver: number;
  totalBalls: number;
  scoreStr: string;
  oversStr: string;
  declared: boolean;
}

const DISMISSAL_LABELS: Record<string, string> = {
  '1': 'Bowled',
  '2': 'Caught',
  '3': 'Caught & Bowled',
  '4': 'Run Out',
  '5': 'LBW',
  '6': 'Hit Wicket',
  '7': 'Caught Behind',
  '8': 'Stumped',
  '9': 'Mankaded',
  '10': 'Obstructing Field',
  '11': 'Retired Hurt',
  '12': 'Retired Out',
  '13': 'Absent Hurt',
  '14': 'Timed Out',
};

const TOSS_DELAY_LABELS: Record<string, string> = {
  '1': 'TOSS DELAYED',
  '2': 'DELAYED BY RAIN',
  '3': 'BAD WEATHER DELAY',
  '4': 'BAD LIGHT DELAY',
  '5': 'WET OUTFIELD',
};

export function formatPlayerShortName(fullName: string): string {
  const clean = (fullName || '').trim().replace(/\s+/g, ' ');
  if (!clean) return 'PLAYER';
  const parts = clean.split(' ');
  if (parts.length === 1) return clean.toUpperCase();
  const firstInitial = (parts[0] ?? '')[0] ?? '';
  const rest = parts.slice(1).join(' ');
  const candidate = `${firstInitial} ${rest}`.trim();
  if (candidate.length <= 16) return candidate.toUpperCase();
  const last = parts[parts.length - 1] ?? rest;
  return `${firstInitial} ${last}`.toUpperCase();
}

export function buildImageUrls(format: MatchFormat) {
  const jerseyKind = format === 'TEST' ? 'jersey-test' : 'jersey-limited';
  return {
    teamLogo: (fkey: string) => `/api/proxy-image?kind=team&key=${encodeURIComponent(fkey || 'UNKNOWN')}`,
    playerPhoto: (fkey: string) => `/api/proxy-image?kind=player&key=${encodeURIComponent(fkey || 'UNKNOWN')}`,
    jersey: (teamFkey: string) =>
      `/api/proxy-image?kind=${jerseyKind}&key=${encodeURIComponent(teamFkey || 'AD')}`,
  };
}

function parseTeamColor(rawCc: string | undefined, fallback: string): string {
  if (!rawCc) return fallback;
  const idx = rawCc.indexOf('#');
  if (idx >= 0) {
    const hex = rawCc.slice(idx, idx + 7);
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  }
  return fallback;
}

export function collectEntityKeysFromRaw(input: {
  sv3?: Record<string, unknown> | null;
  sc4?: Record<string, unknown>[];
  iv4?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
}): { p: Set<string>; t: Set<string>; s: Set<string>; v: Set<string> } {
  const p = new Set<string>();
  const t = new Set<string>();
  const s = new Set<string>();
  const v = new Set<string>();

  const sv3 = input.sv3 ?? {};
  const str = (val: unknown) => (typeof val === 'string' ? val : '');

  for (const k of str(sv3.a).split('.')) if (k) t.add(k);
  for (const k of str(sv3.p).split('.')) if (k) p.add(k.replace('*', ''));
  if (str(sv3.b)) p.add(str(sv3.b));
  for (const k of str(sv3.g).split('.')) if (k) p.add(k);
  if (str(sv3.sf)) s.add(str(sv3.sf));
  if (str(sv3.x)) {
    const xParts = str(sv3.x).split('.');
    if (xParts[0]) p.add(xParts[0]);
    if (xParts[6]) p.add(xParts[6]);
    if (xParts[7]) p.add(xParts[7]);
  }
  if (str(sv3.mm)) {
    const mmParts = str(sv3.mm).split('.');
    if (mmParts[0]) p.add(mmParts[0]);
    if (mmParts[1]) t.add(mmParts[1]);
  }
  if (str(sv3.F)) {
    for (const part of str(sv3.F).split('.')) {
      if (part.startsWith('^') && part.length > 1) t.add(part.slice(1));
    }
  }

  const iv4 = input.iv4 ?? {};
  if (str(iv4.s)) s.add(str(iv4.s));
  if (str(iv4.v)) v.add(str(iv4.v));
  for (const k of str(iv4.t).split('-')) if (k) t.add(k);
  for (const k of str(iv4.x).split('/')) if (k) p.add(k);
  if (str(iv4.tp)) {
    for (const side of str(iv4.tp).split('/')) {
      for (const entry of side.split('-')) {
        const key = entry.split('.')[0];
        if (key) p.add(key);
      }
    }
  }

  const meta = input.meta ?? {};
  if (str(meta.team1_fkey)) t.add(str(meta.team1_fkey));
  if (str(meta.team2_fkey)) t.add(str(meta.team2_fkey));
  if (str(meta.sf)) s.add(str(meta.sf));

  for (const inn of input.sc4 ?? []) {
    if (str(inn.c)) t.add(str(inn.c));
    for (const k of str(inn.x).split('/')) {
      if (k && k !== '0' && k !== '1') p.add(k);
    }
    if (Array.isArray(inn.a)) {
      for (const line of inn.a) {
        const key = String(line).split('.')[0];
        if (key) p.add(key);
      }
    }
    if (Array.isArray(inn.b)) {
      for (const line of inn.b) {
        const left = String(line).split('/')[0] ?? '';
        const parts = left.split('.');
        if (parts[0]) p.add(parts[0]);
        if (parts[8]) p.add(parts[8]);
        if (parts[9]) p.add(parts[9]);
      }
    }
  }

  return { p, t, s, v };
}

export function parseScoreString(raw: unknown, ballsPerOver: 5 | 6): ParsedScoreParts | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const declared = raw.startsWith('!');
  const cleaned = declared ? raw.slice(1) : raw;
  const parts = cleaned.split(/[(/.]+/).filter((x) => x !== '');
  if (parts.length < 2) return null;

  const runs = Number.parseInt(parts[0] ?? '0', 10);
  const wickets = Number.parseInt(parts[1] ?? '0', 10);
  const oversWhole = Number.parseInt(parts[2] ?? '0', 10);
  const ballsInOver = Number.parseInt(parts[3] ?? '0', 10);
  if (Number.isNaN(runs) || Number.isNaN(wickets)) return null;

  const safeOvers = Number.isNaN(oversWhole) ? 0 : oversWhole;
  const safeBalls = Number.isNaN(ballsInOver) ? 0 : ballsInOver;
  const totalBalls = safeOvers * ballsPerOver + safeBalls;

  return {
    runs,
    wickets,
    oversWhole: safeOvers,
    ballsInOver: safeBalls,
    totalBalls,
    scoreStr: `${runs}-${wickets}${declared ? 'd' : ''}`,
    oversStr: `${safeOvers}.${safeBalls}`,
    declared,
  };
}

export function decodeCenterBadge(rawCode: unknown, status: MatchStatus, breakLabel: string | null, resultText: string | null): CenterBadgeState {
  const raw = typeof rawCode === 'string' ? rawCode.trim() : String(rawCode ?? '').trim();
  const lower = raw.toLowerCase();

  if (status === 'upcoming') {
    if (raw && raw.length > 3 && !/^[0-9]+$/.test(raw)) {
      return { text: raw.toUpperCase(), tone: 'neutral', rawCode: raw };
    }
    return { text: 'UPCOMING', tone: 'neutral', rawCode: raw };
  }

  if (status === 'finished') {
    if (resultText) {
      return { text: 'RESULT', subtext: resultText, tone: 'result', rawCode: raw };
    }
    return { text: 'FINISHED', tone: 'result', rawCode: raw };
  }

  if (!raw) {
    if (breakLabel) return { text: breakLabel.toUpperCase(), tone: 'alert', rawCode: '' };
    return { text: 'LIVE', tone: 'neutral', rawCode: '' };
  }

  // Exact single-letter / numeric Crex codes from 18-es2015
  if (lower === 'b') return { text: 'BALL', tone: 'ball', rawCode: raw };
  if (lower === 'o' || lower === 'over') return { text: 'OVER', tone: 'over', rawCode: raw };
  if (lower === 'w' || lower === 'wicket' || raw.startsWith('^')) {
    const code = raw.startsWith('^') ? raw.slice(1) : '';
    const sub = code && DISMISSAL_LABELS[code] ? DISMISSAL_LABELS[code] : undefined;
    return { text: 'WICKET', subtext: sub, tone: 'wicket', rawCode: raw };
  }
  if (raw === '4' || lower === 'four') return { text: '4', tone: 'four', rawCode: raw };
  if (raw === '6' || lower === 'six') return { text: '6', tone: 'six', rawCode: raw };
  if (/^[0-5]$/.test(raw)) return { text: raw, tone: 'neutral', rawCode: raw };

  if (lower === 'fh') return { text: 'FREE HIT', tone: 'extra', rawCode: raw };
  if (lower === 'tu' || lower === 'u') return { text: '3RD UMPIRE', tone: 'alert', rawCode: raw };
  if (lower === 'ba') return { text: 'IN AIR', tone: 'alert', rawCode: raw };
  if (lower === 'cd') return { text: 'DROP', tone: 'alert', rawCode: raw };
  if (lower === 'cc') return { text: 'COVERS', tone: 'alert', rawCode: raw };
  if (lower === 'no') return { text: 'NOT OUT', tone: 'neutral', rawCode: raw };
  if (lower === 'a') return { text: 'APPEAL', tone: 'alert', rawCode: raw };
  if (lower === 'i') return { text: 'INNINGS', subtext: 'BREAK', tone: 'alert', rawCode: raw };
  if (lower === 'd') return { text: 'DRIZZLE', tone: 'alert', rawCode: raw };
  if (lower === 'p') return { text: 'INJURY', tone: 'alert', rawCode: raw };
  if (lower === 'ruka') return { text: 'STOPPED', tone: 'alert', rawCode: raw };
  if (lower === 'e') return { text: 'PLAYERS', subtext: 'ENTERING', tone: 'neutral', rawCode: raw };
  if (lower === 'f') return { text: 'FAST', subtext: 'BOWLER', tone: 'neutral', rawCode: raw };
  if (lower === 's') return { text: 'SPIN', subtext: 'BOWLER', tone: 'neutral', rawCode: raw };

  if (lower.startsWith('wd')) {
    const extraRuns = lower.slice(2);
    return { text: extraRuns ? `WD+${extraRuns}` : 'WIDE', tone: 'extra', rawCode: raw };
  }
  if (lower.startsWith('nb')) {
    const extraRuns = lower.slice(2);
    return { text: extraRuns ? `NB+${extraRuns}` : 'NO BALL', tone: 'extra', rawCode: raw };
  }
  if (lower.startsWith('lb')) {
    const extraRuns = lower.slice(2);
    return { text: extraRuns ? `${extraRuns}LB` : 'LEG BYE', tone: 'extra', rawCode: raw };
  }
  if (lower.startsWith('by')) {
    const extraRuns = lower.slice(2);
    return { text: extraRuns ? `${extraRuns}B` : 'BYE', tone: 'extra', rawCode: raw };
  }

  // Fallback for full-text statuses like "Tea Break", "Lunch", "Stumps", "Australia won..."
  if (raw.length > 14) {
    return { text: breakLabel ? breakLabel.toUpperCase() : 'UPDATE', subtext: raw, tone: 'alert', rawCode: raw };
  }
  return { text: raw.toUpperCase(), tone: 'neutral', rawCode: raw };
}

export function classifyBallToken(rawToken: string): { display: string; kind: BallKind; runs: number; isLegal: boolean } {
  const token = (rawToken || '').trim();
  const lower = token.toLowerCase();

  if (!token) return { display: '', kind: 'pending', runs: 0, isLegal: false };

  // Handle "0+1" / "1+1" notation from Crex `rb.b[].u` (e.g. leg bye / bye / run+extra)
  if (token.includes('+')) {
    const nums = token.split('+').map((n) => Number.parseInt(n, 10) || 0);
    const total = nums.reduce((a, b) => a + b, 0);
    return { display: String(total), kind: total === 4 ? 'four' : total === 6 ? 'six' : 'run', runs: total, isLegal: true };
  }

  if (lower.includes('w') && !lower.includes('wd')) {
    const numMatch = token.match(/\d+/);
    const runs = numMatch ? Number.parseInt(numMatch[0], 10) : 0;
    return { display: runs > 0 ? `W+${runs}` : 'W', kind: 'wicket', runs, isLegal: true };
  }

  if (lower.includes('wd')) {
    const numMatch = token.match(/\d+/);
    const extra = numMatch ? Number.parseInt(numMatch[0], 10) : 0;
    const total = 1 + extra;
    return { display: extra > 0 ? `${extra}wd` : 'wd', kind: 'extra', runs: total, isLegal: false };
  }

  if (lower.includes('nb')) {
    const numMatch = token.match(/\d+/);
    const extra = numMatch ? Number.parseInt(numMatch[0], 10) : 0;
    const total = 1 + extra;
    return { display: extra > 0 ? `${extra}nb` : 'nb', kind: 'extra', runs: total, isLegal: false };
  }

  if (lower.includes('lb')) {
    const numMatch = token.match(/\d+/);
    const runs = numMatch ? Number.parseInt(numMatch[0], 10) : 1;
    return { display: `${runs}lb`, kind: 'extra', runs, isLegal: true };
  }

  if (lower.endsWith('b') && /^\d+b$/i.test(token)) {
    const runs = Number.parseInt(token, 10) || 1;
    return { display: `${runs}b`, kind: 'extra', runs, isLegal: true };
  }

  if (token === '4') return { display: '4', kind: 'four', runs: 4, isLegal: true };
  if (token === '6') return { display: '6', kind: 'six', runs: 6, isLegal: true };
  if (token === '0' || token === '.') return { display: '0', kind: 'dot', runs: 0, isLegal: true };

  const numeric = Number.parseInt(token, 10);
  if (!Number.isNaN(numeric)) {
    return { display: String(numeric), kind: numeric === 0 ? 'dot' : 'run', runs: numeric, isLegal: true };
  }

  return { display: token.toUpperCase().slice(0, 4), kind: 'extra', runs: 0, isLegal: true };
}

export function parseRecentOvers(
  sv3: Record<string, unknown>,
  ballsPerOver: 5 | 6,
  currentScore: ParsedScoreParts | null
): OverSummary[] {
  const summaries: OverSummary[] = [];

  // Prefer structured `rb` array when present (contains exact over numbers, ball tokens, totals)
  if (Array.isArray(sv3.rb) && sv3.rb.length > 0) {
    const rbOvers = sv3.rb as Array<{
      o?: number;
      r?: number;
      b?: Array<{ u?: string; t?: number; d?: number; bf?: string }>;
    }>;

    // Take the last 2 overs (previous + current)
    const slice = rbOvers.slice(-2);
    slice.forEach((ov, idx) => {
      const rawBalls = Array.isArray(ov.b) ? ov.b : [];
      const parsedBalls: BallEntry[] = rawBalls.map((ball) => {
        const token = String(ball.u ?? '0');
        const info = classifyBallToken(token);
        // Crex `t` flag in rb: 1=wicket, 2=four, 3=six
        let kind = info.kind;
        let display = info.display;
        if (ball.t === 1) {
          kind = 'wicket';
          if (!display.includes('W')) display = 'W';
        } else if (ball.t === 2) {
          kind = 'four';
          display = '4';
        } else if (ball.t === 3) {
          kind = 'six';
          display = '6';
        }
        return { display, kind, isLatest: false, runs: info.runs };
      });

      const legalCount = rawBalls.reduce((acc, b) => {
        const tok = String(b.u ?? '').toLowerCase();
        return acc + (tok.includes('wd') || tok.includes('nb') ? 0 : 1);
      }, 0);

      const isLast = idx === slice.length - 1;
      const isComplete = legalCount >= ballsPerOver;

      // Pad pending blank white circles in current incomplete over
      if (isLast && !isComplete) {
        const remaining = Math.max(0, ballsPerOver - legalCount);
        for (let r = 0; r < remaining; r++) {
          parsedBalls.push({ display: '', kind: 'pending', isLatest: false, runs: 0 });
        }
      }

      summaries.push({
        overNumber: typeof ov.o === 'number' ? ov.o : idx + 1,
        balls: parsedBalls,
        totalRuns: typeof ov.r === 'number' ? ov.r : parsedBalls.reduce((s, b) => s + b.runs, 0),
        isCurrent: isLast,
        isComplete,
      });
    });
  } else {
    // Fallback to `l`, `m`, `n` ("29:1.2.4.0.2.0") + `A` ("0.0.2")
    const parseColonOver = (raw: unknown): OverSummary | null => {
      if (typeof raw !== 'string' || !raw.includes(':')) return null;
      const [numPart, ballsPart] = raw.split(':');
      const overNumber = Number.parseInt(numPart ?? '0', 10);
      if (Number.isNaN(overNumber)) return null;
      const tokens = (ballsPart ?? '').split('.').filter(Boolean);
      const balls: BallEntry[] = tokens.map((tok) => {
        const info = classifyBallToken(tok);
        return { display: info.display, kind: info.kind, isLatest: false, runs: info.runs };
      });
      return {
        overNumber,
        balls,
        totalRuns: balls.reduce((sum, b) => sum + b.runs, 0),
        isCurrent: false,
        isComplete: true,
      };
    };

    const completed = [parseColonOver(sv3.l), parseColonOver(sv3.m), parseColonOver(sv3.n)]
      .filter((x): x is OverSummary => x !== null)
      .sort((a, b) => a.overNumber - b.overNumber);

    const aStr = typeof sv3.A === 'string' ? sv3.A.trim() : '';
    const currentTokens = aStr ? aStr.split('.').filter(Boolean) : [];
    if (currentTokens.length > 0) {
      const prevOver = completed[completed.length - 1];
      if (prevOver) summaries.push(prevOver);

      let legalCount = 0;
      const currBalls: BallEntry[] = currentTokens.map((tok) => {
        const info = classifyBallToken(tok);
        if (info.isLegal) legalCount++;
        return { display: info.display, kind: info.kind, isLatest: false, runs: info.runs };
      });

      const currentOverNum =
        currentScore && currentScore.ballsInOver > 0
          ? currentScore.oversWhole + 1
          : (prevOver?.overNumber ?? 0) + 1;
      const isComplete = legalCount >= ballsPerOver;
      if (!isComplete) {
        for (let r = 0; r < ballsPerOver - legalCount; r++) {
          currBalls.push({ display: '', kind: 'pending', isLatest: false, runs: 0 });
        }
      }
      summaries.push({
        overNumber: currentOverNum,
        balls: currBalls,
        totalRuns: currBalls.reduce((sum, b) => sum + b.runs, 0),
        isCurrent: true,
        isComplete,
      });
    } else if (completed.length > 0) {
      summaries.push(...completed.slice(-2));
      const last = summaries[summaries.length - 1];
      if (last) last.isCurrent = true;
    }
  }

  // Mark ONLY the very last non-pending ball across the displayed overs as `isLatest`
  for (let oi = summaries.length - 1; oi >= 0; oi--) {
    const ov = summaries[oi];
    if (!ov) continue;
    for (let bi = ov.balls.length - 1; bi >= 0; bi--) {
      const b = ov.balls[bi];
      if (b && b.kind !== 'pending') {
        b.isLatest = true;
        return summaries;
      }
    }
  }

  return summaries;
}

export function parseWinProbability(
  sv3: Record<string, unknown>,
  format: MatchFormat,
  leftTeam: { fkey: string; shortName: string },
  rightTeam: { fkey: string; shortName: string }
): WinProbability {
  const empty: WinProbability = {
    available: false,
    isThreeWay: format === 'TEST',
    leftTeamShort: leftTeam.shortName,
    leftPercent: 50,
    rightTeamShort: rightTeam.shortName,
    rightPercent: 50,
    drawPercent: 0,
  };

  const rStr = typeof sv3.R === 'string' ? sv3.R.trim() : '';
  const fStr = typeof sv3.F === 'string' ? sv3.F.trim() : '';

  // 1. Test / 3-way odds: "t1Min-t1Max,t2Min-t2Max,drawMin-drawMax"
  if (rStr.includes(',')) {
    const segments = rStr.split(',');
    if (segments.length >= 3) {
      const parseMid = (seg: string | undefined): number => {
        const [a, b] = (seg ?? '').split('-').map((x) => Number.parseFloat(x));
        if (!a || Number.isNaN(a)) return 0;
        if (!b || Number.isNaN(b) || b === 0) return a;
        return (a + b) / 2;
      };

      const m1 = parseMid(segments[0]);
      const m2 = parseMid(segments[1]);
      const mDraw = parseMid(segments[2]);

      const inv1 = m1 > 0 && m1 < 500 ? 1 / m1 : 0;
      const inv2 = m2 > 0 && m2 < 500 ? 1 / m2 : 0;
      const invD = mDraw > 0 && mDraw < 500 ? 1 / mDraw : 0;
      const total = inv1 + inv2 + invD;

      if (total > 0) {
        const p1 = Math.round((inv1 / total) * 100);
        const p2 = Math.round((inv2 / total) * 100);
        const pDraw = Math.max(0, 100 - p1 - p2);

        // Map `F` ("^R.^O") to leftTeam vs rightTeam
        const fParts = fStr.split('.').map((x) => x.replace(/^\^/, ''));
        const fFirst = fParts[0] ?? '';

        const leftIsFirst = !fFirst || fFirst === leftTeam.fkey;
        return {
          available: true,
          isThreeWay: true,
          leftTeamShort: leftTeam.shortName,
          leftPercent: leftIsFirst ? p1 : p2,
          rightTeamShort: rightTeam.shortName,
          rightPercent: leftIsFirst ? p2 : p1,
          drawPercent: pDraw,
        };
      }
    }
  }

  // 2. Limited-overs 2-way odds: "rate1+diff" (verbatim formula from Crex 18-es2015 getPercentageViewConfig)
  if (rStr.includes('+')) {
    const [rawA, rawB] = rStr.split('+').map((x) => Number.parseInt(x, 10));
    if (!Number.isNaN(rawA ?? NaN) && !Number.isNaN(rawB ?? NaN) && ((rawA ?? 0) > 0 || (rawB ?? 0) > 0)) {
      const a = rawA ?? 0;
      const b = rawB ?? 0;
      const mid = (2 * a + b) / 2;
      const favPer = Math.min(99, Math.max(1, Math.round(100 - mid / 2)));
      const secPer = 100 - favPer;

      const fKey = fStr.split('.')[0]?.replace(/^\^/, '') ?? '';
      const favIsLeft = !fKey || fKey === leftTeam.fkey || fKey.toUpperCase() === leftTeam.shortName.toUpperCase();

      return {
        available: true,
        isThreeWay: false,
        leftTeamShort: leftTeam.shortName,
        leftPercent: favIsLeft ? favPer : secPer,
        rightTeamShort: rightTeam.shortName,
        rightPercent: favIsLeft ? secPer : favPer,
        drawPercent: 0,
      };
    }
  }

  // 3. Fallback: Crex fan poll `wp` = "<team1Key>,<t1Votes>,<t2Votes>,<drawVotes>"
  const wpStr = typeof sv3.wp === 'string' ? sv3.wp.trim() : '';
  if (wpStr) {
    const parts = wpStr.split(',');
    const key1 = parts[0] ?? '';
    const v1 = Number.parseInt(parts[1] ?? '0', 10) || 0;
    const v2 = Number.parseInt(parts[2] ?? '0', 10) || 0;
    const vDraw = Number.parseInt(parts[3] ?? '0', 10) || 0;
    const sum = v1 + v2 + (format === 'TEST' ? vDraw : 0);
    if (sum > 0) {
      const p1 = Math.round((v1 / sum) * 100);
      const p2 = Math.round((v2 / sum) * 100);
      const pDraw = format === 'TEST' ? Math.max(0, 100 - p1 - p2) : 0;
      const leftIsFirst = key1 === leftTeam.fkey;
      return {
        available: true,
        isThreeWay: format === 'TEST' && pDraw > 0,
        leftTeamShort: leftTeam.shortName,
        leftPercent: leftIsFirst ? p1 : p2,
        rightTeamShort: rightTeam.shortName,
        rightPercent: leftIsFirst ? p2 : p1,
        drawPercent: pDraw,
      };
    }
  }

  return empty;
}

export function decodeTossText(
  tossCode: string | undefined,
  team1Short: string,
  team2Short: string
): string {
  switch (tossCode) {
    case '1':
      return `${team1Short} OPT TO BAT`;
    case '2':
      return `${team1Short} OPT TO BOWL`;
    case '3':
      return `${team2Short} OPT TO BAT`;
    case '4':
      return `${team2Short} OPT TO BOWL`;
    default:
      return '';
  }
}

function parseScorecards(
  sc4: Record<string, unknown>[],
  entities: CrexEntityStore,
  format: MatchFormat,
  ballsPerOver: 5 | 6
): InningsScorecard[] {
  const urls = buildImageUrls(format);
  const inningsList: InningsScorecard[] = [];

  sc4.forEach((inn, idx) => {
    const teamFkey = String(inn.c ?? '');
    const teamEnt = entities.teams[teamFkey];
    const teamName = teamEnt?.n ?? teamFkey;
    const teamShort = teamEnt?.sn || teamName;

    // `d` in getSC4 is `"368/10(726"` (runs/wickets(totalBalls) or `"!720/9(996"`
    const dRaw = String(inn.d ?? '');
    const declaredFlag = dRaw.startsWith('!') || String(inn.x ?? '').endsWith('/1');
    const dClean = dRaw.replace(/^!/, '');
    const dParts = dClean.split(/[/()]+/).filter(Boolean);
    const totalRuns = Number.parseInt(dParts[0] ?? '0', 10) || 0;
    const totalWkts = Number.parseInt(dParts[1] ?? '0', 10) || 0;
    const totalBalls = Number.parseInt(dParts[2] ?? '0', 10) || 0;
    const overs = `${Math.floor(totalBalls / ballsPerOver)}.${totalBalls % ballsPerOver}`;

    // Captain / WK from `x`: "F0/KN/0"
    const xParts = String(inn.x ?? '').split('/');
    const captainKey = xParts[0] ?? '';
    const wkKey = xParts[1] ?? '';

    // Extras `e`: "byes.legByes.wides.noBalls.penalty"
    const eParts = String(inn.e ?? '0.0.0.0.0')
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
    const totalExtras = eParts.reduce((a, b) => a + b, 0);
    const extrasStr = `${totalExtras} (b ${eParts[0] ?? 0}, lb ${eParts[1] ?? 0}, w ${eParts[2] ?? 0}, nb ${eParts[3] ?? 0})`;

    const batters: ScorecardBatter[] = [];
    const yetToBat: YetToBatPlayer[] = [];

    if (Array.isArray(inn.b)) {
      for (const rawLine of inn.b) {
        const line = String(rawLine);
        const [statsSegment = '', careerSegment = ''] = line.split('/');
        const stats = statsSegment.split('.');
        const playerKey = stats[0] ?? '';
        if (!playerKey) continue;

        const playerName = entities.players[playerKey]?.n ?? playerKey;
        const shortName = formatPlayerShortName(playerName);
        const careerAvg = (careerSegment.split('-')[0] ?? '0.00').trim() || '0.00';

        // Yet-to-bat entries have only `<playerKey>/<avg>-<sr>` (stats.length <= 1)
        if (stats.length <= 1) {
          yetToBat.push({
            fkey: playerKey,
            name: playerName,
            shortName,
            average: careerAvg,
          });
          continue;
        }

        const runs = Number.parseInt(stats[1] ?? '0', 10) || 0;
        const balls = Number.parseInt(stats[2] ?? '0', 10) || 0;
        const fours = Number.parseInt(stats[3] ?? '0', 10) || 0;
        const sixes = Number.parseInt(stats[4] ?? '0', 10) || 0;
        const sr = balls > 0 ? ((runs / balls) * 100).toFixed(2) : '0.00';

        const dismissalCode = stats[7] ?? '';
        const bowlerKey = stats[8] ?? '';
        const fielderKey = stats[9] ?? '';
        const isNotOut = !dismissalCode;

        let dismissal = 'not out';
        if (!isNotOut) {
          const bName = bowlerKey ? formatPlayerShortName(entities.players[bowlerKey]?.n ?? bowlerKey) : '';
          const fName = fielderKey ? formatPlayerShortName(entities.players[fielderKey]?.n ?? fielderKey) : '';
          switch (dismissalCode) {
            case '1':
              dismissal = `b ${bName}`;
              break;
            case '2':
            case '7':
              dismissal = fName ? `c ${fName} b ${bName}` : `c & b ${bName}`;
              break;
            case '3':
              dismissal = `c & b ${bName}`;
              break;
            case '4':
              dismissal = fName ? `run out (${fName})` : 'run out';
              break;
            case '5':
              dismissal = `lbw b ${bName}`;
              break;
            case '8':
              dismissal = fName ? `st ${fName} b ${bName}` : `st b ${bName}`;
              break;
            default:
              dismissal = DISMISSAL_LABELS[dismissalCode] ?? 'out';
          }
        }

        batters.push({
          fkey: playerKey,
          name: playerName,
          shortName,
          runs,
          balls,
          fours,
          sixes,
          strikeRate: sr,
          dismissal,
          isNotOut,
          isCaptain: playerKey === captainKey,
          isWk: playerKey === wkKey,
          photoUrl: urls.playerPhoto(playerKey),
          jerseyUrl: urls.jersey(teamFkey),
        });
      }
    }

    // Bowlers `a`: ["AJ.92.174.8.4"] -> playerKey.runs.balls.maidens.wickets
    const bowlers: ScorecardBowler[] = [];
    // Find bowling team fkey from other innings or leave fallback
    const otherInn = sc4.find((x) => String(x.c ?? '') && String(x.c ?? '') !== teamFkey);
    const bowlTeamFkey = otherInn ? String(otherInn.c) : '';

    if (Array.isArray(inn.a)) {
      for (const rawLine of inn.a) {
        const parts = String(rawLine).split('.');
        const playerKey = parts[0] ?? '';
        if (!playerKey) continue;
        const runs = Number.parseInt(parts[1] ?? '0', 10) || 0;
        const balls = Number.parseInt(parts[2] ?? '0', 10) || 0;
        const maidens = Number.parseInt(parts[3] ?? '0', 10) || 0;
        const wickets = Number.parseInt(parts[4] ?? '0', 10) || 0;
        const ovStr = `${Math.floor(balls / ballsPerOver)}.${balls % ballsPerOver}`;
        const econ = balls > 0 ? ((runs / balls) * ballsPerOver).toFixed(2) : '0.00';
        const name = entities.players[playerKey]?.n ?? playerKey;

        bowlers.push({
          fkey: playerKey,
          name,
          shortName: formatPlayerShortName(name),
          overs: ovStr,
          maidens,
          runs,
          wickets,
          economy: econ,
          isBest: false,
          photoUrl: urls.playerPhoto(playerKey),
          jerseyUrl: urls.jersey(bowlTeamFkey || 'AD'),
        });
      }
    }

    // Mark the leading bowler (`BEST` badge — highest wickets, then lowest economy)
    if (bowlers.length > 0) {
      let bestIdx = 0;
      for (let i = 1; i < bowlers.length; i++) {
        const curr = bowlers[i]!;
        const best = bowlers[bestIdx]!;
        if (
          curr.wickets > best.wickets ||
          (curr.wickets === best.wickets && Number.parseFloat(curr.economy) < Number.parseFloat(best.economy))
        ) {
          bestIdx = i;
        }
      }
      if (bowlers[bestIdx]) {
        bowlers[bestIdx]!.isBest = true;
      }
    }

    inningsList.push({
      inningNumber: idx + 1,
      teamFkey,
      teamName,
      teamShort,
      score: `${totalRuns}-${totalWkts}${declaredFlag ? 'd' : ''}`,
      overs,
      extras: extrasStr,
      isDeclared: declaredFlag,
      batters,
      yetToBat,
      bowlers,
    });
  });

  return inningsList;
}

function parsePlayingXI(
  iv4: Record<string, unknown> | null,
  entities: CrexEntityStore,
  format: MatchFormat,
  leftTeamFkey: string,
  rightTeamFkey: string
): { left: PlayingXIPlayer[]; right: PlayingXIPlayer[]; captains: Record<string, string> } {
  const urls = buildImageUrls(format);
  const byTeam: Record<string, PlayingXIPlayer[]> = {};
  const captains: Record<string, string> = {};

  if (!iv4) return { left: [], right: [], captains };

  const teamKeys = String(iv4.t ?? '').split('-').filter(Boolean);
  const xParts = String(iv4.x ?? '').split('/');
  const cap1 = xParts[0] ?? '';
  const wk1 = xParts[1] ?? '';
  const cap2 = xParts[2] ?? '';
  const wk2 = xParts[3] ?? '';

  if (teamKeys[0] && cap1) captains[teamKeys[0]] = cap1;
  if (teamKeys[1] && cap2) captains[teamKeys[1]] = cap2;

  const tpSides = String(iv4.tp ?? '').split('/');
  teamKeys.forEach((teamFkey, sideIdx) => {
    const rawSide = tpSides[sideIdx] ?? '';
    const capKey = sideIdx === 0 ? cap1 : cap2;
    const wkKey = sideIdx === 0 ? wk1 : wk2;
    const list: PlayingXIPlayer[] = [];

    for (const item of rawSide.split('-').filter(Boolean)) {
      const cols = item.split('.');
      const playerKey = cols[0] ?? '';
      if (!playerKey) continue;
      const roleCode = cols[2] ?? '1';
      const isOverseas = cols[4] === '1';
      const isWk = playerKey === wkKey;
      const isCaptain = playerKey === capKey;
      const role: PlayingXIPlayer['role'] = isWk
        ? 'WK'
        : roleCode === '2'
          ? 'BOWL'
          : roleCode === '3'
            ? 'AR'
            : 'BAT';
      const name = entities.players[playerKey]?.n ?? playerKey;

      list.push({
        fkey: playerKey,
        name,
        shortName: formatPlayerShortName(name),
        role,
        isCaptain,
        isWk,
        isOverseas,
        photoUrl: urls.playerPhoto(playerKey),
        jerseyUrl: urls.jersey(teamFkey),
      });
    }
    byTeam[teamFkey] = list;
  });

  return {
    left: byTeam[leftTeamFkey] ?? [],
    right: byTeam[rightTeamFkey] ?? [],
    captains,
  };
}

export function buildMatchSnapshot(bundle: CrexRawBundle): MatchSnapshot {
  const { matchKey, sourceUrl, sv3, sc4, iv4, meta, ballFeeds, entities } = bundle;
  const s = sv3 ?? {};

  // 1. Decode `t.i` = "<formatStatus>/<inning0>.<tossOrder>[.<displayInning>]"
  const iRaw = typeof s.i === 'string' ? s.i : '';
  const iParts = iRaw.split(/[(/.]+/).filter((x) => x !== '');
  const w0 = Number.parseInt(iParts[0] ?? '0', 10) || 0;
  const dInning0 = Number.parseInt(iParts[1] ?? '0', 10) || 0;
  const inning = dInning0 + 1;
  const kOrder = (iParts[2] ?? '').replace(/\*/g, '');
  const iDisplay = iParts[3] !== undefined ? Number.parseInt(iParts[3].replace(/\*/g, ''), 10) : null;

  const isHundred = Number(s.hb) === 1;
  const ballsPerOver: 5 | 6 = isHundred ? 5 : 6;

  let format: MatchFormat = 'T20';
  let statusNum = 0; // 0 upcoming, 1 live, 2 finished
  let testDay: number | null = null;
  let scheduledBalls = 120;

  if (w0 < 12) {
    statusNum = Math.floor(w0 / 4);
    const mod = w0 % 4;
    if (mod === 0) {
      format = 'T20';
      scheduledBalls = 120;
    } else if (mod === 1) {
      format = 'ODI';
      scheduledBalls = 300;
    } else if (mod === 2) {
      format = 'TEST';
      testDay = 1;
      scheduledBalls = 0;
    } else {
      format = isHundred ? '100B' : 'T10';
      scheduledBalls = isHundred ? 100 : 60;
    }
  } else {
    format = 'TEST';
    testDay = Math.floor(w0 / 12) + 1;
    statusNum = Math.floor((w0 % 12) / 4);
    scheduledBalls = 0;
  }

  // Fallback format from `sv3.fo` or `iv4.fo` or `meta.ft` when `sv3` is absent (upcoming matches)
  if (!iRaw) {
    const foRaw = String(s.fo ?? iv4?.fo ?? '').toUpperCase();
    const metaFt = Number(meta?.ft ?? 0);
    if (foRaw.includes('TEST') || foRaw.includes('FIRST CLASS') || metaFt === 3) {
      format = 'TEST';
      scheduledBalls = 0;
    } else if (foRaw.includes('ODI') || foRaw.includes('ONE DAY') || metaFt === 1) {
      format = 'ODI';
      scheduledBalls = 300;
    } else if (foRaw.includes('100')) {
      format = '100B';
      scheduledBalls = 100;
    } else if (foRaw.includes('T10')) {
      format = 'T10';
      scheduledBalls = 60;
    } else {
      format = 'T20';
      scheduledBalls = 120;
    }
    const metaStatus = Number(meta?.s ?? 0);
    if (metaStatus === 1 || metaStatus === 2) statusNum = metaStatus;
  }

  // Toss delay code (`t.e` = "1".."5") forces status=0
  const tossDelayCode = String(s.e ?? '0');
  const tossDelayText = TOSS_DELAY_LABELS[tossDelayCode] ?? null;
  if (tossDelayText) statusNum = 0;

  const status: MatchStatus = statusNum === 2 ? 'finished' : statusNum === 1 ? 'live' : 'upcoming';
  const formatLabel = String(s.fo ?? iv4?.fo ?? format);

  // Powerplay check
  const dotParts = iRaw.split('.');
  let powerplayLabel: string | null = null;
  if (dotParts.length > 2 && dotParts[2]?.includes('*')) {
    const ppNum = dotParts[2].replace(/\*/g, '');
    powerplayLabel = format === 'ODI' ? `P${ppNum || '1'}` : 'PP';
  }

  // 2. Resolve Team Order (batting team ALWAYS placed on LEFT, bowling team on RIGHT!)
  const aParts = String(s.a ?? '').split('.').filter(Boolean);
  const iv4Teams = String(iv4?.t ?? '').split('-').filter(Boolean);
  const f0 = aParts[0] || iv4Teams[0] || String(meta?.team1_fkey ?? 'T1');
  const f1 = aParts[1] || iv4Teams[1] || String(meta?.team2_fkey ?? 'T2');

  let batFirst = f0;
  let bowlFirst = f1;
  if (kOrder === '2' || kOrder === '3') {
    batFirst = f1;
    bowlFirst = f0;
  }

  // Verbatim Crex `liveParseData` team swap logic across innings 1..6 (including Test follow-on!)
  let battingTeamFkey = batFirst;
  let bowlingTeamFkey = bowlFirst;
  if (dInning0 === 0) {
    battingTeamFkey = batFirst;
    bowlingTeamFkey = bowlFirst;
  } else if (dInning0 === 1) {
    battingTeamFkey = bowlFirst;
    bowlingTeamFkey = batFirst;
  } else if (dInning0 === 2) {
    if (format === 'TEST') {
      battingTeamFkey = iDisplay === 3 ? bowlFirst : batFirst;
      bowlingTeamFkey = iDisplay === 3 ? batFirst : bowlFirst;
    } else {
      battingTeamFkey = bowlFirst;
      bowlingTeamFkey = batFirst;
    }
  } else if (dInning0 === 3 || dInning0 === 4) {
    if (format === 'TEST') {
      battingTeamFkey = iDisplay === 4 ? batFirst : bowlFirst;
      bowlingTeamFkey = iDisplay === 4 ? bowlFirst : batFirst;
    } else {
      battingTeamFkey = batFirst;
      bowlingTeamFkey = bowlFirst;
    }
  }

  // 3. Parse Inning Scores (`j`, `k`, `J`, `K`) + Declarations (`w`)
  const wParts = typeof s.w === 'string' ? s.w.split('/') : [];
  const decl1 = wParts[3] === '1';
  const decl2 = wParts[4] === '1';
  const decl3 = wParts[5] === '1';
  const decl4 = wParts[6] === '1';

  const scoreJ = parseScoreString(s.j, ballsPerOver);
  const scoreK = parseScoreString(s.k, ballsPerOver);
  const scoreBigJ = parseScoreString(s.J, ballsPerOver);
  const scoreBigK = parseScoreString(s.K, ballsPerOver);

  let currentScore: ParsedScoreParts | null = null;
  let opponentScore: ParsedScoreParts | null = null;
  let currentDeclared = false;
  let oppDeclared = false;
  let leftPriorScore: string | undefined;
  let rightPriorScore: string | undefined;

  if (dInning0 === 0) {
    currentScore = scoreJ;
    opponentScore = scoreK;
    currentDeclared = decl1 || Boolean(scoreJ?.declared);
    oppDeclared = decl2 || Boolean(scoreK?.declared);
  } else if (dInning0 === 1) {
    currentScore = scoreK;
    opponentScore = scoreJ;
    currentDeclared = decl2 || Boolean(scoreK?.declared);
    oppDeclared = decl1 || Boolean(scoreJ?.declared);
  } else if (dInning0 === 2) {
    currentScore = scoreBigJ;
    opponentScore = scoreBigK;
    currentDeclared = decl3 || Boolean(scoreBigJ?.declared);
    oppDeclared = decl4 || Boolean(scoreBigK?.declared);
    // Assign prior 1st-innings totals to the matching teams
    if (battingTeamFkey === batFirst) {
      if (scoreJ) leftPriorScore = `${scoreJ.runs}${decl1 ? 'd' : ''}`;
      if (scoreK) rightPriorScore = `${scoreK.runs}-${scoreK.wickets}${decl2 ? 'd' : ''}`;
    } else {
      // Follow-on: bowlFirst batting again in 3rd inning
      if (scoreK) leftPriorScore = `${scoreK.runs}${decl2 ? 'd' : ''}`;
      if (scoreJ) rightPriorScore = `${scoreJ.runs}-${scoreJ.wickets}${decl1 ? 'd' : ''}`;
    }
  } else {
    currentScore = scoreBigK;
    opponentScore = scoreBigJ;
    currentDeclared = decl4 || Boolean(scoreBigK?.declared);
    oppDeclared = decl3 || Boolean(scoreBigJ?.declared);
    if (battingTeamFkey === bowlFirst) {
      if (scoreK) leftPriorScore = `${scoreK.runs}${decl2 ? 'd' : ''}`;
      if (scoreJ && scoreBigJ) {
        rightPriorScore = `${scoreJ.runs} & ${scoreBigJ.runs}-${scoreBigJ.wickets}${decl3 ? 'd' : ''}`;
      }
    } else {
      if (scoreJ) leftPriorScore = `${scoreJ.runs}${decl1 ? 'd' : ''}`;
      if (scoreK && scoreBigJ) {
        rightPriorScore = `${scoreK.runs} & ${scoreBigJ.runs}-${scoreBigJ.wickets}${decl3 ? 'd' : ''}`;
      }
    }
  }

  // 4. Target, DLS, CRR, RRR, Need X in Y balls
  let target: number | null = null;
  let isDls = false;
  if (typeof s.T === 'string' && s.T.trim()) {
    const tParts = s.T.split(/[(/.]+/);
    const maxB = Number.parseInt(tParts[0] ?? '0', 10);
    if (!Number.isNaN(maxB) && maxB > 0) scheduledBalls = maxB;
    const targetVal = Number.parseInt(tParts[1] ?? '0', 10);
    if (!Number.isNaN(targetVal) && targetVal > 0) {
      target = targetVal;
      isDls = String(s.sf ?? '') !== '20L';
    }
  } else if (dInning0 === 1 && scoreJ) {
    target = scoreJ.runs + 1;
  } else if (format === 'TEST' && dInning0 === 3 && scoreJ && scoreK && scoreBigJ) {
    const oppTotal =
      battingTeamFkey === bowlFirst ? scoreJ.runs + scoreBigJ.runs : scoreK.runs + scoreBigJ.runs;
    const batPrior = battingTeamFkey === bowlFirst ? scoreK.runs : scoreJ.runs;
    target = Math.max(1, oppTotal - batPrior + 1);
  }

  const crr =
    currentScore && currentScore.totalBalls > 0
      ? ((currentScore.runs / currentScore.totalBalls) * ballsPerOver).toFixed(2)
      : '0.00';

  const isChasing =
    (format !== 'TEST' && dInning0 === 1 && target !== null) ||
    (format === 'TEST' && dInning0 === 3 && target !== null);

  let runsNeeded: number | null = null;
  let ballsRemaining: number | null = null;
  let rrr: string | null = null;
  if (isChasing && target !== null && currentScore) {
    runsNeeded = Math.max(0, target - currentScore.runs);
    if (scheduledBalls > 0) {
      ballsRemaining = Math.max(0, scheduledBalls - currentScore.totalBalls);
      rrr = ballsRemaining > 0 ? ((runsNeeded / ballsRemaining) * ballsPerOver).toFixed(2) : '0.00';
    }
  }

  // 5. Test Match Day, Session, Break, Lead/Trail
  let testSession: number | null = null;
  let oversLeftToday: string | null = null;
  let breakLabel: string | null = null;
  let leadTrailText: string | null = null;

  if (format === 'TEST') {
    if (wParts[0]) {
      const sn = Number.parseInt(wParts[0], 10);
      if (!Number.isNaN(sn) && sn > 0) testSession = sn;
    }
    if (wParts[1] === '0') breakLabel = 'LUNCH BREAK';
    else if (wParts[1] === '1') breakLabel = 'TEA BREAK';
    else if (wParts[1] === '2') breakLabel = 'STUMPS';

    if (wParts[2] && currentScore) {
      const dayQuota = Number.parseInt(wParts[2], 10);
      if (!Number.isNaN(dayQuota) && dayQuota > 0) {
        const remBalls = Math.max(0, dayQuota * ballsPerOver - currentScore.totalBalls);
        oversLeftToday = `${Math.floor(remBalls / ballsPerOver)}.${remBalls % ballsPerOver}`;
      }
    }
  }

  // 6. Resolve Team Names, Logos, Jerseys, Captains
  const urls = buildImageUrls(format);
  const xiParsed = parsePlayingXI(iv4, entities, format, battingTeamFkey, bowlingTeamFkey);
  const gCaptains = String(s.g ?? '').split('.').filter(Boolean);
  // `sv3.g` is ordered according to `sv3.a` (`f0.f1`)
  const captainMap: Record<string, string> = { ...xiParsed.captains };
  if (gCaptains[0] && f0 && !captainMap[f0]) captainMap[f0] = gCaptains[0];
  if (gCaptains[1] && f1 && !captainMap[f1]) captainMap[f1] = gCaptains[1];

  const getTeamInfo = (fkey: string) => {
    const ent = entities.teams[fkey];
    const metaFallbackName =
      fkey === String(meta?.team1_fkey ?? '')
        ? String(meta?.team1 ?? '')
        : fkey === String(meta?.team2_fkey ?? '')
          ? String(meta?.team2 ?? '')
          : '';
    const name = ent?.n || metaFallbackName || fkey;
    const shortName = (ent?.sn || name.slice(0, 4)).toUpperCase();
    const color = parseTeamColor(ent?.cc, '#1d4ed8');
    const capFkey = captainMap[fkey];
    const capName = capFkey ? entities.players[capFkey]?.n ?? capFkey : undefined;
    return { name, shortName, color, capFkey, capName };
  };

  const leftInfo = getTeamInfo(battingTeamFkey);
  const rightInfo = getTeamInfo(bowlingTeamFkey);

  // Compute Test Match Lead / Trail text now that we know team shorts
  if (format === 'TEST' && currentScore) {
    if (dInning0 === 1 && scoreJ) {
      const diff = currentScore.runs - scoreJ.runs;
      leadTrailText =
        diff < 0
          ? `${leftInfo.shortName} TRAIL BY ${Math.abs(diff)} RUNS`
          : diff > 0
            ? `${leftInfo.shortName} LEAD BY ${diff} RUNS`
            : 'SCORES LEVEL';
    } else if (dInning0 === 2 && scoreJ && scoreK) {
      const batTotal = (battingTeamFkey === batFirst ? scoreJ.runs : scoreK.runs) + currentScore.runs;
      const bowlTotal = battingTeamFkey === batFirst ? scoreK.runs : scoreJ.runs;
      const diff = batTotal - bowlTotal;
      leadTrailText =
        diff < 0
          ? `${leftInfo.shortName} TRAIL BY ${Math.abs(diff)} RUNS`
          : diff > 0
            ? `${leftInfo.shortName} LEAD BY ${diff} RUNS`
            : 'SCORES LEVEL';
    } else if (dInning0 === 3 && runsNeeded !== null) {
      leadTrailText = `${leftInfo.shortName} NEED ${runsNeeded} RUNS TO WIN`;
    }
  }

  // Format Display Scores for Left (Batting) & Right (Bowling)
  const leftDisplayScore =
    status === 'upcoming'
      ? '-/-'
      : currentScore
        ? leftPriorScore
          ? `${leftPriorScore} & ${currentScore.runs}-${currentScore.wickets}${currentDeclared ? 'd' : ''}`
          : `${currentScore.runs}-${currentScore.wickets}${currentDeclared ? 'd' : ''}`
        : '-/-';

  const leftDisplayOvers =
    status === 'upcoming' || !currentScore ? '' : `(${currentScore.oversStr})`;

  const rightDisplayScore =
    rightPriorScore
      ? rightPriorScore
      : opponentScore
        ? `${opponentScore.runs}-${opponentScore.wickets}${oppDeclared ? 'd' : ''}`
        : '-/-';

  const rightDisplayOvers =
    !rightPriorScore && opponentScore ? `(${opponentScore.oversStr})` : '';

  const leftTeam: TeamDisplay = {
    fkey: battingTeamFkey,
    name: leftInfo.name,
    shortName: leftInfo.shortName,
    score: leftDisplayScore,
    overs: leftDisplayOvers,
    priorInningsScore: leftPriorScore,
    logoUrl: urls.teamLogo(battingTeamFkey),
    jerseyUrl: urls.jersey(battingTeamFkey),
    primaryColor: leftInfo.color,
    isBatting: true,
    isDeclared: currentDeclared,
    captainFkey: leftInfo.capFkey,
    captainName: leftInfo.capName,
    captainPhotoUrl: leftInfo.capFkey ? urls.playerPhoto(leftInfo.capFkey) : undefined,
  };

  const rightTeam: TeamDisplay = {
    fkey: bowlingTeamFkey,
    name: rightInfo.name,
    shortName: rightInfo.shortName,
    score: rightDisplayScore,
    overs: rightDisplayOvers,
    priorInningsScore: rightPriorScore,
    logoUrl: urls.teamLogo(bowlingTeamFkey),
    jerseyUrl: urls.jersey(bowlingTeamFkey),
    primaryColor: rightInfo.color,
    isBatting: false,
    isDeclared: oppDeclared,
    captainFkey: rightInfo.capFkey,
    captainName: rightInfo.capName,
    captainPhotoUrl: rightInfo.capFkey ? urls.playerPhoto(rightInfo.capFkey) : undefined,
  };

  // 7. Toss text & Status Banner text
  const iv4T1Info = getTeamInfo(iv4Teams[0] || f0);
  const iv4T2Info = getTeamInfo(iv4Teams[1] || f1);
  const tossCode = (typeof iv4?.y === 'string' && iv4.y) || kOrder || undefined;
  const tossText = decodeTossText(tossCode, iv4T1Info.shortName, iv4T2Info.shortName);

  const rawB = typeof s.B === 'string' ? s.B.trim() : '';
  const resultText =
    status === 'finished' && rawB.length > 3 ? rawB.replace(/🏆/g, '').trim() : null;

  let statusBannerText = tossText || `${leftTeam.shortName} VS ${rightTeam.shortName}`;
  if (tossDelayText) {
    statusBannerText = tossDelayText;
  } else if (resultText) {
    statusBannerText = resultText.toUpperCase();
  } else if (isChasing && runsNeeded !== null && ballsRemaining !== null && format !== 'TEST') {
    statusBannerText = `${leftTeam.shortName} NEED ${runsNeeded} RUNS IN ${ballsRemaining} BALLS`;
  } else if (format === 'TEST' && leadTrailText) {
    const dayPrefix = testDay ? `DAY ${testDay}${testSession ? ` · S${testSession}` : ''}: ` : '';
    statusBannerText = `${dayPrefix}${leadTrailText}`;
  } else if (format === 'TEST' && testDay) {
    const sess = testSession ? ` · SESSION ${testSession}` : '';
    statusBannerText = `DAY ${testDay}${sess}${tossText ? ` · ${tossText}` : ''}`;
  }

  // 8. Parse Batsmen (`p`, `q`, `r`, `s`, `t`)
  const pParts = String(s.p ?? '').split('.');
  const buildBatsman = (
    rawKey: string | undefined,
    rawScore: unknown,
    rawBounds: unknown
  ): BatsmanState | null => {
    const key = (rawKey ?? '').replace(/\*/g, '').trim();
    if (!key) return null;
    const scoreStr = String(rawScore ?? '0.0');
    const isStriker = scoreStr.includes('*');
    const scoreParts = scoreStr.replace(/\*/g, '').split('.');
    const runs = Number.parseInt(scoreParts[0] ?? '0', 10) || 0;
    const balls = Number.parseInt(scoreParts[1] ?? '0', 10) || 0;
    const boundParts = String(rawBounds ?? '0.0').split('.');
    const fours = Number.parseInt(boundParts[0] ?? '0', 10) || 0;
    const sixes = Number.parseInt(boundParts[1] ?? '0', 10) || 0;
    const isImpact = boundParts[4] === '1';
    const sr = balls > 0 ? ((runs / balls) * 100).toFixed(2) : '0.00';
    const name = entities.players[key]?.n ?? key;

    return {
      fkey: key,
      name,
      shortName: formatPlayerShortName(name),
      runs,
      balls,
      fours,
      sixes,
      strikeRate: sr,
      isStriker,
      isImpact,
      photoUrl: urls.playerPhoto(key),
      jerseyUrl: urls.jersey(battingTeamFkey),
    };
  };

  const bat1 = buildBatsman(pParts[0], s.q, s.r);
  const bat2 = buildBatsman(pParts[1], s.s, s.t);

  // 9. Parse Current Bowler (`b`, `c`) + Scorecards (`sc4`)
  const allInnings = parseScorecards(sc4, entities, format, ballsPerOver);
  const currentInningsScorecard =
    allInnings[inning - 1] ?? allInnings[allInnings.length - 1] ?? null;

  let bowler: BowlerState | null = null;
  const bowlerKey = String(s.b ?? '').trim();
  if (bowlerKey) {
    const cParts = String(s.c ?? '0.0.0').split('.');
    const runsConceded = Number.parseInt(cParts[0] ?? '0', 10) || 0;
    const ballsBowled = Number.parseInt(cParts[1] ?? '0', 10) || 0;
    const wickets = Number.parseInt(cParts[2] ?? '0', 10) || 0;
    const isImpact = cParts[4] === '1';
    const overs = `${Math.floor(ballsBowled / ballsPerOver)}.${ballsBowled % ballsPerOver}`;
    const econ = ballsBowled > 0 ? ((runsConceded / ballsBowled) * ballsPerOver).toFixed(2) : '0.00';
    const name = entities.players[bowlerKey]?.n ?? bowlerKey;
    const scBowler = currentInningsScorecard?.bowlers.find((b) => b.fkey === bowlerKey);

    bowler = {
      fkey: bowlerKey,
      name,
      shortName: formatPlayerShortName(name),
      wickets,
      runsConceded,
      overs,
      economy: econ,
      maidens: scBowler?.maidens ?? 0,
      isImpact,
      photoUrl: urls.playerPhoto(bowlerKey),
      jerseyUrl: urls.jersey(bowlingTeamFkey),
    };
  }

  // 10. Parse Last Wicket (`x`) & Partnership (`pb` + `x`)
  const xParts = typeof s.x === 'string' && s.x.trim() ? s.x.split('.') : [];
  const hasWicket = (currentScore?.wickets ?? 0) > 0 && xParts.length >= 3 && Boolean(xParts[0]);
  let lastWicket: LastWicketInfo = {
    available: false,
    playerFkey: '',
    playerName: '',
    shortName: '',
    runs: 0,
    balls: 0,
    dismissalText: '',
    formatted: 'N/A',
  };

  if (hasWicket) {
    const lwKey = xParts[0] ?? '';
    const lwName = entities.players[lwKey]?.n ?? lwKey;
    const lwShort = formatPlayerShortName(lwName);
    const lwRuns = Number.parseInt(xParts[1] ?? '0', 10) || 0;
    const lwBalls = Number.parseInt(xParts[2] ?? '0', 10) || 0;
    const lwCode = xParts[5] ?? '';
    const dismissalText = DISMISSAL_LABELS[lwCode] ?? '';
    lastWicket = {
      available: true,
      playerFkey: lwKey,
      playerName: lwName,
      shortName: lwShort,
      runs: lwRuns,
      balls: lwBalls,
      dismissalText,
      formatted: `${lwShort} ${lwRuns} (${lwBalls})`,
    };
  }

  const pbExtra = /^\d+$/.test(String(s.pb ?? '').trim()) ? Number.parseInt(String(s.pb), 10) : 0;
  let partnership: PartnershipInfo = {
    available: false,
    runs: 0,
    balls: 0,
    formatted: '0 (0)',
  };

  if (currentScore && (currentScore.runs > 0 || currentScore.totalBalls > 0)) {
    if (currentScore.wickets === 0) {
      partnership = {
        available: true,
        runs: currentScore.runs,
        balls: currentScore.totalBalls + pbExtra,
        formatted: `${currentScore.runs} (${currentScore.totalBalls + pbExtra})`,
      };
    } else if (xParts.length >= 5) {
      const fallRuns = Number.parseInt(xParts[3] ?? '0', 10);
      const fallBalls = Number.parseInt(xParts[4] ?? '0', 10);
      if (!Number.isNaN(fallRuns) && !Number.isNaN(fallBalls)) {
        const pRuns = Math.max(0, currentScore.runs - fallRuns);
        const pBalls = Math.max(0, currentScore.totalBalls - fallBalls + pbExtra);
        partnership = {
          available: true,
          runs: pRuns,
          balls: pBalls,
          formatted: `${pRuns} (${pBalls})`,
        };
      }
    }
  }

  // 11. Recent Overs + Delivery Fingerprint
  const recentOvers = parseRecentOvers(s, ballsPerOver, currentScore);
  const latestOver = recentOvers[recentOvers.length - 1];
  const latestBallIdx = latestOver
    ? latestOver.balls.reduce((lastIdx, b, i) => (b.kind !== 'pending' ? i : lastIdx), -1)
    : -1;
  const latestBallToken =
    latestOver && latestBallIdx >= 0 ? latestOver.balls[latestBallIdx]?.display ?? '' : '';
  const lastDeliveryKey = [
    inning,
    currentScore?.runs ?? 0,
    currentScore?.wickets ?? 0,
    currentScore?.totalBalls ?? 0,
    latestOver?.overNumber ?? 0,
    latestBallIdx,
    latestBallToken,
  ].join(':');

  // 12. Win Probability
  const winProbability = parseWinProbability(s, format, leftTeam, rightTeam);

  // 13. Yet-to-bat list (from current innings scorecard, fallback to Playing XI players who haven't batted)
  let yetToBat: YetToBatPlayer[] = currentInningsScorecard?.yetToBat ?? [];
  if (yetToBat.length === 0 && xiParsed.left.length > 0) {
    const activeKeys = new Set(
      [
        bat1?.fkey,
        bat2?.fkey,
        ...(currentInningsScorecard?.batters.map((b) => b.fkey) ?? []),
      ].filter(Boolean)
    );
    yetToBat = xiParsed.left
      .filter((p) => !activeKeys.has(p.fkey))
      .map((p) => ({
        fkey: p.fkey,
        name: p.name,
        shortName: p.shortName,
        average: '--',
      }));
  }

  // 14. Match Info & Latest Commentary
  const seriesKey = String(s.sf ?? iv4?.s ?? meta?.sf ?? '');
  const seriesEnt = entities.series[seriesKey];
  const venueKey = String(iv4?.v ?? '');
  const venueName = String(meta?.v ?? entities.venues[venueKey]?.n ?? '');
  const weather = (iv4?.wU as Record<string, string> | undefined) ?? undefined;

  const matchInfo: MatchInfoDetails = {
    seriesName: seriesEnt?.n || seriesEnt?.sn || 'LIVE CRICKET MATCH',
    matchNumberLabel: String(s.mn ?? meta?.mn ?? ''),
    venue: venueName,
    startTimeIso: String(iv4?.dt ?? meta?.t ?? ''),
    tossText,
    weatherTemp: weather?.crT,
    weatherCondition: weather?.wC,
    weatherHumidity: weather?.hum ? `${weather.hum}%` : undefined,
    weatherRainChance: weather?.rP,
    weatherWind: weather?.wS,
    headToHead: typeof iv4?.hth === 'string' ? iv4.hth : undefined,
    broadcastInfo: typeof iv4?.b === 'string' ? iv4.b : undefined,
  };

  let playerOfMatch: string | null = null;
  if (typeof s.mm === 'string' && s.mm.trim()) {
    const mmParts = s.mm.split('.');
    const mmName = entities.players[mmParts[0] ?? '']?.n ?? mmParts[0] ?? '';
    const mmTeam = entities.teams[mmParts[1] ?? '']?.sn ?? '';
    if (mmName) {
      playerOfMatch = mmTeam ? `${mmName} (${mmTeam})` : mmName;
    }
  }

  const latestFeed = ballFeeds.find((f) => typeof f.c2 === 'string' && f.c2.trim().length > 0);
  const latestCommentary = latestFeed
    ? `${String(latestFeed.c1 ?? '').trim()}: ${String(latestFeed.c2 ?? '')
        .replace(/&nbsp;/g, ' ')
        .replace(/<[^>]*>/g, '')
        .trim()}`
    : null;

  const centerBadge = decodeCenterBadge(s.B, status, breakLabel, resultText);

  return {
    matchKey,
    sourceUrl,
    format,
    formatLabel,
    status,
    inning,
    ballsPerOver,
    powerplayLabel,
    crr,
    rrr,
    statusBannerText,
    resultText,
    playerOfMatch,
    centerBadge,
    leftTeam,
    rightTeam,
    chase: {
      isChasing,
      target,
      runsNeeded,
      ballsRemaining,
      rrr,
      isDls,
      battingTeamShort: leftTeam.shortName,
    },
    testInfo: {
      day: testDay,
      session: testSession,
      oversLeftToday,
      breakLabel,
      leadTrailText,
    },
    recentOvers,
    winProbability,
    lastWicket,
    partnership,
    batsmen: [bat1, bat2],
    bowler,
    yetToBat,
    currentInningsScorecard,
    allInnings,
    playingXI: {
      left: xiParsed.left,
      right: xiParsed.right,
    },
    matchInfo,
    latestCommentary,
    lastDeliveryKey,
    updatedAt: new Date().toISOString(),
  };
}

export function parseLiveMatchesList(
  rawMap: Record<string, Record<string, unknown>>,
  entities: CrexEntityStore
): CrexLiveMatchItem[] {
  const items: CrexLiveMatchItem[] = [];

  for (const [matchKey, m] of Object.entries(rawMap)) {
    const t1Key = String(m.b ?? '');
    const t2Key = String(m.c ?? '');
    const sKey = String(m.q ?? '').replace(/^\^/, '');
    if (!t1Key || !t2Key) continue;

    const t1 = entities.teams[t1Key];
    const t2 = entities.teams[t2Key];
    const series = entities.series[sKey];

    const t1Name = t1?.n ?? t1Key;
    const t1Short = t1?.sn ?? t1Name;
    const t2Name = t2?.n ?? t2Key;
    const t2Short = t2?.sn ?? t2Name;

    const format = String(m.fo ?? 'T20');
    const ballsPerOver: 5 | 6 = format.toUpperCase().includes('100') ? 5 : 6;
    const p1 = parseScoreString(m.j, ballsPerOver);
    const p2 = parseScoreString(m.k, ballsPerOver);
    const p3 = parseScoreString(m.l, ballsPerOver);
    const p4 = parseScoreString(m.m, ballsPerOver);

    const score1 = p1
      ? `${p1.scoreStr} (${p1.oversStr})${p3 ? ` & ${p3.scoreStr}` : ''}`
      : '';
    const score2 = p2
      ? `${p2.scoreStr} (${p2.oversStr})${p4 ? ` & ${p4.scoreStr}` : ''}`
      : '';

    // Status inference from `n` (w0 code) + `res` + `finishTime`
    const nCode = Number(m.n ?? 0);
    const resStr = String(m.res ?? '');
    let status: MatchStatus = 'upcoming';
    if (m.finishTime || /won by|drawn|tied|abandoned/i.test(resStr)) {
      status = 'finished';
    } else if (
      (nCode >= 4 && nCode < 8) ||
      (nCode >= 12 && Math.floor((nCode % 12) / 4) === 1) ||
      Boolean(p1 && !resStr.toLowerCase().includes('won'))
    ) {
      status = 'live';
    } else if (nCode >= 8 && nCode < 12) {
      status = 'finished';
    }

    const slugBase = `${t1Short}-vs-${t2Short}-match-updates`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const slug = `${slugBase}-${matchKey}`;

    items.push({
      matchKey,
      format,
      status,
      team1Fkey: t1Key,
      team2Fkey: t2Key,
      team1Name: t1Name,
      team1Short: t1Short,
      team2Name: t2Name,
      team2Short: t2Short,
      score1,
      score2,
      statusText: resStr || (status === 'live' ? 'Live' : status === 'upcoming' ? 'Upcoming' : 'Completed'),
      seriesName: series?.n ?? series?.sn ?? format,
      startTimeMs: typeof m.ti === 'number' ? m.ti : null,
      crexUrl: `https://crex.com/cricket-live-score/${slug}`,
    });
  }

  // Sort: live first, then upcoming (earliest first), then finished
  const order: Record<MatchStatus, number> = { live: 0, upcoming: 1, finished: 2 };
  return items.sort((a, b) => {
    const diff = order[a.status] - order[b.status];
    if (diff !== 0) return diff;
    return (a.startTimeMs ?? 0) - (b.startTimeMs ?? 0);
  });
}
