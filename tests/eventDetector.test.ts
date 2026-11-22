import { describe, expect, it } from 'vitest';
import type { MatchSnapshot } from '../shared/types.js';
import { BroadcastEventDetector } from '../server/crex/eventDetector.js';

function makeSnapshot(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    matchKey: 'TEST1',
    sourceUrl: 'https://crex.com/cricket-live-score/test-TEST1',
    format: 'T20',
    formatLabel: 'T20',
    status: 'live',
    inning: 1,
    ballsPerOver: 6,
    powerplayLabel: null,
    crr: '8.00',
    rrr: null,
    statusBannerText: 'IND OPT TO BAT',
    resultText: null,
    playerOfMatch: null,
    centerBadge: { text: 'BALL', tone: 'ball', rawCode: 'B' },
    leftTeam: {
      fkey: 'O',
      name: 'India',
      shortName: 'IND',
      score: '48-1',
      overs: '(5.4)',
      logoUrl: '',
      jerseyUrl: '',
      primaryColor: '#436CAB',
      isBatting: true,
      isDeclared: false,
    },
    rightTeam: {
      fkey: 'R',
      name: 'New Zealand',
      shortName: 'NZ',
      score: '-/-',
      overs: '',
      logoUrl: '',
      jerseyUrl: '',
      primaryColor: '#474747',
      isBatting: false,
      isDeclared: false,
    },
    chase: {
      isChasing: false,
      target: null,
      runsNeeded: null,
      ballsRemaining: null,
      rrr: null,
      isDls: false,
      battingTeamShort: 'IND',
    },
    testInfo: { day: null, session: null, oversLeftToday: null, breakLabel: null, leadTrailText: null },
    recentOvers: [
      {
        overNumber: 6,
        balls: [
          { display: '1', kind: 'run', isLatest: false, runs: 1 },
          { display: '0', kind: 'dot', isLatest: false, runs: 0 },
          { display: '2', kind: 'run', isLatest: false, runs: 2 },
          { display: '1', kind: 'run', isLatest: true, runs: 1 },
          { display: '', kind: 'pending', isLatest: false, runs: 0 },
          { display: '', kind: 'pending', isLatest: false, runs: 0 },
        ],
        totalRuns: 4,
        isCurrent: true,
        isComplete: false,
      },
    ],
    winProbability: {
      available: true,
      isThreeWay: false,
      leftTeamShort: 'IND',
      leftPercent: 60,
      rightTeamShort: 'NZ',
      rightPercent: 40,
      drawPercent: 0,
    },
    lastWicket: {
      available: true,
      playerFkey: 'P0',
      playerName: 'Opener One',
      shortName: 'O ONE',
      runs: 12,
      balls: 10,
      dismissalText: 'Caught',
      formatted: 'O ONE 12 (10)',
    },
    partnership: { available: true, runs: 36, balls: 24, formatted: '36 (24)' },
    batsmen: [
      {
        fkey: 'P1',
        name: 'Shubman Gill',
        shortName: 'S GILL',
        runs: 48,
        balls: 29,
        fours: 5,
        sixes: 2,
        strikeRate: '165.52',
        isStriker: true,
        isImpact: false,
        photoUrl: '',
        jerseyUrl: '',
      },
      {
        fkey: 'P2',
        name: 'KL Rahul',
        shortName: 'K RAHUL',
        runs: 12,
        balls: 11,
        fours: 1,
        sixes: 0,
        strikeRate: '109.09',
        isStriker: false,
        isImpact: false,
        photoUrl: '',
        jerseyUrl: '',
      },
    ],
    bowler: null,
    yetToBat: [],
    currentInningsScorecard: null,
    allInnings: [],
    playingXI: { left: [], right: [] },
    matchInfo: { seriesName: 'Test', matchNumberLabel: '1', venue: 'MCG', startTimeIso: '', tossText: '' },
    latestCommentary: null,
    lastDeliveryKey: '1:48:1:34:6:3:1',
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('BroadcastEventDetector', () => {
  it('suppresses all events on initial hydration even if current badge is FOUR/WICKET', () => {
    const detector = new BroadcastEventDetector();
    const initial = makeSnapshot({
      centerBadge: { text: '4', tone: 'four', rawCode: '4' },
    });
    expect(detector.evaluate(initial)).toHaveLength(0);
  });

  it('detects FOUR + MILESTONE_50 on a boundary taking batter past 50, and never double-fires on repeat poll', () => {
    const detector = new BroadcastEventDetector();
    const s1 = makeSnapshot();
    detector.evaluate(s1);

    const s2 = makeSnapshot({
      centerBadge: { text: '4', tone: 'four', rawCode: '4' },
      leftTeam: { ...s1.leftTeam, score: '52-1', overs: '(5.5)' },
      batsmen: [
        { ...s1.batsmen[0]!, runs: 52, balls: 30, fours: 6 },
        s1.batsmen[1],
      ],
      recentOvers: [
        {
          overNumber: 6,
          balls: [
            { display: '1', kind: 'run', isLatest: false, runs: 1 },
            { display: '0', kind: 'dot', isLatest: false, runs: 0 },
            { display: '2', kind: 'run', isLatest: false, runs: 2 },
            { display: '1', kind: 'run', isLatest: false, runs: 1 },
            { display: '4', kind: 'four', isLatest: true, runs: 4 },
            { display: '', kind: 'pending', isLatest: false, runs: 0 },
          ],
          totalRuns: 8,
          isCurrent: true,
          isComplete: false,
        },
      ],
      lastDeliveryKey: '1:52:1:35:6:4:4',
    });

    const events = detector.evaluate(s2);
    expect(events.map((e) => e.type)).toEqual(['FOUR', 'MILESTONE_50']);

    // Polling again with unchanged state must emit 0 events
    expect(detector.evaluate(s2)).toHaveLength(0);
  });

  it('detects SIX and WICKET cleanly with WICKET taking precedence', () => {
    const detector = new BroadcastEventDetector();
    const s1 = makeSnapshot();
    detector.evaluate(s1);

    const sSix = makeSnapshot({
      centerBadge: { text: '6', tone: 'six', rawCode: '6' },
      leftTeam: { ...s1.leftTeam, score: '54-1', overs: '(5.5)' },
      batsmen: [
        { ...s1.batsmen[0]!, runs: 54, balls: 30, sixes: 3 },
        s1.batsmen[1],
      ],
      lastDeliveryKey: '1:54:1:35:6:4:6',
    });
    const evSix = detector.evaluate(sSix);
    expect(evSix.some((e) => e.type === 'SIX')).toBe(true);

    const sWkt = makeSnapshot({
      centerBadge: { text: 'WICKET', subtext: 'Bowled', tone: 'wicket', rawCode: '^1' },
      leftTeam: { ...s1.leftTeam, score: '54-2', overs: '(6.0)' },
      lastWicket: {
        available: true,
        playerFkey: 'P1',
        playerName: 'Shubman Gill',
        shortName: 'S GILL',
        runs: 54,
        balls: 31,
        dismissalText: 'Bowled',
        formatted: 'S GILL 54 (31)',
      },
      lastDeliveryKey: '1:54:2:36:6:5:W',
    });
    const evWkt = detector.evaluate(sWkt);
    expect(evWkt[0]?.type).toBe('WICKET');
    expect(evWkt[0]?.subtitle).toContain('S GILL 54 (31)');
  });
});
