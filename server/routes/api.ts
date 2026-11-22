import { Router } from 'express';
import { z } from 'zod';
import { ConfigStore, studioConfigPatchSchema } from '../config.js';
import type { MatchOrchestrator } from '../crex/poller.js';

const attachSchema = z.object({
  url: z.string().min(2).max(500),
});

const triggerEventSchema = z.object({
  type: z.enum(['FOUR', 'SIX', 'WICKET', 'OVER', 'MILESTONE_50', 'MILESTONE_100']),
  subtitle: z.string().max(120).optional(),
});

const subAlertSchema = z.object({
  subscriberName: z.string().min(1).max(40),
  incrementCount: z.boolean().optional().default(true),
});

const simStepSchema = z.object({
  outcome: z.enum(['BALL', '0', '1', '2', '3', '4', '6', 'W', 'WD', 'NB']),
});

const simToggleSchema = z.object({
  enabled: z.boolean(),
});

const youtubeConnectSchema = z.object({
  handle: z.string().min(2).max(200),
});

export function createApiRouter(
  configStore: ConfigStore,
  orchestrator: MatchOrchestrator
): Router {
  const router = Router();

  router.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      uptimeSec: Math.round(process.uptime()),
      status: orchestrator.getStatus(),
    });
  });

  router.get('/state', (_req, res) => {
    res.json({
      snapshot: orchestrator.getSnapshot(),
      config: configStore.getPublic(),
      status: orchestrator.getStatus(),
      recentEvents: orchestrator.getRecentEvents(),
    });
  });

  router.get('/crex/live-matches', async (_req, res) => {
    try {
      const matches = await orchestrator.fetchLiveMatches();
      res.json({ matches });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Crex live matches';
      res.status(502).json({ error: message });
    }
  });

  router.post('/match/attach', async (req, res) => {
    const parsed = attachSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide a valid Crex match URL or match key.', details: parsed.error.flatten() });
      return;
    }

    try {
      const snapshot = await orchestrator.attachMatch(parsed.data.url);
      res.json({ snapshot, status: orchestrator.getStatus() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not attach match';
      res.status(400).json({ error: message });
    }
  });

  router.post('/match/refresh', async (_req, res) => {
    try {
      const snapshot = await orchestrator.forceRefresh();
      res.json({ snapshot, status: orchestrator.getStatus() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Refresh failed';
      res.status(502).json({ error: message });
    }
  });

  router.get('/config', (_req, res) => {
    res.json({ config: configStore.getPublic() });
  });

  router.patch('/config', (req, res) => {
    const parsed = studioConfigPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid studio config update.', details: parsed.error.flatten() });
      return;
    }
    const updated = configStore.update(parsed.data);
    orchestrator.onConfigChanged();
    res.json({ config: updated });
  });

  router.post('/events/trigger', (req, res) => {
    const parsed = triggerEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid event trigger payload.', details: parsed.error.flatten() });
      return;
    }
    const event = orchestrator.triggerManualEvent(parsed.data.type, parsed.data.subtitle);
    res.json({ event });
  });

  router.post('/alerts/subscriber', (req, res) => {
    const parsed = subAlertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid subscriber alert payload.', details: parsed.error.flatten() });
      return;
    }
    const alert = orchestrator.triggerSubscriberAlert(
      parsed.data.subscriberName,
      parsed.data.incrementCount
    );
    res.json({ alert, config: configStore.getPublic() });
  });

  router.post('/simulator/toggle', (req, res) => {
    const parsed = simToggleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid simulator toggle payload.' });
      return;
    }
    const running = orchestrator.toggleSimulator(parsed.data.enabled);
    res.json({ running, snapshot: orchestrator.getSnapshot(), status: orchestrator.getStatus() });
  });

  router.post('/simulator/step', (req, res) => {
    const parsed = simStepSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid simulator outcome.' });
      return;
    }
    const snapshot = orchestrator.stepSimulator(parsed.data.outcome);
    res.json({ snapshot });
  });

  router.post('/youtube/connect', async (req, res) => {
    const parsed = youtubeConnectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter a valid YouTube handle (e.g. @Mythpat) or channel URL.' });
      return;
    }
    try {
      const result = await orchestrator.connectYoutubeChannel(parsed.data.handle);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not connect YouTube channel.';
      res.status(400).json({ error: message });
    }
  });

  router.post('/youtube/disconnect', (_req, res) => {
    const config = orchestrator.disconnectYoutubeChannel();
    res.json({ config });
  });

  return router;
}
