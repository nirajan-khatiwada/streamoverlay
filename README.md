# Crex OBS Broadcast Studio

Automated end-to-end live cricket OBS Studio broadcast overlay & control platform powered by reverse-engineered `crex.com` live data feeds.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Regenerate broadcast-grade WAV sound effects
npm run gen:sfx

# 3. Build production bundle and start unified server (port 3000)
npm run build
npm start
```

Or run in hot-reload development mode:
```bash
npm run dev
```

- **Broadcast Control Studio:** `http://127.0.0.1:3000/` (or `http://localhost:5173/` during `npm run dev`)
- **OBS Studio Browser Source URL:** `http://127.0.0.1:3000/overlay`

## OBS Studio Setup

1. In OBS Studio, add a new **Browser** source (`+` -> `Browser`).
2. Set **URL** to `http://127.0.0.1:3000/overlay`.
3. Set **Width** `1920` and **Height** `1080` (or `1280` × `720` — the overlay uses a locked 1920×1080 virtual broadcast stage that scales cleanly to any 16:9 resolution).
4. Check **"Control audio via OBS"** so automatic `FOUR`, `SIX`, `WICKET`, `OVER`, `50/100`, and `SUB ALERT` sound effects route directly into your OBS Audio Mixer.
5. Set **FPS** to `60` and click **OK**.

## Architecture Overview

- **Crex Live Engine (`server/crex/`)**:
  - `urlParser.ts`: SSRF-safe match key extraction supporting `/cricket-live-score/...`, `/match-details`, `/match-scorecard`, `/social/...`, and raw keys (e.g. `12JM`, `11BO`).
  - `client.ts`: Reverse-engineered Crex API client (`getSV3`, `getSC4`, `getIV4`, `getMatchMetaData`, `getBallFeeds`, `getLiveMatches`, `getTopMatches`, `getHomeMapData`) with `ETag`/`If-None-Match` `304` caching, timeouts, exponential backoff, and disk-persisted entity name/color caching (`data/crex-entities.json`).
  - `parser.ts`: Full decoder for T20, ODI, T10, The Hundred (`100B`), and 4-innings Test/First-Class matches (follow-on, declarations, Day/Session/Lead/Trail, DLS targets, 2-way & 3-way Win Probability, Toss codes, Last Wicket, Partnership, Playing XI `[C]`/`[WK]`/overseas badges, and Yet-To-Bat averages).
  - `eventDetector.ts`: Deterministic delivery state-diff engine that triggers full-screen neon stingers and broadcast SFX on live `FOUR`, `SIX`, `WICKET`, `50`/`100` milestones, and `OVER` breaks without firing on initial attach or double-firing across polls.
- **Allowlisted Image Proxy (`server/routes/proxy.ts`)**: Caches Crex Akamai CDN team logos, player cutouts, and Test/limited-overs jerseys locally and serves a helmeted batsman silhouette SVG when a player's portrait is missing.
- **Validated Uploads (`server/routes/uploads.ts`)**: Magic-byte validated image (PNG/JPG/WebP/GIF) and custom audio (WAV/MP3/OGG/WebM/M4A) upload endpoints persisted under `data/uploads/`.
- **Webhooks**:
  - Trigger subscriber banner alerts from external bots/StreamElements:
    ```bash
    curl -X POST http://127.0.0.1:3000/api/alerts/subscriber \
      -H "Content-Type: application/json" \
      -d '{"subscriberName":"VIEWER_NAME","incrementCount":true}'
    ```

## Verification

```bash
npm run typecheck
npm test
npm run build
```
