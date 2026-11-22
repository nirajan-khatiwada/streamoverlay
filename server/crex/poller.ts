import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type {
  BallEntry,
  BroadcastEvent,
  ConnectionStatus,
  CrexLiveMatchItem,
  MatchSnapshot,
  OverlayViewMode,
  StudioConfig,
} from '../../shared/types.js';
import { ConfigStore, loadLastMatch, saveLastMatch } from '../config.js';
import { logger } from '../utils/logger.js';
import { CrexClient } from './client.js';
import { BroadcastEventDetector } from './eventDetector.js';
import {
  buildMatchSnapshot,
  collectEntityKeysFromRaw,
  parseLiveMatchesList,
} from './parser.js';
import { parseCrexMatchInput } from './urlParser.js';
import {
  fetchLiveSubscriberCount,
  resolveYoutubeChannel,
  type ResolvedYoutubeChannel,
} from '../youtube/subTracker.js';

export interface PollerEvents {
  snapshot: (snap: MatchSnapshot) => void;
  event: (evt: BroadcastEvent) => void;
  status: (status: ConnectionStatus) => void;
  config: (config: StudioConfig) => void;
  subAlert: (alert: { id: string; subscriberName: string; message: string; timestamp: string }) => void;
}

export class MatchOrchestrator extends EventEmitter {
  private client = new CrexClient();
  private detector = new BroadcastEventDetector();
  private configStore: ConfigStore;

  private activeMatchKey: string | null = null;
  private activeSourceUrl: string | null = null;
  private currentSnapshot: MatchSnapshot | null = null;
  private recentEvents: BroadcastEvent[] = [];

  private lastIv4: Record<string, unknown> | null = null;
  private lastMeta: Record<string, unknown> | null = null;
  private lastSc4: Record<string, unknown>[] = [];
  private lastBallFeeds: Record<string, unknown>[] = [];
  private lastMetaFetchedAt = 0;

  private pollTimer: NodeJS.Timeout | null = null;
  private ytTimer: NodeJS.Timeout | null = null;
  private ytSyncInFlight = false;
  private ytPreferredProvider: 'socialcounts' | 'mixerno' = 'socialcounts';
  private simTimer: NodeJS.Timeout | null = null;
  private autoCardTimer: NodeJS.Timeout | null = null;
  private isPollingTick = false;

  private pollCount = 0;
  private notModifiedCount = 0;
  private lastPollAt: string | null = null;
  private lastError: string | null = null;
  private clientsCount = 0;
  private simulatorRunning = false;

  constructor(configStore: ConfigStore) {
    super();
    this.configStore = configStore;
    this.startYoutubeSubPoller();
  }

  async bootstrapLastMatch(): Promise<void> {
    const saved = loadLastMatch();
    if (saved) {
      try {
        await this.attachMatch(saved.sourceUrl || saved.matchKey);
        return;
      } catch (err) {
        logger.warn('Failed to re-attach saved match on startup', { saved, err });
      }
    }
    // Try auto-attaching to the top live match from Crex if none was saved
    try {
      const list = await this.fetchLiveMatches();
      const firstLive = list.find((m) => m.status === 'live') ?? list[0];
      if (firstLive) {
        await this.attachMatch(firstLive.crexUrl);
      }
    } catch (err) {
      logger.warn('No initial live match auto-attached at startup', { err });
    }
  }

  setClientsCount(count: number): void {
    this.clientsCount = count;
    this.emitStatus();
  }

  getSnapshot(): MatchSnapshot | null {
    return this.currentSnapshot;
  }

  getRecentEvents(): BroadcastEvent[] {
    return [...this.recentEvents];
  }

  getStatus(): ConnectionStatus {
    return {
      connected: Boolean(this.activeMatchKey && !this.lastError),
      activeMatchKey: this.activeMatchKey,
      sourceUrl: this.activeSourceUrl,
      lastPollAt: this.lastPollAt,
      lastError: this.lastError,
      pollCount: this.pollCount,
      notModifiedCount: this.notModifiedCount,
      clientsCount: this.clientsCount,
      simulatorRunning: this.simulatorRunning,
    };
  }

  async fetchLiveMatches(): Promise<CrexLiveMatchItem[]> {
    const rawMap = await this.client.getLiveMatchesRaw();
    const tKeys = new Set<string>();
    const sKeys = new Set<string>();
    for (const m of Object.values(rawMap)) {
      if (typeof m.b === 'string' && m.b) tKeys.add(m.b);
      if (typeof m.c === 'string' && m.c) tKeys.add(m.c);
      if (typeof m.q === 'string' && m.q) sKeys.add(m.q.replace(/^\^/, ''));
    }
    const entities = await this.client.ensureEntitiesResolved({ t: tKeys, s: sKeys });
    return parseLiveMatchesList(rawMap, entities);
  }

  async attachMatch(rawInput: string): Promise<MatchSnapshot> {
    const parsed = parseCrexMatchInput(rawInput);
    this.stopPolling();
    this.stopSimulator();

    this.activeMatchKey = parsed.matchKey;
    this.activeSourceUrl = parsed.canonicalUrl;
    this.lastIv4 = null;
    this.lastMeta = null;
    this.lastSc4 = [];
    this.lastBallFeeds = [];
    this.lastMetaFetchedAt = 0;
    this.lastError = null;
    this.pollCount = 0;
    this.notModifiedCount = 0;

    this.client.clearMatchEtags(parsed.matchKey);
    this.detector.reset();

    saveLastMatch(parsed.matchKey, parsed.canonicalUrl);
    logger.info('Attaching Crex match', { matchKey: parsed.matchKey, url: parsed.canonicalUrl });

    const snap = await this.pollOnce(true);
    this.scheduleNextPoll();
    return snap;
  }

  async forceRefresh(): Promise<MatchSnapshot | null> {
    if (!this.activeMatchKey) return null;
    this.client.clearMatchEtags(this.activeMatchKey);
    return this.pollOnce(true);
  }

  onConfigChanged(): void {
    const cfg = this.configStore.getPublic();
    this.emit('config', cfg);
    if (this.activeMatchKey && !this.simulatorRunning) {
      this.stopPolling();
      this.scheduleNextPoll();
    }
  }

  triggerManualEvent(
    type: 'FOUR' | 'SIX' | 'WICKET' | 'OVER' | 'MILESTONE_50' | 'MILESTONE_100',
    customSubtitle?: string
  ): BroadcastEvent {
    const metaMap = {
      FOUR: { title: 'FOUR', soundKey: 'four' as const, stinger: true, durationMs: 2600 },
      SIX: { title: 'SIX', soundKey: 'six' as const, stinger: true, durationMs: 2900 },
      WICKET: { title: 'WICKET', soundKey: 'wicket' as const, stinger: true, durationMs: 3000 },
      OVER: { title: 'OVER', soundKey: 'over' as const, stinger: false, durationMs: 1200 },
      MILESTONE_50: { title: 'FIFTY!', soundKey: 'milestone' as const, stinger: true, durationMs: 2800 },
      MILESTONE_100: { title: 'CENTURY!', soundKey: 'milestone' as const, stinger: true, durationMs: 3200 },
    }[type];

    const evt: BroadcastEvent = {
      id: `evt_${crypto.randomUUID().slice(0, 8)}`,
      type,
      title: metaMap.title,
      subtitle: customSubtitle,
      soundKey: metaMap.soundKey,
      showFullScreenStinger: metaMap.stinger,
      durationMs: metaMap.durationMs,
      timestamp: new Date().toISOString(),
    };
    this.pushEvent(evt);
    return evt;
  }

  triggerSubscriberAlert(subscriberName: string, incrementCount = true): {
    id: string;
    subscriberName: string;
    message: string;
    timestamp: string;
  } {
    const cleanName = (subscriberName || 'NEW VIEWER').trim().toUpperCase().slice(0, 32);
    if (incrementCount) {
      const current = this.configStore.get().subscriberWidget.count;
      const updated = this.configStore.update({
        subscriberWidget: { count: current + 1 },
      });
      this.emit('config', updated);
    }

    const alert = {
      id: `sub_${crypto.randomUUID().slice(0, 8)}`,
      subscriberName: cleanName,
      message: `${cleanName} SUBSCRIBED TO THE CHANNEL!`,
      timestamp: new Date().toISOString(),
    };
    this.emit('subAlert', alert);

    this.pushEvent({
      id: `evt_${crypto.randomUUID().slice(0, 8)}`,
      type: 'SUB_ALERT',
      title: 'NEW SUBSCRIBER',
      subtitle: alert.message,
      soundKey: 'subAlert',
      showFullScreenStinger: false,
      durationMs: 4500,
      timestamp: alert.timestamp,
    });

    return alert;
  }

  /**
   * Live Simulator — lets the streamer preview dynamic ball-by-ball updates,
   * striker swap, win probability shifts, stingers, and SFX even between matches.
   */
  toggleSimulator(enable: boolean): boolean {
    if (enable) {
      this.startSimulator();
    } else {
      this.stopSimulator();
      if (this.activeMatchKey) {
        this.scheduleNextPoll();
      }
    }
    this.emitStatus();
    return this.simulatorRunning;
  }

  private startSimulator(): void {
    this.stopPolling();
    if (this.simTimer) clearInterval(this.simTimer);
    this.simulatorRunning = true;
    if (!this.currentSnapshot) {
      this.currentSnapshot = this.createDemoSnapshot();
      this.detector.reset();
      this.detector.evaluate(this.currentSnapshot);
      this.emit('snapshot', this.currentSnapshot);
    }
    const sequence: Array<'BALL' | '0' | '1' | '2' | '4' | '6' | 'W' | 'WD'> = [
      'BALL',
      '1',
      'BALL',
      '4',
      'BALL',
      '0',
      'BALL',
      '6',
      'BALL',
      'W',
      'BALL',
      '2',
    ];
    let idx = 0;
    this.simTimer = setInterval(() => {
      const action = sequence[idx % sequence.length]!;
      idx++;
      this.stepSimulator(action);
    }, 4500);
  }

  stopSimulator(): void {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    this.simulatorRunning = false;
  }

  stepSimulator(outcome: 'BALL' | '0' | '1' | '2' | '3' | '4' | '6' | 'W' | 'WD' | 'NB'): MatchSnapshot {
    const base = structuredClone(this.currentSnapshot ?? this.createDemoSnapshot());
    base.status = 'live';
    base.isSimulated = true;
    base.updatedAt = new Date().toISOString();

    if (outcome === 'BALL') {
      // If a batsman was just out in the previous step, bring in the new incoming batsman now!
      const outIdx = base.batsmen.findIndex((b) => b?.isOut);
      if (outIdx >= 0) {
        const target = base.batsmen[outIdx];
        const other = base.batsmen[outIdx === 0 ? 1 : 0];
        if (target) {
          const nextUp = base.yetToBat.shift();
          target.fkey = nextUp?.fkey || `NEW_${Date.now()}`;
          target.name = nextUp?.name || 'New Batsman';
          target.shortName = nextUp?.shortName || 'NEW BATTER';
          target.photoUrl = `/api/proxy-image?kind=player&key=${encodeURIComponent(target.fkey)}`;
          target.runs = 0;
          target.balls = 0;
          target.fours = 0;
          target.sixes = 0;
          target.strikeRate = '0.00';
          target.isOut = false;
          target.isStriker = !other?.isStriker;
        }
      }
      base.centerBadge = { text: 'BALL', tone: 'ball', rawCode: 'B' };
      this.currentSnapshot = base;
      this.emit('snapshot', base);
      return base;
    }

    // If a dismissed batsman is still displayed in B&W from the prior wicket, replace them now as the next delivery happens
    const prevOutIdx = base.batsmen.findIndex((b) => b?.isOut);
    if (prevOutIdx >= 0) {
      const target = base.batsmen[prevOutIdx];
      const other = base.batsmen[prevOutIdx === 0 ? 1 : 0];
      if (target) {
        const nextUp = base.yetToBat.shift();
        target.fkey = nextUp?.fkey || `NEW_${Date.now()}`;
        target.name = nextUp?.name || 'New Batsman';
        target.shortName = nextUp?.shortName || 'NEW BATTER';
        target.photoUrl = `/api/proxy-image?kind=player&key=${encodeURIComponent(target.fkey)}`;
        target.runs = 0;
        target.balls = 0;
        target.fours = 0;
        target.sixes = 0;
        target.strikeRate = '0.00';
        target.isOut = false;
        target.isStriker = !other?.isStriker;
      }
    }

    // Parse current score & overs
    const scoreTail = base.leftTeam.score.includes('&')
      ? base.leftTeam.score.split('&').pop()!.trim()
      : base.leftTeam.score;
    const [runsStr = '0', wktsStr = '0'] = scoreTail.replace(/d/g, '').split('-');
    let runs = Number.parseInt(runsStr, 10) || 0;
    let wkts = Number.parseInt(wktsStr, 10) || 0;
    const ovClean = base.leftTeam.overs.replace(/[()]/g, '');
    const [ovWStr = '0', ovBStr = '0'] = ovClean.split('.');
    let ovWhole = Number.parseInt(ovWStr, 10) || 0;
    let ovBalls = Number.parseInt(ovBStr, 10) || 0;

    const isExtra = outcome === 'WD' || outcome === 'NB';
    const isWicket = outcome === 'W';
    const addedRuns = isExtra ? 1 : isWicket ? 0 : Number.parseInt(outcome, 10) || 0;

    runs += addedRuns;
    if (isWicket) wkts = Math.min(10, wkts + 1);
    if (!isExtra) {
      ovBalls += 1;
      if (ovBalls >= base.ballsPerOver) {
        ovWhole += 1;
        ovBalls = 0;
      }
    }

    const prefix = base.leftTeam.score.includes('&')
      ? `${base.leftTeam.score.split('&')[0]!.trim()} & `
      : '';
    base.leftTeam.score = `${prefix}${runs}-${wkts}`;
    base.leftTeam.overs = `(${ovWhole}.${ovBalls})`;

    const totalBalls = ovWhole * base.ballsPerOver + ovBalls;
    base.crr = totalBalls > 0 ? ((runs / totalBalls) * base.ballsPerOver).toFixed(2) : '0.00';

    if (base.chase.isChasing && base.chase.target !== null) {
      const need = Math.max(0, base.chase.target - runs);
      const remBalls = Math.max(0, 120 - totalBalls);
      base.chase.runsNeeded = need;
      base.chase.ballsRemaining = remBalls;
      base.chase.rrr = remBalls > 0 ? ((need / remBalls) * base.ballsPerOver).toFixed(2) : '0.00';
      base.rrr = base.chase.rrr;
      base.statusBannerText = `${base.leftTeam.shortName} NEED ${need} RUNS IN ${remBalls} BALLS`;
    }

    // Update striker stats & rotate strike
    const strikerIdx = base.batsmen[1]?.isStriker ? 1 : 0;
    const striker = base.batsmen[strikerIdx];
    const nonStriker = base.batsmen[strikerIdx === 0 ? 1 : 0];
    if (striker) {
      if (!isExtra) striker.balls += 1;
      if (!isWicket && !isExtra) {
        striker.runs += addedRuns;
        if (outcome === '4') striker.fours += 1;
        if (outcome === '6') striker.sixes += 1;
      }
      striker.strikeRate = striker.balls > 0 ? ((striker.runs / striker.balls) * 100).toFixed(2) : '0.00';

      if (isWicket) {
        base.lastWicket = {
          available: true,
          playerFkey: striker.fkey,
          playerName: striker.name,
          shortName: striker.shortName,
          runs: striker.runs,
          balls: striker.balls,
          dismissalText: 'Caught',
          formatted: `${striker.shortName} ${striker.runs} (${striker.balls})`,
        };
        base.partnership = { available: true, runs: 0, balls: 0, formatted: '0 (0)' };
        // Keep dismissed batsman visible in B&W (`isOut: true`) until the new batter walks in on the next ball!
        striker.isOut = true;
        striker.isStriker = false;
      } else {
        base.partnership.available = true;
        base.partnership.runs += addedRuns;
        if (!isExtra) base.partnership.balls += 1;
        base.partnership.formatted = `${base.partnership.runs} (${base.partnership.balls})`;
      }

      // Rotate strike on odd runs or over end (only if neither batter is currently out)
      if (!isWicket) {
        const shouldSwap = (addedRuns % 2 === 1 && !isExtra) !== (!isExtra && ovBalls === 0);
        if (shouldSwap && nonStriker) {
          striker.isStriker = false;
          nonStriker.isStriker = true;
        }
      }
    }

    // Update Bowler
    if (base.bowler) {
      base.bowler.runsConceded += addedRuns;
      if (isWicket) base.bowler.wickets += 1;
      const [bwW = '0', bwB = '0'] = base.bowler.overs.split('.');
      let bTotal = (Number.parseInt(bwW, 10) || 0) * base.ballsPerOver + (Number.parseInt(bwB, 10) || 0);
      if (!isExtra) bTotal += 1;
      base.bowler.overs = `${Math.floor(bTotal / base.ballsPerOver)}.${bTotal % base.ballsPerOver}`;
      base.bowler.economy = bTotal > 0 ? ((base.bowler.runsConceded / bTotal) * base.ballsPerOver).toFixed(2) : '0.00';
    }

    // Update Win Probability dynamically
    if (base.winProbability.available) {
      const delta = isWicket ? -9 : outcome === '6' ? 7 : outcome === '4' ? 4 : outcome === '0' ? -2 : 1;
      base.winProbability.leftPercent = Math.min(95, Math.max(5, base.winProbability.leftPercent + delta));
      if (base.winProbability.isThreeWay) {
        const rem = 100 - base.winProbability.leftPercent;
        base.winProbability.rightPercent = Math.max(2, Math.round(rem * 0.65));
        base.winProbability.drawPercent = Math.max(0, 100 - base.winProbability.leftPercent - base.winProbability.rightPercent);
      } else {
        base.winProbability.rightPercent = 100 - base.winProbability.leftPercent;
      }
    }

    // Update Recent Overs
    const newBall: BallEntry = {
      display: outcome === 'WD' ? 'wd' : outcome === 'NB' ? 'nb' : outcome,
      kind:
        outcome === '4'
          ? 'four'
          : outcome === '6'
            ? 'six'
            : outcome === 'W'
              ? 'wicket'
              : isExtra
                ? 'extra'
                : outcome === '0'
                  ? 'dot'
                  : 'run',
      isLatest: true,
      runs: addedRuns,
    };

    for (const ov of base.recentOvers) {
      for (const b of ov.balls) b.isLatest = false;
    }

    let currOv = base.recentOvers[base.recentOvers.length - 1];
    if (!currOv || currOv.isComplete) {
      const nextNum = (currOv?.overNumber ?? ovWhole) + 1;
      const newOv = {
        overNumber: nextNum,
        balls: [newBall],
        totalRuns: addedRuns,
        isCurrent: true,
        isComplete: false,
      };
      for (let i = 1; i < base.ballsPerOver; i++) {
        newOv.balls.push({ display: '', kind: 'pending', isLatest: false, runs: 0 });
      }
      base.recentOvers = [...base.recentOvers.slice(-1), newOv];
    } else {
      const pendingIdx = currOv.balls.findIndex((b) => b.kind === 'pending');
      if (pendingIdx >= 0 && !isExtra) {
        currOv.balls[pendingIdx] = newBall;
      } else if (pendingIdx >= 0 && isExtra) {
        currOv.balls.splice(pendingIdx, 0, newBall);
      } else {
        currOv.balls.push(newBall);
      }
      currOv.totalRuns += addedRuns;
      currOv.isComplete = !isExtra && ovBalls === 0;
    }

    // Center Badge
    base.centerBadge = isWicket
      ? { text: 'WICKET', subtext: 'CAUGHT', tone: 'wicket', rawCode: 'W' }
      : outcome === '4'
        ? { text: '4', tone: 'four', rawCode: '4' }
        : outcome === '6'
          ? { text: '6', tone: 'six', rawCode: '6' }
          : !isExtra && ovBalls === 0
            ? { text: 'OVER', tone: 'over', rawCode: 'O' }
            : isExtra
              ? { text: outcome === 'WD' ? 'WIDE' : 'NO BALL', tone: 'extra', rawCode: outcome }
              : { text: outcome, tone: 'neutral', rawCode: outcome };

    base.lastDeliveryKey = `sim:${base.inning}:${runs}:${wkts}:${totalBalls}:${outcome}:${Date.now()}`;

    const detected = this.detector.evaluate(base);
    this.currentSnapshot = base;
    this.emit('snapshot', base);
    for (const evt of detected) {
      this.pushEvent(evt);
    }
    return base;
  }

  private createDemoSnapshot(): MatchSnapshot {
    return {
      matchKey: 'DEMO',
      sourceUrl: 'https://crex.com/cricket-live-score/demo-match-DEMO',
      format: 'T20',
      formatLabel: 'T20',
      status: 'live',
      inning: 2,
      ballsPerOver: 6,
      powerplayLabel: null,
      crr: '8.10',
      rrr: '7.74',
      statusBannerText: 'SPR NEED 129 RUNS IN 100 BALLS',
      resultText: null,
      playerOfMatch: null,
      centerBadge: { text: 'BALL', tone: 'ball', rawCode: 'B' },
      leftTeam: {
        fkey: 'O',
        name: 'Team A',
        shortName: 'IND',
        score: '27-0',
        overs: '(3.2)',
        logoUrl: '/api/proxy-image?kind=team&key=O',
        jerseyUrl: '/api/proxy-image?kind=jersey-limited&key=O',
        primaryColor: '#436CAB',
        isBatting: true,
        isDeclared: false,
        captainFkey: 'O5',
        captainName: 'Shubman Gill',
        captainPhotoUrl: '/api/proxy-image?kind=player&key=O5',
      },
      rightTeam: {
        fkey: 'R',
        name: 'Team B',
        shortName: 'NZ',
        score: '155-6',
        overs: '(20.0)',
        logoUrl: '/api/proxy-image?kind=team&key=R',
        jerseyUrl: '/api/proxy-image?kind=jersey-limited&key=R',
        primaryColor: '#474747',
        isBatting: false,
        isDeclared: false,
        captainFkey: 'F0',
        captainName: 'Tom Latham',
        captainPhotoUrl: '/api/proxy-image?kind=player&key=F0',
      },
      chase: {
        isChasing: true,
        target: 156,
        runsNeeded: 129,
        ballsRemaining: 100,
        rrr: '7.74',
        isDls: false,
        battingTeamShort: 'IND',
      },
      testInfo: { day: null, session: null, oversLeftToday: null, breakLabel: null, leadTrailText: null },
      recentOvers: [
        {
          overNumber: 3,
          balls: [
            { display: '0', kind: 'dot', isLatest: false, runs: 0 },
            { display: '6', kind: 'six', isLatest: false, runs: 6 },
            { display: '0', kind: 'dot', isLatest: false, runs: 0 },
            { display: '2', kind: 'run', isLatest: false, runs: 2 },
            { display: '0', kind: 'dot', isLatest: false, runs: 0 },
            { display: '0', kind: 'dot', isLatest: false, runs: 0 },
          ],
          totalRuns: 8,
          isCurrent: false,
          isComplete: true,
        },
        {
          overNumber: 4,
          balls: [
            { display: '0', kind: 'dot', isLatest: false, runs: 0 },
            { display: '2', kind: 'run', isLatest: true, runs: 2 },
            { display: '', kind: 'pending', isLatest: false, runs: 0 },
            { display: '', kind: 'pending', isLatest: false, runs: 0 },
            { display: '', kind: 'pending', isLatest: false, runs: 0 },
            { display: '', kind: 'pending', isLatest: false, runs: 0 },
          ],
          totalRuns: 2,
          isCurrent: true,
          isComplete: false,
        },
      ],
      winProbability: {
        available: true,
        isThreeWay: false,
        leftTeamShort: 'IND',
        leftPercent: 62,
        rightTeamShort: 'NZ',
        rightPercent: 38,
        drawPercent: 0,
      },
      lastWicket: {
        available: false,
        playerFkey: '',
        playerName: '',
        shortName: '',
        runs: 0,
        balls: 0,
        dismissalText: '',
        formatted: 'N/A',
      },
      partnership: { available: true, runs: 27, balls: 20, formatted: '27 (20)' },
      batsmen: [
        {
          fkey: '15K',
          name: 'Yashasvi Jaiswal',
          shortName: 'Y JAISWAL',
          runs: 15,
          balls: 13,
          fours: 1,
          sixes: 1,
          strikeRate: '115.38',
          isStriker: false,
          isOut: false,
          isImpact: false,
          photoUrl: '/api/proxy-image?kind=player&key=15K',
          jerseyUrl: '/api/proxy-image?kind=jersey-limited&key=O',
        },
        {
          fkey: 'O5',
          name: 'Shubman Gill',
          shortName: 'S GILL',
          runs: 10,
          balls: 7,
          fours: 2,
          sixes: 0,
          strikeRate: '142.86',
          isStriker: true,
          isOut: false,
          isImpact: false,
          photoUrl: '/api/proxy-image?kind=player&key=O5',
          jerseyUrl: '/api/proxy-image?kind=jersey-limited&key=O',
        },
      ],
      bowler: {
        fkey: 'AJ',
        name: 'Matt Henry',
        shortName: 'M HENRY',
        wickets: 0,
        runsConceded: 2,
        overs: '0.2',
        economy: '6.00',
        maidens: 0,
        isImpact: false,
        photoUrl: '/api/proxy-image?kind=player&key=AJ',
        jerseyUrl: '/api/proxy-image?kind=jersey-limited&key=R',
      },
      yetToBat: [
        { fkey: 'CL', name: 'Rishabh Pant', shortName: 'R PANT', average: '38.40' },
        { fkey: 'AK', name: 'KL Rahul', shortName: 'K RAHUL', average: '41.20' },
      ],
      currentInningsScorecard: null,
      allInnings: [],
      playingXI: { left: [], right: [] },
      matchInfo: {
        seriesName: 'LIVE SIMULATOR MODE',
        matchNumberLabel: '1',
        venue: 'Broadcast Test Stadium',
        startTimeIso: new Date().toISOString(),
        tossText: 'IND OPT TO BOWL',
      },
      latestCommentary: 'Simulator active — trigger events or paste a live Crex URL!',
      lastDeliveryKey: 'demo:init',
      updatedAt: new Date().toISOString(),
      isSimulated: true,
    };
  }

  private async pollOnce(forceFull = false): Promise<MatchSnapshot> {
    if (!this.activeMatchKey || !this.activeSourceUrl) {
      throw new Error('No match is currently attached.');
    }
    const matchKey = this.activeMatchKey;
    const sourceUrl = this.activeSourceUrl;
    const now = Date.now();
    const needMeta = forceFull || !this.lastIv4 || now - this.lastMetaFetchedAt > 60_000;
    const needSc4 = forceFull || this.pollCount % 2 === 0;
    const needBallFeeds = forceFull || this.pollCount % 3 === 0;

    try {
      const sv3Res = await this.client.getSV3(matchKey, !forceFull);
      this.pollCount += 1;
      this.lastPollAt = new Date().toISOString();
      this.lastError = null;

      if (sv3Res.notModified && !needMeta && !needSc4 && this.currentSnapshot) {
        this.notModifiedCount += 1;
        this.emitStatus();
        return this.currentSnapshot;
      }

      const parallelTasks: Promise<unknown>[] = [];
      let iv4Promise: Promise<Record<string, unknown> | null> | null = null;
      let metaPromise: Promise<Record<string, unknown> | null> | null = null;
      let sc4Promise: Promise<Record<string, unknown>[]> | null = null;
      let bfPromise: Promise<Record<string, unknown>[]> | null = null;

      if (needMeta) {
        iv4Promise = this.client.getIV4(matchKey).catch(() => this.lastIv4);
        metaPromise = this.client.getMatchMetaData(matchKey).catch(() => this.lastMeta);
        parallelTasks.push(iv4Promise, metaPromise);
      }
      if (needSc4) {
        sc4Promise = this.client.getSC4(matchKey).catch(() => this.lastSc4);
        parallelTasks.push(sc4Promise);
      }
      if (needBallFeeds) {
        bfPromise = this.client.getBallFeeds(matchKey).catch(() => this.lastBallFeeds);
        parallelTasks.push(bfPromise);
      }

      await Promise.all(parallelTasks);
      if (iv4Promise) {
        this.lastIv4 = await iv4Promise;
        this.lastMetaFetchedAt = now;
      }
      if (metaPromise) {
        this.lastMeta = await metaPromise;
      }
      if (sc4Promise) {
        this.lastSc4 = await sc4Promise;
      }
      if (bfPromise) {
        this.lastBallFeeds = await bfPromise;
      }

      const keys = collectEntityKeysFromRaw({
        sv3: sv3Res.data,
        sc4: this.lastSc4,
        iv4: this.lastIv4,
        meta: this.lastMeta,
      });
      const entities = await this.client.ensureEntitiesResolved(keys);

      const snapshot = buildMatchSnapshot({
        matchKey,
        sourceUrl,
        sv3: sv3Res.data,
        sc4: this.lastSc4,
        iv4: this.lastIv4,
        meta: this.lastMeta,
        ballFeeds: this.lastBallFeeds,
        entities,
      });

      // If Crex temporarily clears a dismissed batter's slot in `sv3.p` before the new batter arrives,
      // retain the dismissed batter in that slot in B&W (`isOut: true`) until the new batter's key appears.
      const prevSnap = this.currentSnapshot;
      if (
        prevSnap &&
        prevSnap.matchKey === snapshot.matchKey &&
        prevSnap.inning === snapshot.inning &&
        snapshot.status === 'live'
      ) {
        for (const slotIdx of [0, 1] as const) {
          if (!snapshot.batsmen[slotIdx]) {
            const prevBat = prevSnap.batsmen[slotIdx];
            const otherCurr = snapshot.batsmen[slotIdx === 0 ? 1 : 0];
            if (
              prevBat &&
              prevBat.fkey !== otherCurr?.fkey &&
              (prevBat.isOut ||
                (snapshot.lastWicket.available && snapshot.lastWicket.playerFkey === prevBat.fkey) ||
                snapshot.centerBadge.tone === 'wicket')
            ) {
              snapshot.batsmen[slotIdx] = {
                ...prevBat,
                isOut: true,
                isStriker: false,
              };
            }
          }
        }
      }

      const events = this.detector.evaluate(snapshot);
      this.currentSnapshot = snapshot;
      this.emit('snapshot', snapshot);
      this.emitStatus();

      for (const evt of events) {
        this.pushEvent(evt);
        if (evt.type === 'OVER') {
          this.maybeTriggerAutoBowlingCard();
        }
      }

      return snapshot;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      logger.error('Crex poll cycle failed', { matchKey, err: msg });
      this.emitStatus();
      if (this.currentSnapshot) {
        return this.currentSnapshot;
      }
      throw err;
    }
  }

  private pushEvent(evt: BroadcastEvent): void {
    this.recentEvents = [evt, ...this.recentEvents].slice(0, 30);
    this.emit('event', evt);
  }

  private maybeTriggerAutoBowlingCard(): void {
    const cfg = this.configStore.get();
    if (!cfg.autoBowlingCardOnOver || cfg.overlayViewMode !== 'live') return;
    if (this.autoCardTimer) clearTimeout(this.autoCardTimer);

    const prevMode: OverlayViewMode = cfg.overlayViewMode;
    this.emit('config', this.configStore.update({ overlayViewMode: 'bowling-card' }));
    this.autoCardTimer = setTimeout(() => {
      this.autoCardTimer = null;
      if (this.configStore.get().overlayViewMode === 'bowling-card') {
        this.emit('config', this.configStore.update({ overlayViewMode: prevMode }));
      }
    }, cfg.autoBowlingCardDurationMs);
  }

  private scheduleNextPoll(): void {
    this.stopPolling();
    if (!this.activeMatchKey || this.simulatorRunning) return;

    const baseInterval = this.configStore.get().pollIntervalMs;
    const status = this.currentSnapshot?.status ?? 'live';
    const delay =
      status === 'finished' ? 30_000 : status === 'upcoming' ? 15_000 : baseInterval;

    this.pollTimer = setTimeout(async () => {
      if (this.isPollingTick) return;
      this.isPollingTick = true;
      try {
        await this.pollOnce(false);
      } catch {
        // Error already logged and emitted in pollOnce
      } finally {
        this.isPollingTick = false;
        this.scheduleNextPoll();
      }
    }, delay);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async connectYoutubeChannel(rawHandleOrUrl: string): Promise<{
    channel: ResolvedYoutubeChannel;
    count: number;
    provider: string;
    config: StudioConfig;
  }> {
    const channel = await resolveYoutubeChannel(rawHandleOrUrl);
    const { apiKey } = this.configStore.getRawYoutubeCredentials();
    const live = await fetchLiveSubscriberCount({
      channelId: channel.channelId,
      youtubeApiKey: apiKey,
      preferredProvider: 'socialcounts',
      fallbackCount: channel.fallbackCount,
    });

    if (!live) {
      throw new Error(
        `Resolved channel "${channel.title}" (${channel.channelId}), but could not fetch a live subscriber count right now.`
      );
    }

    if (live.provider === 'socialcounts' || live.provider === 'mixerno') {
      this.ytPreferredProvider = live.provider;
    }

    const updated = this.configStore.update({
      subscriberWidget: {
        enabled: true,
        count: live.count,
        youtubeHandle: channel.handle,
        youtubeChannelId: channel.channelId,
        youtubeChannelTitle: channel.title,
        youtubeSyncEnabled: true,
        youtubeProvider: live.provider,
        youtubeLastSyncedAt: live.fetchedAt,
      },
    });
    this.emit('config', updated);
    logger.info('Connected live YouTube subscriber counter', {
      handle: channel.handle,
      channelId: channel.channelId,
      title: channel.title,
      count: live.count,
      provider: live.provider,
    });

    return {
      channel,
      count: live.count,
      provider: live.provider,
      config: updated,
    };
  }

  disconnectYoutubeChannel(): StudioConfig {
    const updated = this.configStore.update({
      subscriberWidget: {
        youtubeSyncEnabled: false,
        youtubeProvider: '',
      },
    });
    this.emit('config', updated);
    return updated;
  }

  private startYoutubeSubPoller(): void {
    const pollYoutubeOnce = async () => {
      if (this.ytSyncInFlight) return;
      const cfg = this.configStore.get();
      const sub = cfg.subscriberWidget;
      if (!sub.youtubeSyncEnabled || !sub.youtubeChannelId) return;

      this.ytSyncInFlight = true;
      try {
        const { apiKey } = this.configStore.getRawYoutubeCredentials();
        const live = await fetchLiveSubscriberCount({
          channelId: sub.youtubeChannelId.trim(),
          youtubeApiKey: apiKey,
          preferredProvider: this.ytPreferredProvider,
        });
        if (!live) return;

        if (live.provider === 'socialcounts' || live.provider === 'mixerno') {
          this.ytPreferredProvider = live.provider;
        }

        if (
          live.count !== sub.count ||
          live.provider !== sub.youtubeProvider
        ) {
          const updated = this.configStore.update({
            subscriberWidget: {
              count: live.count,
              youtubeProvider: live.provider,
              youtubeLastSyncedAt: live.fetchedAt,
            },
          });
          this.emit('config', updated);
        }
      } catch (err) {
        logger.debug('YouTube subscriber poll skipped', { err });
      } finally {
        this.ytSyncInFlight = false;
      }
    };

    // Poll every 5 seconds for smooth real-time odometer rolling on OBS
    this.ytTimer = setInterval(() => {
      void pollYoutubeOnce();
    }, 5_000);

    // Run an immediate sync shortly after boot if a channel was persisted
    setTimeout(() => {
      void pollYoutubeOnce();
    }, 1_200);
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }

  shutdown(): void {
    this.stopPolling();
    this.stopSimulator();
    if (this.ytTimer) clearInterval(this.ytTimer);
    if (this.autoCardTimer) clearTimeout(this.autoCardTimer);
  }
}
