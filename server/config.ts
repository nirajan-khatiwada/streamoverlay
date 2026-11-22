import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { StudioConfig } from '../shared/types.js';
import { logger } from './utils/logger.js';

export const APP_ROOT = process.cwd();
export const DATA_DIR = path.resolve(APP_ROOT, 'data');
export const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
export const CONFIG_FILE = path.resolve(DATA_DIR, 'config.json');
export const ENTITY_CACHE_FILE = path.resolve(DATA_DIR, 'crex-entities.json');
export const LAST_MATCH_FILE = path.resolve(DATA_DIR, 'last-match.json');

export const ENV = {
  PORT: Math.min(65535, Math.max(1, Number(process.env.PORT || 3000))),
  HOST: process.env.HOST || '127.0.0.1',
  CREX_API_VERSION: process.env.CREX_API_VERSION || '96.0.0',
  CREX_AUTH_TOKEN:
    process.env.CREX_AUTH_TOKEN ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImV4cGlyZXNJbiI6IjM2NWQifQ.eyJ0aW1lIjoxNjYwMDQ2NjIwMDAwfQ.bTEmMWlR7hLRUHxPPq6-1TP7cuuW7m6sZ9jcdbYzLRA',
};

export function ensureDataDirectories(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const DEFAULT_STUDIO_CONFIG: StudioConfig = {
  pollIntervalMs: 3000,
  overlayViewMode: 'live',
  autoBowlingCardOnOver: false,
  autoBowlingCardDurationMs: 8000,
  showBottomTicker: true,
  vsBanner: {
    mode: 'auto-captains',
    customImageUrl: null,
    customCaption: '',
  },
  brandBlock: {
    mode: 'text',
    monogram: 'LIVE',
    titleLine1: 'CRICKET',
    titleLine2: 'BROADCAST',
    bgColor: '#c91422',
    customImageUrl: null,
  },
  stingerPromo: {
    enabled: false,
    customImageUrl: null,
    headline: 'SUBSCRIBE FOR LIVE CRICKET SCORES & COMMENTARY',
    subtext: 'LIVE BALL-BY-BALL UPDATES',
    brandLabel: 'LIVE STREAM',
  },
  subscriberWidget: {
    enabled: true,
    count: 100000,
    label: 'SUB',
    showSubscribeCta: true,
    youtubeHandle: '',
    youtubeChannelId: '',
    youtubeChannelTitle: '',
    youtubeSyncEnabled: false,
    youtubeProvider: '',
    youtubeLastSyncedAt: null,
    youtubeApiKey: '',
    goal: 18000000,
    goalTitle: 'SUB GOAL',
    goalInitial: 0,
    showGoalWidget: true,
  },
  donationBar: {
    enabled: true,
    providerBadgeText: 'e',
    providerColor: '#48b849',
    providerIconUrl: null,
    accountNumber: '9800000000',
    rotateIntervalMs: 7000,
    entries: [
      { id: 'don-1', donorName: 'SUPPORTER NAME', amountText: 'RS 250' },
    ],
  },
  superChatBar: {
    enabled: false,
    rotateIntervalMs: 8000,
    entries: [
      {
        id: 'sc-1',
        handle: '@viewer',
        amountText: 'RS 200',
        accentColor: '#1fb6a6',
        avatarText: 'V',
      },
    ],
  },
  audio: {
    masterEnabled: true,
    masterVolume: 0.85,
    channels: {
      four: { enabled: true, volume: 0.9, customUrl: null },
      six: { enabled: true, volume: 1.0, customUrl: null },
      wicket: { enabled: true, volume: 1.0, customUrl: null },
      over: { enabled: true, volume: 0.55, customUrl: null },
      milestone: { enabled: true, volume: 0.9, customUrl: null },
      subAlert: { enabled: true, volume: 0.65, customUrl: null },
    },
    stadiumAmbient: {
      enabled: true,
      volume: 0.4,
      customUrl: null,
    },
  },
};

const safeUrlOrNull = z
  .string()
  .max(500)
  .refine((v) => v.startsWith('/uploads/') || v.startsWith('/sfx/') || /^https?:\/\//i.test(v), {
    message: 'URL must be an uploaded asset path or HTTP(S) URL.',
  })
  .nullable();

const sfxChannelSchema = z.object({
  enabled: z.boolean(),
  volume: z.number().min(0).max(1),
  customUrl: safeUrlOrNull,
});

export const studioConfigPatchSchema = z.object({
  pollIntervalMs: z.number().int().min(1500).max(15000).optional(),
  overlayViewMode: z
    .enum(['live', 'bowling-card', 'batting-card', 'playing-xi-left', 'playing-xi-right', 'match-info'])
    .optional(),
  autoBowlingCardOnOver: z.boolean().optional(),
  autoBowlingCardDurationMs: z.number().int().min(3000).max(30000).optional(),
  showBottomTicker: z.boolean().optional(),
  vsBanner: z
    .object({
      mode: z.enum(['auto-captains', 'custom-image']).optional(),
      customImageUrl: safeUrlOrNull.optional(),
      customCaption: z.string().max(120).optional(),
    })
    .optional(),
  brandBlock: z
    .object({
      mode: z.enum(['text', 'custom-image']).optional(),
      monogram: z.string().max(8).optional(),
      titleLine1: z.string().max(30).optional(),
      titleLine2: z.string().max(30).optional(),
      bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      customImageUrl: safeUrlOrNull.optional(),
    })
    .optional(),
  stingerPromo: z
    .object({
      enabled: z.boolean().optional(),
      customImageUrl: safeUrlOrNull.optional(),
      headline: z.string().max(160).optional(),
      subtext: z.string().max(120).optional(),
      brandLabel: z.string().max(40).optional(),
    })
    .optional(),
  subscriberWidget: z
    .object({
      enabled: z.boolean().optional(),
      count: z.number().int().min(0).max(999999999).optional(),
      label: z.string().max(16).optional(),
      showSubscribeCta: z.boolean().optional(),
      youtubeHandle: z.string().max(120).optional(),
      youtubeChannelId: z.string().max(80).optional(),
      youtubeChannelTitle: z.string().max(120).optional(),
      youtubeSyncEnabled: z.boolean().optional(),
      youtubeProvider: z.string().max(40).optional(),
      youtubeLastSyncedAt: z.string().max(60).nullable().optional(),
      youtubeApiKey: z.string().max(120).optional(),
      goal: z.number().int().min(1).max(999999999).optional(),
      goalTitle: z.string().max(40).optional(),
      goalInitial: z.number().int().min(0).max(999999999).optional(),
      showGoalWidget: z.boolean().optional(),
    })
    .optional(),
  donationBar: z
    .object({
      enabled: z.boolean().optional(),
      providerBadgeText: z.string().max(6).optional(),
      providerColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      providerIconUrl: safeUrlOrNull.optional(),
      accountNumber: z.string().max(40).optional(),
      rotateIntervalMs: z.number().int().min(2000).max(60000).optional(),
      entries: z
        .array(
          z.object({
            id: z.string().min(1).max(64),
            donorName: z.string().min(1).max(60),
            amountText: z.string().min(1).max(32),
          })
        )
        .max(50)
        .optional(),
    })
    .optional(),
  superChatBar: z
    .object({
      enabled: z.boolean().optional(),
      rotateIntervalMs: z.number().int().min(2000).max(60000).optional(),
      entries: z
        .array(
          z.object({
            id: z.string().min(1).max(64),
            handle: z.string().min(1).max(48),
            amountText: z.string().min(1).max(32),
            accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            avatarText: z.string().min(1).max(4),
          })
        )
        .max(50)
        .optional(),
    })
    .optional(),
  audio: z
    .object({
      masterEnabled: z.boolean().optional(),
      masterVolume: z.number().min(0).max(1).optional(),
      channels: z
        .object({
          four: sfxChannelSchema.partial().optional(),
          six: sfxChannelSchema.partial().optional(),
          wicket: sfxChannelSchema.partial().optional(),
          over: sfxChannelSchema.partial().optional(),
          milestone: sfxChannelSchema.partial().optional(),
          subAlert: sfxChannelSchema.partial().optional(),
        })
        .optional(),
      stadiumAmbient: z
        .object({
          enabled: z.boolean().optional(),
          volume: z.number().min(0).max(1).optional(),
          customUrl: safeUrlOrNull.optional(),
        })
        .optional(),
    })
    .optional(),
});

export type StudioConfigPatch = z.infer<typeof studioConfigPatchSchema>;

export class ConfigStore {
  private config: StudioConfig;

  constructor() {
    ensureDataDirectories();
    this.config = this.load();
  }

  private load(): StudioConfig {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Partial<StudioConfig>;
        return this.mergeWithDefaults(raw);
      }
    } catch (err) {
      logger.warn('Failed to load persisted config; falling back to defaults', { err });
    }
    return structuredClone(DEFAULT_STUDIO_CONFIG);
  }

  private mergeWithDefaults(partial: Partial<StudioConfig>): StudioConfig {
    const def = structuredClone(DEFAULT_STUDIO_CONFIG);
    return {
      ...def,
      ...partial,
      vsBanner: { ...def.vsBanner, ...(partial.vsBanner ?? {}) },
      brandBlock: { ...def.brandBlock, ...(partial.brandBlock ?? {}) },
      stingerPromo: { ...def.stingerPromo, ...(partial.stingerPromo ?? {}) },
      subscriberWidget: { ...def.subscriberWidget, ...(partial.subscriberWidget ?? {}) },
      donationBar: { ...def.donationBar, ...(partial.donationBar ?? {}) },
      superChatBar: { ...def.superChatBar, ...(partial.superChatBar ?? {}) },
      audio: {
        ...def.audio,
        ...(partial.audio ?? {}),
        channels: {
          four: { ...def.audio.channels.four, ...(partial.audio?.channels?.four ?? {}) },
          six: { ...def.audio.channels.six, ...(partial.audio?.channels?.six ?? {}) },
          wicket: { ...def.audio.channels.wicket, ...(partial.audio?.channels?.wicket ?? {}) },
          over: { ...def.audio.channels.over, ...(partial.audio?.channels?.over ?? {}) },
          milestone: { ...def.audio.channels.milestone, ...(partial.audio?.channels?.milestone ?? {}) },
          subAlert: { ...def.audio.channels.subAlert, ...(partial.audio?.channels?.subAlert ?? {}) },
        },
      },
    };
  }

  get(): StudioConfig {
    return structuredClone(this.config);
  }

  getPublic(): StudioConfig {
    const copy = this.get();
    // Never expose raw YouTube API keys to public overlay clients; mask when reading if desired,
    // keep actual value in config store for server-side polling.
    if (copy.subscriberWidget.youtubeApiKey) {
      copy.subscriberWidget.youtubeApiKey = '••••••••';
    }
    return copy;
  }

  getRawYoutubeCredentials(): { channelId: string; apiKey: string } {
    return {
      channelId: this.config.subscriberWidget.youtubeChannelId.trim(),
      apiKey: this.config.subscriberWidget.youtubeApiKey.trim(),
    };
  }

  update(patch: StudioConfigPatch): StudioConfig {
    const next = structuredClone(this.config);
    if (patch.pollIntervalMs !== undefined) next.pollIntervalMs = patch.pollIntervalMs;
    if (patch.overlayViewMode !== undefined) next.overlayViewMode = patch.overlayViewMode;
    if (patch.autoBowlingCardOnOver !== undefined) next.autoBowlingCardOnOver = patch.autoBowlingCardOnOver;
    if (patch.autoBowlingCardDurationMs !== undefined) next.autoBowlingCardDurationMs = patch.autoBowlingCardDurationMs;
    if (patch.showBottomTicker !== undefined) next.showBottomTicker = patch.showBottomTicker;
    if (patch.vsBanner) next.vsBanner = { ...next.vsBanner, ...patch.vsBanner };
    if (patch.brandBlock) next.brandBlock = { ...next.brandBlock, ...patch.brandBlock };
    if (patch.stingerPromo) next.stingerPromo = { ...next.stingerPromo, ...patch.stingerPromo };
    if (patch.subscriberWidget) {
      const subPatch = { ...patch.subscriberWidget };
      if (subPatch.youtubeApiKey === '••••••••') {
        delete subPatch.youtubeApiKey;
      }
      next.subscriberWidget = { ...next.subscriberWidget, ...subPatch };
    }
    if (patch.donationBar) next.donationBar = { ...next.donationBar, ...patch.donationBar };
    if (patch.superChatBar) next.superChatBar = { ...next.superChatBar, ...patch.superChatBar };
    if (patch.audio) {
      if (patch.audio.masterEnabled !== undefined) next.audio.masterEnabled = patch.audio.masterEnabled;
      if (patch.audio.masterVolume !== undefined) next.audio.masterVolume = patch.audio.masterVolume;
      if (patch.audio.channels) {
        for (const k of ['four', 'six', 'wicket', 'over', 'milestone', 'subAlert'] as const) {
          const chPatch = patch.audio.channels[k];
          if (chPatch) {
            next.audio.channels[k] = { ...next.audio.channels[k], ...chPatch };
          }
        }
      }
    }

    this.config = next;
    this.persist();
    return this.getPublic();
  }

  private persist(): void {
    try {
      const tmp = `${CONFIG_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.config, null, 2), 'utf8');
      fs.renameSync(tmp, CONFIG_FILE);
    } catch (err) {
      logger.error('Failed to persist StudioConfig', { err });
    }
  }
}

export function saveLastMatch(matchKey: string, sourceUrl: string): void {
  try {
    ensureDataDirectories();
    fs.writeFileSync(LAST_MATCH_FILE, JSON.stringify({ matchKey, sourceUrl }, null, 2), 'utf8');
  } catch (err) {
    logger.warn('Failed to persist last match', { err });
  }
}

export function loadLastMatch(): { matchKey: string; sourceUrl: string } | null {
  try {
    if (!fs.existsSync(LAST_MATCH_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(LAST_MATCH_FILE, 'utf8')) as {
      matchKey?: string;
      sourceUrl?: string;
    };
    if (data.matchKey && /^[A-Za-z0-9]{2,12}$/.test(data.matchKey)) {
      return {
        matchKey: data.matchKey,
        sourceUrl: data.sourceUrl || `https://crex.com/cricket-live-score/match-${data.matchKey}`,
      };
    }
  } catch {
    return null;
  }
  return null;
}
