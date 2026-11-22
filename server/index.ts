import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerWsMessage } from '../shared/types.js';
import { APP_ROOT, ConfigStore, ENV, UPLOADS_DIR, ensureDataDirectories } from './config.js';
import { MatchOrchestrator } from './crex/poller.js';
import { createApiRouter } from './routes/api.js';
import { createProxyRouter } from './routes/proxy.js';
import { createUploadsRouter } from './routes/uploads.js';
import { logger } from './utils/logger.js';

export function createAppServer() {
  ensureDataDirectories();
  const app = express();
  const configStore = new ConfigStore();
  const orchestrator = new MatchOrchestrator(configStore);

  app.use(
    helmet({
      // Allow OBS Browser Source & Studio iframe previews cleanly on localhost
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      frameguard: false,
    })
  );
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Serve user uploaded images & custom SFX safely with nosniff
  app.use(
    '/uploads',
    express.static(UPLOADS_DIR, {
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=86400');
      },
    })
  );

  // Serve built-in broadcast SFX WAV assets
  const publicSfxDir = path.resolve(APP_ROOT, 'public', 'sfx');
  app.use(
    '/sfx',
    express.static(publicSfxDir, {
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=86400');
      },
    })
  );

  // API Routes
  app.use('/api', createApiRouter(configStore, orchestrator));
  app.use('/api', createProxyRouter());
  app.use('/api', createUploadsRouter());

  // Production built SPA fallback (serves both / Control Studio and /overlay OBS Browser Source)
  const distClientDir = path.resolve(APP_ROOT, 'dist', 'client');
  if (fs.existsSync(distClientDir)) {
    app.use(express.static(distClientDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) {
        next();
        return;
      }
      res.sendFile(path.join(distClientDir, 'index.html'));
    });
  }

  // Error handling middleware (handles multer limits & unexpected JSON errors cleanly)
  app.use(
    (
      err: Error & { code?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'Uploaded file is too large (max 10 MB).' });
        return;
      }
      logger.error('Unhandled API error', { err });
      res.status(500).json({ error: 'Internal server error.' });
    }
  );

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcast = (message: ServerWsMessage) => {
    const serialized = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  };

  wss.on('connection', (ws) => {
    orchestrator.setClientsCount(wss.clients.size);
    const initMsg: ServerWsMessage = {
      type: 'init',
      payload: {
        snapshot: orchestrator.getSnapshot(),
        config: configStore.getPublic(),
        status: orchestrator.getStatus(),
        recentEvents: orchestrator.getRecentEvents(),
      },
    };
    ws.send(JSON.stringify(initMsg));

    ws.on('close', () => {
      orchestrator.setClientsCount(wss.clients.size);
    });
  });

  orchestrator.on('snapshot', (snapshot) => broadcast({ type: 'snapshot', payload: snapshot }));
  orchestrator.on('config', (config) => broadcast({ type: 'config', payload: config }));
  orchestrator.on('status', (status) => broadcast({ type: 'status', payload: status }));
  orchestrator.on('event', (event) => broadcast({ type: 'event', payload: event }));
  orchestrator.on('subAlert', (alert) => broadcast({ type: 'sub_alert', payload: alert }));

  return { app, server, wss, orchestrator, configStore };
}

const entryArg = process.argv[1] ? path.resolve(process.argv[1]).replace(/\\/g, '/') : '';
const isEntrypoint = entryArg.endsWith('server/index.js') || entryArg.endsWith('server/index.ts');

if (isEntrypoint) {
  const { server, orchestrator } = createAppServer();

  server.listen(ENV.PORT, ENV.HOST, () => {
    logger.info('Crex OBS Broadcast Studio server started', {
      studioUrl: `http://${ENV.HOST}:${ENV.PORT}/`,
      overlayUrl: `http://${ENV.HOST}:${ENV.PORT}/overlay`,
    });
    void orchestrator.bootstrapLastMatch();
  });

  const shutdown = () => {
    logger.info('Shutting down gracefully');
    orchestrator.shutdown();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
