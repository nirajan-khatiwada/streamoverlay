export type MatchFormat = 'T20' | 'ODI' | 'TEST' | 'T10' | '100B';
export type MatchStatus = 'upcoming' | 'live' | 'finished';

export type BallKind = 'dot' | 'run' | 'four' | 'six' | 'wicket' | 'extra' | 'pending';

export interface BallEntry {
  display: string;
  kind: BallKind;
  isLatest: boolean;
  runs: number;
}

export interface OverSummary {
  overNumber: number;
  balls: BallEntry[];
  totalRuns: number;
  isCurrent: boolean;
  isComplete: boolean;
}

export interface TeamDisplay {
  fkey: string;
  name: string;
  shortName: string;
  score: string;
  overs: string;
  priorInningsScore?: string;
  logoUrl: string;
  jerseyUrl: string;
  primaryColor: string;
  isBatting: boolean;
  isDeclared: boolean;
  captainFkey?: string;
  captainName?: string;
  captainPhotoUrl?: string;
}

export interface BatsmanState {
  fkey: string;
  name: string;
  shortName: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: string;
  isStriker: boolean;
  isOut: boolean;
  isImpact: boolean;
  photoUrl: string;
  jerseyUrl: string;
}

export interface BowlerState {
  fkey: string;
  name: string;
  shortName: string;
  wickets: number;
  runsConceded: number;
  overs: string;
  economy: string;
  maidens: number;
  isImpact: boolean;
  photoUrl: string;
  jerseyUrl: string;
}

export interface WinProbability {
  available: boolean;
  isThreeWay: boolean;
  leftTeamShort: string;
  leftPercent: number;
  rightTeamShort: string;
  rightPercent: number;
  drawPercent: number;
}

export interface LastWicketInfo {
  available: boolean;
  playerFkey: string;
  playerName: string;
  shortName: string;
  runs: number;
  balls: number;
  dismissalText: string;
  formatted: string;
}

export interface PartnershipInfo {
  available: boolean;
  runs: number;
  balls: number;
  formatted: string;
}

export interface ChaseInfo {
  isChasing: boolean;
  target: number | null;
  runsNeeded: number | null;
  ballsRemaining: number | null;
  rrr: string | null;
  isDls: boolean;
  battingTeamShort: string;
}

export interface TestMatchInfo {
  day: number | null;
  session: number | null;
  oversLeftToday: string | null;
  breakLabel: string | null;
  leadTrailText: string | null;
}

export interface YetToBatPlayer {
  fkey: string;
  name: string;
  shortName: string;
  average: string;
}

export interface ScorecardBatter {
  fkey: string;
  name: string;
  shortName: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: string;
  dismissal: string;
  isNotOut: boolean;
  isCaptain: boolean;
  isWk: boolean;
  photoUrl: string;
  jerseyUrl: string;
}

export interface ScorecardBowler {
  fkey: string;
  name: string;
  shortName: string;
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
  economy: string;
  isBest: boolean;
  photoUrl: string;
  jerseyUrl: string;
}

export interface InningsScorecard {
  inningNumber: number;
  teamFkey: string;
  teamName: string;
  teamShort: string;
  score: string;
  overs: string;
  extras: string;
  isDeclared: boolean;
  batters: ScorecardBatter[];
  yetToBat: YetToBatPlayer[];
  bowlers: ScorecardBowler[];
}

export interface PlayingXIPlayer {
  fkey: string;
  name: string;
  shortName: string;
  role: 'BAT' | 'BOWL' | 'AR' | 'WK';
  isCaptain: boolean;
  isWk: boolean;
  isOverseas: boolean;
  photoUrl: string;
  jerseyUrl: string;
}

export interface MatchInfoDetails {
  seriesName: string;
  matchNumberLabel: string;
  venue: string;
  startTimeIso: string;
  tossText: string;
  weatherTemp?: string;
  weatherCondition?: string;
  weatherHumidity?: string;
  weatherRainChance?: string;
  weatherWind?: string;
  headToHead?: string;
  broadcastInfo?: string;
}

export interface CenterBadgeState {
  text: string;
  subtext?: string;
  tone: 'neutral' | 'ball' | 'over' | 'four' | 'six' | 'wicket' | 'extra' | 'alert' | 'result';
  rawCode: string;
}

export interface MatchSnapshot {
  matchKey: string;
  sourceUrl: string;
  format: MatchFormat;
  formatLabel: string;
  status: MatchStatus;
  inning: number;
  ballsPerOver: 5 | 6;
  powerplayLabel: string | null;
  crr: string;
  rrr: string | null;
  statusBannerText: string;
  resultText: string | null;
  playerOfMatch: string | null;
  centerBadge: CenterBadgeState;
  leftTeam: TeamDisplay;
  rightTeam: TeamDisplay;
  chase: ChaseInfo;
  testInfo: TestMatchInfo;
  recentOvers: OverSummary[];
  winProbability: WinProbability;
  lastWicket: LastWicketInfo;
  partnership: PartnershipInfo;
  batsmen: [BatsmanState | null, BatsmanState | null];
  bowler: BowlerState | null;
  yetToBat: YetToBatPlayer[];
  currentInningsScorecard: InningsScorecard | null;
  allInnings: InningsScorecard[];
  playingXI: {
    left: PlayingXIPlayer[];
    right: PlayingXIPlayer[];
  };
  matchInfo: MatchInfoDetails;
  latestCommentary: string | null;
  lastDeliveryKey: string;
  updatedAt: string;
  isSimulated?: boolean;
}

export type BroadcastEventType =
  | 'FOUR'
  | 'SIX'
  | 'WICKET'
  | 'OVER'
  | 'MILESTONE_50'
  | 'MILESTONE_100'
  | 'SUB_ALERT'
  | 'DONATION_ALERT';

export type SoundEventKey = 'four' | 'six' | 'wicket' | 'over' | 'milestone' | 'subAlert';

export interface BroadcastEvent {
  id: string;
  type: BroadcastEventType;
  title: string;
  subtitle?: string;
  soundKey: SoundEventKey;
  showFullScreenStinger: boolean;
  durationMs: number;
  timestamp: string;
}

export type OverlayViewMode =
  | 'live'
  | 'bowling-card'
  | 'batting-card'
  | 'playing-xi-left'
  | 'playing-xi-right'
  | 'match-info';

export interface DonationEntry {
  id: string;
  donorName: string;
  amountText: string;
}

export interface SuperChatEntry {
  id: string;
  handle: string;
  amountText: string;
  accentColor: string;
  avatarText: string;
}

export interface SfxChannelConfig {
  enabled: boolean;
  volume: number; // 0..1
  customUrl: string | null;
}

export interface StudioConfig {
  pollIntervalMs: number;
  overlayViewMode: OverlayViewMode;
  autoBowlingCardOnOver: boolean;
  autoBowlingCardDurationMs: number;
  showBottomTicker: boolean;
  vsBanner: {
    mode: 'auto-captains' | 'custom-image';
    customImageUrl: string | null;
    customCaption: string;
  };
  brandBlock: {
    mode: 'text' | 'custom-image';
    monogram: string;
    titleLine1: string;
    titleLine2: string;
    bgColor: string;
    customImageUrl: string | null;
  };
  stingerPromo: {
    enabled: boolean;
    customImageUrl: string | null;
    headline: string;
    subtext: string;
    brandLabel: string;
  };
  subscriberWidget: {
    enabled: boolean;
    count: number;
    label: string;
    showSubscribeCta: boolean;
    youtubeHandle: string;
    youtubeChannelId: string;
    youtubeChannelTitle: string;
    youtubeSyncEnabled: boolean;
    youtubeProvider: string;
    youtubeLastSyncedAt: string | null;
    youtubeApiKey: string;
  };
  donationBar: {
    enabled: boolean;
    providerBadgeText: string;
    providerColor: string;
    providerIconUrl: string | null;
    accountNumber: string;
    rotateIntervalMs: number;
    entries: DonationEntry[];
  };
  superChatBar: {
    enabled: boolean;
    rotateIntervalMs: number;
    entries: SuperChatEntry[];
  };
  audio: {
    masterEnabled: boolean;
    masterVolume: number; // 0..1
    channels: Record<SoundEventKey, SfxChannelConfig>;
  };
}

export interface CrexLiveMatchItem {
  matchKey: string;
  format: string;
  status: MatchStatus;
  team1Fkey: string;
  team2Fkey: string;
  team1Name: string;
  team1Short: string;
  team2Name: string;
  team2Short: string;
  score1: string;
  score2: string;
  statusText: string;
  seriesName: string;
  startTimeMs: number | null;
  crexUrl: string;
}

export interface ConnectionStatus {
  connected: boolean;
  activeMatchKey: string | null;
  sourceUrl: string | null;
  lastPollAt: string | null;
  lastError: string | null;
  pollCount: number;
  notModifiedCount: number;
  clientsCount: number;
  simulatorRunning: boolean;
}

export type ServerWsMessage =
  | {
      type: 'init';
      payload: {
        snapshot: MatchSnapshot | null;
        config: StudioConfig;
        status: ConnectionStatus;
        recentEvents: BroadcastEvent[];
      };
    }
  | {
      type: 'snapshot';
      payload: MatchSnapshot;
    }
  | {
      type: 'config';
      payload: StudioConfig;
    }
  | {
      type: 'status';
      payload: ConnectionStatus;
    }
  | {
      type: 'event';
      payload: BroadcastEvent;
    }
  | {
      type: 'sub_alert';
      payload: {
        id: string;
        subscriberName: string;
        message: string;
        timestamp: string;
      };
    };
