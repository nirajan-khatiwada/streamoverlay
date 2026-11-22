import { describe, expect, it } from 'vitest';
import type { CrexEntityStore } from '../server/crex/client.js';
import {
  buildMatchSnapshot,
  classifyBallToken,
  decodeCenterBadge,
  decodeTossText,
  parseLiveMatchesList,
  parseWinProbability,
} from '../server/crex/parser.js';
import { parseCrexMatchInput } from '../server/crex/urlParser.js';

const MOCK_ENTITIES: CrexEntityStore = {
  teams: {
    R: { f_key: 'R', n: 'New Zealand', sn: 'NZ', cc: '0-#474747' },
    O: { f_key: 'O', n: 'India', sn: 'IND', cc: '0-#436CAB' },
    Q: { f_key: 'Q', n: 'Australia', sn: 'AUS', cc: '0-#E3B822' },
    S: { f_key: 'S', n: 'England', sn: 'ENG', cc: '0-#1F4E9E' },
  },
  players: {
    '4W3': { f_key: '4W3', n: 'Rachin Ravindra' },
    '4W1': { f_key: '4W1', n: 'Devon Conway' },
    AJ: { f_key: 'AJ', n: 'Jasprit Bumrah' },
    EW: { f_key: 'EW', n: 'Henry Nicholls' },
    F0: { f_key: 'F0', n: 'Tom Latham' },
    KN: { f_key: 'KN', n: 'Tom Blundell' },
    O5: { f_key: 'O5', n: 'Shubman Gill' },
    CL: { f_key: 'CL', n: 'Rishabh Pant' },
    EF: { f_key: 'EF', n: 'Akash Deep' },
  },
  series: {
    '2GR': { f_key: '2GR', n: 'India tour of New Zealand 2026', sn: 'IND vs NZ' },
  },
  venues: {
    '2D': { f_key: '2D', n: 'Basin Reserve, Wellington' },
  },
  umpires: {},
};

describe('CrexParser — Live Test Match (IND vs NZ 12JM shape)', () => {
  it('parses 3rd-innings Test state, batting team left, 3-way odds, overs, striker, and last wicket', () => {
    const snap = buildMatchSnapshot({
      matchKey: '12JM',
      sourceUrl: 'https://crex.com/cricket-live-score/ind-vs-nz-12JM',
      sv3: {
        i: '42/2.4.2',
        a: 'R.O',
        j: '368/10(121.0',
        k: '720/9(166.0',
        J: '82/2(31.0',
        B: '2',
        F: '^R.^O',
        R: '1000-0,1.65-1.66,2.54-2.56',
        g: 'F0.O5',
        p: '4W3.4W1',
        q: '9.29*',
        r: '1.0.4.9',
        s: '42.96',
        t: '5.0.1.13',
        b: 'AJ',
        c: '31.48.1.36',
        w: '3/3/47/0/1/0/0',
        x: 'EW.31.59.60.133.2.AJ',
        fo: 'Test',
        sf: '2GR',
        rb: [
          {
            o: 30,
            r: 3,
            b: [
              { u: '0', t: 0 },
              { u: '0+1', t: 0 },
              { u: '1', t: 0 },
              { u: '0', t: 0 },
              { u: '1', t: 0 },
              { u: '0', t: 0 },
            ],
          },
          {
            o: 31,
            r: 2,
            b: [
              { u: '0', t: 0 },
              { u: '0', t: 0 },
              { u: '0', t: 0 },
              { u: '0', t: 0 },
              { u: '0', t: 0 },
              { u: '2', t: 0 },
            ],
          },
        ],
      },
      sc4: [
        {
          c: 'R',
          d: '368/10(726',
          e: '0.9.5.6.0',
          x: 'F0/KN/0',
          a: ['AJ.92.174.8.4'],
          b: ['F0.0.2.0.0.3.2.1.AJ/39.09-48.17/', 'EF/2.57-20.93'],
        },
      ],
      iv4: {
        t: 'R-O',
        y: '4',
        x: 'F0/KN/O5/CL',
        v: '2D',
        s: '2GR',
        fo: 'Test',
        tp: 'F0.95.1.1.0.0.0.2.2.0-KN.48.1.1.0.0.0.1.1.0/O5.43.1.1.0.0.0.1.1.0-CL.52.1.1.0.0.0.2.2.0',
        wU: { crT: '22.2˚C', wC: 'Sunny', hum: '49', rP: '5 %' },
      },
      meta: { v: 'Basin Reserve, Wellington', team1: 'New Zealand', team2: 'India', team1_fkey: 'R', team2_fkey: 'O' },
      ballFeeds: [],
      entities: MOCK_ENTITIES,
    });

    expect(snap.format).toBe('TEST');
    expect(snap.status).toBe('live');
    expect(snap.testInfo.day).toBe(4);
    expect(snap.testInfo.session).toBe(3);

    // NZ batting in 3rd inning -> always on LEFT, IND on RIGHT
    expect(snap.leftTeam.shortName).toBe('NZ');
    expect(snap.leftTeam.score).toBe('368 & 82-2');
    expect(snap.leftTeam.overs).toBe('(31.0)');
    expect(snap.rightTeam.shortName).toBe('IND');
    expect(snap.rightTeam.score).toBe('720-9d');

    // Trail calculation: 368 + 82 = 450 vs 720 -> trail by 270
    expect(snap.testInfo.leadTrailText).toBe('NZ TRAIL BY 270 RUNS');
    expect(snap.matchInfo.tossText).toBe('IND OPT TO BOWL');

    // Striker & non-striker
    expect(snap.batsmen[0]?.shortName).toBe('R RAVINDRA');
    expect(snap.batsmen[0]?.isStriker).toBe(true);
    expect(snap.batsmen[1]?.shortName).toBe('D CONWAY');
    expect(snap.batsmen[1]?.isStriker).toBe(false);

    // Bowler
    expect(snap.bowler?.shortName).toBe('J BUMRAH');
    expect(snap.bowler?.wickets).toBe(1);
    expect(snap.bowler?.runsConceded).toBe(31);
    expect(snap.bowler?.overs).toBe('8.0');

    // Partnership & Last Wicket (82 - 60 = 22 runs, 186 - 133 = 53 balls)
    expect(snap.lastWicket.available).toBe(true);
    expect(snap.lastWicket.formatted).toBe('H NICHOLLS 31 (59)');
    expect(snap.partnership.formatted).toBe('22 (53)');

    // 3-way Test Win Probability
    expect(snap.winProbability.available).toBe(true);
    expect(snap.winProbability.isThreeWay).toBe(true);
    expect(
      snap.winProbability.leftPercent +
        snap.winProbability.rightPercent +
        snap.winProbability.drawPercent
    ).toBe(100);

    // Latest ball marker on over 31, ball 6 ("2")
    expect(snap.recentOvers).toHaveLength(2);
    expect(snap.recentOvers[1]?.balls[5]?.display).toBe('2');
    expect(snap.recentOvers[1]?.balls[5]?.isLatest).toBe(true);

    // Playing XI tags
    expect(snap.playingXI.left.find((p) => p.fkey === 'F0')?.isCaptain).toBe(true);
    expect(snap.playingXI.left.find((p) => p.fkey === 'KN')?.isWk).toBe(true);
  });
});

describe('CrexParser — Limited Overs 2nd Innings Chase, Toss, Odds & Tokens', () => {
  it('swaps chasing team to left, computes RRR, target, DLS, and 2-way win probability', () => {
    const snap = buildMatchSnapshot({
      matchKey: 'CH1',
      sourceUrl: 'https://crex.com/cricket-live-score/aus-vs-eng-CH1',
      sv3: {
        i: '4/1.2', // T20 live (4 = status 1, format 0), inning 2 (dInning0=1), k=2 (T1 opted bowl -> T2 batted 1st, T1 chasing!)
        a: 'Q.S',
        j: '180/6(20.0',
        k: '60/1(6.0',
        B: '6',
        F: '^Q.^S',
        R: '42+2', // mid = 43 -> favPer = round(100 - 21.5) = 79%
        fo: 'T20I',
        p: '4W3.4W1',
        q: '32.18*',
        r: '3.2',
        s: '24.16',
        t: '2.1',
        b: 'AJ',
        c: '18.12.1',
      },
      sc4: [],
      iv4: { t: 'Q-S', y: '2', fo: 'T20I' },
      meta: null,
      ballFeeds: [],
      entities: MOCK_ENTITIES,
    });

    expect(snap.leftTeam.shortName).toBe('AUS');
    expect(snap.rightTeam.shortName).toBe('ENG');
    expect(snap.chase.isChasing).toBe(true);
    expect(snap.chase.target).toBe(181);
    expect(snap.chase.runsNeeded).toBe(121);
    expect(snap.chase.ballsRemaining).toBe(84);
    expect(snap.chase.rrr).toBe('8.64');
    expect(snap.winProbability.leftPercent).toBe(79);
    expect(snap.winProbability.rightPercent).toBe(21);
    expect(snap.centerBadge.text).toBe('6');
    expect(snap.centerBadge.tone).toBe('six');
  });

  it('decodes all 4 Crex toss codes accurately', () => {
    expect(decodeTossText('1', 'NZ', 'IND')).toBe('NZ OPT TO BAT');
    expect(decodeTossText('2', 'NZ', 'IND')).toBe('NZ OPT TO BOWL');
    expect(decodeTossText('3', 'NZ', 'IND')).toBe('IND OPT TO BAT');
    expect(decodeTossText('4', 'NZ', 'IND')).toBe('IND OPT TO BOWL');
  });

  it('classifies ball tokens and center badge codes accurately', () => {
    expect(classifyBallToken('4').kind).toBe('four');
    expect(classifyBallToken('6').kind).toBe('six');
    expect(classifyBallToken('W').kind).toBe('wicket');
    expect(classifyBallToken('1lb')).toEqual({ display: '1lb', kind: 'extra', runs: 1, isLegal: true });
    expect(classifyBallToken('2wd')).toEqual({ display: '2wd', kind: 'extra', runs: 3, isLegal: false });
    expect(classifyBallToken('nb').isLegal).toBe(false);

    expect(decodeCenterBadge('B', 'live', null, null).text).toBe('BALL');
    expect(decodeCenterBadge('O', 'live', null, null).text).toBe('OVER');
    expect(decodeCenterBadge('^2', 'live', null, null)).toMatchObject({
      text: 'WICKET',
      subtext: 'Caught',
      tone: 'wicket',
    });
    expect(decodeCenterBadge('fh', 'live', null, null).text).toBe('FREE HIT');
    expect(decodeCenterBadge('tu', 'live', null, null).text).toBe('3RD UMPIRE');
  });

  it('falls back to fan poll wp when live odds R are absent', () => {
    const wp = parseWinProbability(
      { wp: 'Q,750,250,0' },
      'T20',
      { fkey: 'Q', shortName: 'AUS' },
      { fkey: 'S', shortName: 'ENG' }
    );
    expect(wp.available).toBe(true);
    expect(wp.leftPercent).toBe(75);
    expect(wp.rightPercent).toBe(25);
  });

  it('preserves uppercase matchKeys in parseLiveMatchesList crexUrl and round-trips through URL parser', () => {
    const list = parseLiveMatchesList(
      {
        '12JM': { b: 'R', c: 'O', fo: 'Test', n: 42, j: '368/10(121.0', q: '^2GR' },
        '11BO': { b: 'S', c: 'Q', fo: 'T20I', n: 8, res: 'AUS won by 3 wickets' },
      },
      MOCK_ENTITIES
    );
    const liveTest = list.find((m) => m.matchKey === '12JM');
    expect(liveTest).toBeDefined();
    expect(liveTest?.crexUrl).toContain('-12JM');
    expect(parseCrexMatchInput(liveTest!.crexUrl).matchKey).toBe('12JM');
  });
});
