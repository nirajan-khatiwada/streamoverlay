# Crex OBS Broadcast Studio

Self-contained, automated live cricket streaming overlay and broadcast control platform for **OBS Studio**, powered by reverse-engineered `crex.com` live data feeds and zero-API-key live YouTube subscriber counters.

This document is designed as a complete technical handoff for engineers and AI agents: it documents the full architecture, reverse-engineered Crex APIs and field decoders, YouTube live subscriber pipeline, OBS overlay internals, REST/WebSocket contracts, security boundaries, and operational runbooks.

---

## 1. Quick Start & OBS Studio Setup

### Prerequisites
- **Node.js** `>= 20` (tested on `v24.18.0`)
- **Python 3** (optional — only needed if regenerating built-in WAV SFX assets via `npm run gen:sfx`)

### Run Production Build (Single Port `3000`)
```bash
npm install
npm run build
npm start
```
- **Broadcast Control Studio (Operator UI):** `http://127.0.0.1:3000/`
- **OBS Studio Browser Source URL:** `http://127.0.0.1:3000/overlay`

### Run Development Mode (Hot Reload)
```bash
npm run dev
```
- Backend Express + WebSocket server runs on `http://127.0.0.1:3000`
- Vite dev server runs on `http://localhost:5173` (proxies `/api`, `/uploads`, `/ws` to port `3000`)

### Add to OBS Studio
1. In OBS Studio, click **+** under **Sources** → **Browser**.
2. Set **URL** to `http://127.0.0.1:3000/overlay`.
3. Set **Width** `1920` and **Height** `1080` (or `1280` × `720` — the overlay uses a locked `1920×1080` virtual broadcast stage scaled automatically to any 16:9 canvas).
4. Check **"Control audio via OBS"** so automatic `FOUR`, `SIX`, `WICKET`, `OVER`, `50/100`, and `SUB ALERT` sound effects route directly into your OBS Audio Mixer without requiring user interaction.
5. Set **FPS** to `60` and click **OK**.

---

## 2. Environment Variables & Persisted State

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP + WebSocket server port |
| `HOST` | `127.0.0.1` | Bind host (`0.0.0.0` for LAN access from another streaming PC) |
| `CREX_API_VERSION` | `96.0.0` | `Version` header sent to Crex APIs (extracted from Crex Angular bundle `kiQV`) |
| `CREX_AUTH_TOKEN` | *(built-in public web client JWT in `server/config.ts`)* | Static public `authorization` JWT used by `crex.com`'s Angular HTTP interceptor (`Kr.withClientHeaders`) |
| `LOG_LEVEL` | `info` | Set `debug` for verbose diagnostic logs |

### Runtime Data Directory (`data/`, gitignored)
- `data/config.json` — Persisted `StudioConfig` (branding, VS banner, donations, Super Chat, subscriber settings, YouTube handle/channel ID, audio mixer settings, polling interval). Atomic write via `.tmp` + rename.
- `data/crex-entities.json` — Persistent cache of resolved Crex `f_key` dictionaries (players, teams, brand colors, series, venues, umpires) to minimize `getHomeMapData` calls.
- `data/last-match.json` — Last attached Crex match key and URL (auto-reconnected on server restart).
- `data/uploads/` — Magic-byte validated user-uploaded images (VS banner, channel logo, stinger promo, payment icon) and custom SFX audio files, served under `/uploads/<uuid>.<ext>`.

---

## 3. Reverse-Engineered `crex.com` API Reference

Verified directly from `crex.com`'s production Angular SPA (`main-es2015` + lazy chunks `1`, `5`, `12`, `15`, `18`, `26`, `45`) and live HTTP responses.

### Transport & Authentication
- **No WebSockets or Firebase RTDB push are used by Crex for live scores.** Crex uses HTTP polling (`2s–4s`) with **`ETag` / `If-None-Match`** returning `304 Not Modified` when no ball has changed.
- **No response encryption or obfuscation.** Payloads are plain JSON using compact delimited strings and Base-36 alphanumeric entity keys (`f_key`).
- **Required HTTP Headers** (configured in `server/crex/client.ts` & `server/config.ts`):
  ```http
  Version: 96.0.0
  authorization: <CREX_AUTH_TOKEN from server/config.ts>
  Content-Type: application/json
  Origin: https://crex.com
  Referer: https://crex.com/
  ```
  > **Maintenance Note (If Crex Updates Its Web Client):** Open `https://crex.com/` in DevTools, inspect `main-es2015.*.js`, search for `withClientHeaders` (interceptor `Kr`) and `Version` (`kiQV`), and update `CREX_API_VERSION` / `CREX_AUTH_TOKEN` via environment variables or `server/config.ts`.

### URL → `matchKey` Extraction (`server/crex/urlParser.ts`)
- Allowed hostnames: `crex.com`, `www.crex.com`, `m.crex.com` (strictly allowlisted to prevent SSRF).
- Strip query string and trailing sub-routes (`/match-details`, `/match-scorecard`, `/stats`, `/news`, `/live`, `/info`).
- Extract the final hyphen-separated token of the match slug (preserving original case!):
  - `https://crex.com/cricket-live-score/ind-vs-nz-1st-test-...-match-updates-12JM` → **`12JM`**
  - `https://crex.com/cricket-live-score/...-12JM/match-details` → **`12JM`**
  - `https://crex.com/social/...-12JM/comments` → **`12JM`**
  - Raw key input `12JM` → **`12JM`** (validated against `/^[A-Za-z0-9]{2,12}$/`).

### Upstream Crex Endpoints

| Purpose | Method & URL | Notes |
| --- | --- | --- |
| **Live Match State (`sV3`)** | `GET https://api.goscorer.com/api/v3/getSV3?key=<matchKey>` | Primary live feed; supports `If-None-Match` (`ETag` → `304`) |
| **Full Scorecard (`sC4`)** | `GET https://api.goscorer.com/api/v3/getSC4?key=<matchKey>` | Returns array of innings (`batters`, `yetToBat` + averages, `bowlers`, `extras`, `partnerships`) |
| **Match Info & Playing XI (`iV4`)** | `GET https://api.goscorer.com/api/v3/getIV4?key=<matchKey>` | Playing XI (`tp`), Captain/WK (`x`), Toss (`y`), Weather (`wU`), Head-to-Head (`hth`), Venue (`v`) |
| **Match Metadata** | `POST https://stats.crickapi.com/live/getMatchMetaData` | Body: `{ "mf": "<matchKey>" }` |
| **Entity Dictionary Resolver** | `POST https://oc.crickapi.com/mapping/getHomeMapData` | Header `type: liveparsing`; Body: `{ p, t, s, u, v, lc: "en" }` |
| **Ball-by-Ball Commentary** | `POST https://content.crickapi.com/commentary/v2/getBallFeeds` | Body: `{ matchKey, lastDocId: null, filters: {...}, lang: "en" }`; supports `ETag` |
| **Live / Top Matches List** | `GET https://api.goscorer.com/api/v3/getLiveMatches` + `POST https://api.goscorer.com/api/v4/getTopMatches` | Used by Studio's 1-click Auto-Discovered Crex Matches browser (`cc: "IN"`, `platform: "crex-web"`) |

### `getSV3` Compact Field Decoding (`server/crex/parser.ts`)

| Field | Format / Example | Meaning & Decoding Rule |
| --- | --- | --- |
| `i` | `"42/2.4.2"` or `"4/1.2"` | Split on `/[(/.]+/`: `[W0, D, k, I]`. `inning = D + 1`. `k` (strip `*`) is toss/order (`1`=`T1 BAT`, `2`=`T1 BOWL`, `3`=`T2 BAT`, `4`=`T2 BOWL`). `I` handles Test follow-on display. If `W0 < 12`: `status = floor(W0/4)` (`0`=Upcoming, `1`=Live, `2`=Finished), `W0 % 4` (`0`=T20, `1`=ODI, `2`=TEST Day 1, `3`=100B if `hb==1` else T10). If `W0 >= 12`: `TEST`, `day = floor(W0/12)+1`, `status = floor((W0%12)/4)`. `*` indicates active Powerplay. |
| `a` | `"R.O"` | Dot-separated team `f_key` pair `[F0, F1]`. Batting team is dynamically placed on the **LEFT** (red badge) and bowling team on the **RIGHT** (blue badge) across all innings. |
| `j`, `k`, `J`, `K` | `"368/10(121.0"`, `"!720/9(166.0"` | Innings 1–4 scores: `[!]runs/wickets(overs.balls`. Leading `!` = declared. |
| `T` | `"120.156"` | Revised/DLS `<maxBalls>.<target>`. |
| `hb` | `1` | The Hundred (`100B`) mode: **5 balls per set/over** instead of 6. |
| `B` | `"B"`, `"O"`, `"4"`, `"6"`, `"^2"`, `"wd"`, `"fh"`, `"tu"` | Live center badge event code: `B`=Ball, `O`=Over, `0–6`=Runs, `W`/`^1..^14`=Wicket + dismissal type (`^1` Bowled, `^2` Caught, `^3` C&B, `^4` Run Out, `^5` LBW, `^6` Hit Wicket, `^7` Caught Behind, `^8` Stumped, etc.), `wd`/`nb`/`lb`/`by`=Extras, `fh`=Free Hit, `tu`=3rd Umpire, `ba`=Ball In Air, `cd`=Catch Drop, `a`=Appeal, `i`=Innings Break, `d`=Drizzle, `ruka`=Stopped. When `status=2`, holds final result text. |
| `w` | `"3/3/47/0/1/0/0"` | Test match state: `session / breakCode (0=Lunch, 1=Tea, 2=Stumps) / oversQuotaToday / decl1 / decl2 / decl3 / decl4`. |
| `e` | `"0"`..`"5"` | Toss/weather delay code (`1`=Toss Delay, `2`=Rain, `3`=Bad Weather, `4`=Bad Light, `5`=Wet Outfield). |
| `p`, `q`, `r`, `s`, `t` | `p:"4W3*.4W1"`, `q:"9.29*"`, `r:"1.0.4.9"` | Batsmen 1 & 2: `p`=`bat1[*].bat2[*]` (`*` in `p` is Crex's `ot1`/`ot2` **OUT** flag — turns the dismissed batsman's avatar grayscale B&W with an `OUT` badge until the incoming batter replaces them); `q`/`s`=`runs.balls[*]` (`*` = **on strike**); `r`/`t`=`fours.sixes._._.isImpact`. |
| `b`, `c` | `b:"AJ"`, `c:"31.48.1.36"` | Current bowler `f_key` and `runsConceded.ballsBowled.wickets._.isImpact`. |
| `rb` | `[{ o: 31, r: 2, b: [{ u:"2", t:0 }] }]` | Structured recent overs array (`t`: `1`=wicket, `2`=four, `3`=six). Falls back to `l`, `m`, `n` (`"30:0.1.1.0.1.0"`) + `A` (`"0.0.2"`) if `rb` is absent. |
| `x`, `pb` | `x:"EW.31.59.60.133.2.AJ"` | Last wicket: `playerKey.runs.balls.teamRunsAtFall.teamBallsAtFall.dismissalCode.bowlerKey.fielderKey`. Partnership = `(teamRuns - teamRunsAtFall)` runs off `(teamBalls - teamBallsAtFall + pb)` balls. |
| `R`, `F`, `wp` | `R:"42+2"` or `"1000-0,1.65-1.66,2.54-2.56"` | Live Win Probability: Limited-overs `rate1+diff` → `favPer = round(100 - ((2*r0+r1)/2)/2)`. Test 3-way CSV → inverse-midpoint normalization across Team 1, Team 2, Draw. Falls back to `wp` fan poll (`team1Key,v1,v2,vDraw`). |
| `g` | `"F0.O5"` | Captain `f_key` pair matching `a` — powers the automatic **Captains VS** banner when no custom image is uploaded. |

### `getIV4` & `getSC4` Key Fields
- **`getIV4.y`**: Toss decision code (`"1"`–`"4"`, same mapping as `getSV3.i` `k`).
- **`getIV4.x`**: `"<t1Captain>/<t1WK>/<t2Captain>/<t2WK>"`.
- **`getIV4.tp`**: `"<team1XI>/<team2XI>"`, each player `-`-delimited, dot-separated: `playerKey.matches.role(1=BAT,2=BOWL,3=AR)._.isOverseas(1=yes)...`.
- **`getSC4[i].b`**: Batters played (`key.runs.balls.4s.6s.fallBalls.fallRuns.dismissal.bowler.fielder/avg-sr`) and Yet-to-Bat entries (`key/avg-sr` where dot-split length ≤ 1) used for the scrolling `YET TO BAT PLAYERS:` bottom marquee.
- **`getSC4[i].a`**: Bowlers (`key.runs.balls.maidens.wickets`), ranked to assign the yellow `BEST` badge.

### Crex Akamai Image CDN Templates (Proxied via `/api/proxy-image`)
All images are served through the allowlisted, locally cached proxy (`server/routes/proxy.ts`, 1-hour LRU cache, 400 items) with custom SVG fallbacks on 404:
- **Team Logo (`kind=team`):** `https://cricketvectors.akamaized.net/Teams/<key>.png`
- **Player Headshot (`kind=player`):** `https://cricketvectors.akamaized.net/players/org/<key>.png` (fallback: helmeted batsman silhouette SVG)
- **Limited-Overs Jersey (`kind=jersey-limited`):** `https://cricketvectors.akamaized.net/jersey/limited/org/<teamKey>.png`
- **Test Jersey (`kind=jersey-test`):** `https://cricketvectors.akamaized.net/jersey/test/org/<teamKey>.png`
- **Series Logo (`kind=series`):** `https://cricketvectors.akamaized.net/Series/<key>.png`

Player portraits in the overlay (`PlayerAvatar.tsx`) composite the team jersey PNG underneath the transparent player headshot PNG so players automatically wear the right kit (Test whites vs colored limited-overs jersey).

---

## 4. Automatic Live YouTube Subscriber Counter (`server/youtube/subTracker.ts`)

Users only enter a YouTube handle like **`@Mythpat`**, **`Mythpat`**, a channel URL (`https://www.youtube.com/@Mythpat`), or a `UC...` Channel ID — **no Google Cloud API key is required**.

1. **SSRF-Safe Input Parser (`parseYoutubeChannelInput`):** Allowlists only `youtube.com`, `www.youtube.com`, `m.youtube.com`, strict handle regex `/^[A-Za-z0-9._-]{2,60}$/`, and Channel ID regex `/^UC[A-Za-z0-9_-]{22}$/`.
2. **One-Time Handle Resolution (`resolveYoutubeChannel`):** Resolves `@handle` → canonical `UC...` Channel ID and title via `https://www.youtube.com/@<handle>` (with `api.socialcounts.org/.../search/<handle>` fallback) and caches/persists it in `data/config.json`.
3. **5-Second Fault-Tolerant Live Count Cascade (`fetchLiveSubscriberCount`):**
   - **Primary:** `https://api.socialcounts.org/youtube-live-subscriber-count/<channelId>` (`counters.estimation.subscriberCount`)
   - **Secondary:** `https://mixerno.space/api/youtube-channel-counter/user/<channelId>` (`counts[value=subscribers].count`)
   - **Optional Official Fallback:** YouTube Data API v3 (`channels?part=statistics`) if the user optionally enters an API key in Studio
   - **Final Fallback:** Public YouTube page abbreviated subscriber text (`17.8M` → `17800000`)
4. **Live Broadcast Sync:** Sticky provider preference keeps the count smooth; every update pushes `config` over WebSocket and triggers the overlay's vertical rolling `OdometerNumber`.
5. **Subscriber Goal Loading Bar Widget (`client/src/overlay/MiddleSection.tsx`):**
   - In place of static eSewa and alert strips, the overlay features an animated broadcast **Subscriber Goal Loading-Type Widget**.
   - Directly linked to the user's uploaded YouTube channel (e.g. **`@Mythpat`**), reading the live count (`17,834,707`) against the user's customizable target goal (e.g. `18,000,000`).
   - Features:
     - Red YouTube badge + channel handle + customizable Goal Badge (e.g. `ROAD TO 18M`).
     - Live numbers readout: `17,834,707 / 18,000,000` with dynamic percentage pill (e.g. `99.1%`).
     - **Loading-Type Animated Progress Bar:** Recessed dark track with animated diagonal broadcast stripes continuously sweeping across the fill bar (`@keyframes ov-goal-stripes-move`) and a pulsating glowing leading edge (`@keyframes ov-goal-lead-pulse`).
     - Subtext showing remaining count (e.g. `165,293 TO GO!`) and green `● LIVE YOUTUBE SYNC` indicator.
   - Configurable in the Control Studio with preset buttons (`18M Goal`, `20M Goal`, `Next 100K`, `Next 1M`).

---

## 5. Automatic Broadcast Event Stingers & SFX System

- **Automatic Detection (`server/crex/eventDetector.ts`):** Every live poll diffs the new `MatchSnapshot` against the prior snapshot:
  - **Initial Hydration Protection:** Never fires events on initial match attach/boot (seeds existing 50/100 milestones silently).
  - **Per-Delivery Deduplication:** Keys events by inning/score/ball/over fingerprint so repeated 2–4s polls never double-trigger.
  - **Priority Order:** `WICKET` > `SIX` > `FOUR` > `MILESTONE_50` / `MILESTONE_100` > `OVER`.
- **Full-Screen Neon Stinger (`client/src/overlay/EventStinger.tsx`):** Automatically takes over the `1920×1080` canvas (~2.6–3.2s) with a black radial backdrop, cyan-to-magenta neon trapezoid SVG frame, glowing kinetic display text (`FOUR`, `SIX`, `WICKET`, `FIFTY!`, `CENTURY!`), dynamic batsman/dismissal subtitle, and optional customizable bottom promo banner.
- **Built-In Mastered Stereo SFX (`public/sfx/`):** Synthesized via `scripts/generate-sfx.py` (`python scripts/generate-sfx.py`, zero third-party Python packages):
  - `four.wav` (willow crack + rising brass stab + stadium cheer)
  - `six.wav` (sweet-spot crack + sub-bass boom + fanfare + stadium eruption)
  - `wicket.wav` (3-impact timber stump shatter + dramatic sub drop & brass tension + crowd gasp/roar)
  - `over.wav`, `milestone.wav`, `sub-alert.wav`
- **Continuous Live Stadium Background Ambience (`public/sfx/stadium-ambient.mp3`):**
  - Continuous looping crowd atmosphere, cheers, and stadium ambience that plays all the time to make viewers feel like they are inside a live cricket stadium.
  - Automatically loops seamlessly on the OBS overlay (`http://127.0.0.1:3000/overlay`) with hardware-accelerated playback and Web Audio synchronization.
  - **Live Audio Mixer Controls (`client/src/studio/AudioMixerPanel.tsx`):**
    - **Enable/Mute Toggle:** Turn live stadium ambience on or off on the fly.
    - **Continuous Volume Slider:** 0%–100% volume control (defaults to balanced 40% so it sits naturally under commentary and event SFX).
    - **In-Studio Preview:** One-click audition button with instant playback.
    - **Custom File Uploader:** Upload any custom stadium crowd WAV/MP3 track, or reset back to default `stadium-ambient.mp3`.
  - Event stingers (FOUR, SIX, WICKET, milestones) trigger on top of the ambient crowd sound cleanly without interrupting the background loop.
- **Client Audio Engine (`client/src/hooks/useSoundEngine.ts`):** Uses Web Audio API (`AudioContext` + `decodeAudioData` buffer caching) for zero-latency playback in OBS Chromium, with a procedural Web Audio synth fallback if decoding fails. Studio preview iframe (`/overlay?preview=1`) is muted by default to prevent double-echo alongside OBS, with an optional **"Monitor SFX in Studio"** toggle.

---

## 6. REST API & WebSocket Protocol

### WebSocket (`ws://<host>:<port>/ws`)
All OBS overlays and Studio windows subscribe to `/ws`. Messages (`ServerWsMessage` in `shared/types.ts`):
- `{ type: "init", payload: { snapshot, config, status, recentEvents } }` — sent immediately on connect
- `{ type: "snapshot", payload: MatchSnapshot }` — every live score/ball update
- `{ type: "config", payload: StudioConfig }` — any branding, cutaway, ticker, audio, or live sub count change
- `{ type: "status", payload: ConnectionStatus }` — poller health, poll/304 counts, OBS client count
- `{ type: "event", payload: BroadcastEvent }` — triggers full-screen neon stinger + SFX
- `{ type: "sub_alert", payload: { id, subscriberName, message, timestamp } }` — sliding subscriber notification

### HTTP REST Endpoints

| Method & Endpoint | Body / Query | Description |
| --- | --- | --- |
| `GET /api/healthz` | — | Liveness/readiness probe with uptime & poller status |
| `GET /api/state` | — | Full bootstrap payload (`snapshot`, `config`, `status`, `recentEvents`) |
| `GET /api/crex/live-matches` | — | Fetches & resolves live, upcoming, and recent Crex matches |
| `POST /api/match/attach` | `{ "url": "<crex url or key>" }` | Validates URL/key, attaches live poller, saves to `data/last-match.json` |
| `POST /api/match/refresh` | — | Forces immediate uncached Crex poll (clears ETags) |
| `GET /api/config` | — | Returns public `StudioConfig` (masks `youtubeApiKey`) |
| `PATCH /api/config` | `Partial<StudioConfig>` (Zod validated) | Persists settings and broadcasts live to all OBS overlays |
| `POST /api/events/trigger` | `{ "type": "FOUR"\|"SIX"\|"WICKET"\|"OVER"\|"MILESTONE_50"\|"MILESTONE_100", "subtitle"?: string }` | Manual test/override trigger for stinger + SFX |
| `POST /api/alerts/subscriber` | `{ "subscriberName": "NAME", "incrementCount"?: true }` | Webhook / Studio trigger for sliding subscriber alert + chime |
| `POST /api/youtube/connect` | `{ "handle": "@Mythpat" }` | Resolves YouTube handle/URL/ID and enables 5s live sub syncing |
| `POST /api/youtube/disconnect` | — | Stops automatic YouTube subscriber syncing |
| `POST /api/simulator/toggle` | `{ "enabled": true\|false }` | Starts/stops automated ball-by-ball match simulator |
| `POST /api/simulator/step` | `{ "outcome": "BALL"\|"0"\|"1"\|"2"\|"3"\|"4"\|"6"\|"W"\|"WD"\|"NB" }` | Steps one simulated delivery through full scoreboard + event pipeline |
| `POST /api/uploads/image` | `multipart/form-data` (`file`, max 5 MB) | Magic-byte validated PNG/JPG/WebP/GIF upload → `{ url }` |
| `POST /api/uploads/audio` | `multipart/form-data` (`file`, max 10 MB) | Magic-byte validated WAV/MP3/OGG/WebM/M4A upload → `{ url }` |
| `GET /api/proxy-image` | `?kind=team\|player\|jersey-limited\|jersey-test\|series&key=<id>` | Allowlisted cached Crex CDN proxy with SVG fallbacks |

#### External Webhook Example (StreamElements / Streamlabs / Chat Bot)
```bash
curl -X POST http://127.0.0.1:3000/api/alerts/subscriber \
  -H "Content-Type: application/json" \
  -d '{"subscriberName":"SANJIB1993NP","incrementCount":true}'
```

---

## 7. Project Structure

```text
├── shared/
│   └── types.ts                   # Shared TypeScript contracts (MatchSnapshot, StudioConfig, WS messages)
├── server/
│   ├── index.ts                   # Express + WebSocket bootstrap, static serving, graceful shutdown
│   ├── config.ts                  # Env config, Zod StudioConfig validator, atomic JSON persistence
│   ├── crex/
│   │   ├── urlParser.ts           # SSRF-safe Crex URL / matchKey parser
│   │   ├── client.ts              # Crex HTTP client (ETag, retries, timeouts, entity map cache)
│   │   ├── parser.ts              # getSV3 / getSC4 / getIV4 / getBallFeeds / live matches decoder
│   │   ├── eventDetector.ts       # Deterministic FOUR/SIX/WICKET/50/100/OVER diff detector
│   │   └── poller.ts              # Live orchestrator, auto bowling card, simulator, YT sub poller
│   ├── youtube/
│   │   └── subTracker.ts          # SSRF-safe @handle resolver + SocialCounts/Mixerno/API cascade
│   ├── routes/
│   │   ├── api.ts                 # Control, match attach, simulator, YouTube, alert endpoints
│   │   ├── proxy.ts               # Allowlisted Crex Akamai CDN image proxy + SVG fallbacks
│   │   └── uploads.ts             # Multer v2 + magic-byte validated image/audio uploads
│   └── utils/
│       ├── logger.ts              # Structured JSON logger with automatic secret redaction
│       └── fileValidation.ts      # Binary magic-byte header verifier (PNG/JPG/WebP/GIF/WAV/MP3/OGG/WebM/M4A)
├── client/
│   ├── index.html                 # HTML5 shell + Google broadcast fonts
│   └── src/
│       ├── main.tsx               # Route switch (/ Studio vs /overlay OBS Source)
│       ├── hooks/
│       │   ├── useBroadcastSocket.ts # REST bootstrap + auto-reconnecting WebSocket client
│       │   └── useSoundEngine.ts     # Web Audio API low-latency SFX engine + synth fallback
│       ├── overlay/               # Locked 1920x1080 broadcast stage & all live/cutaway/stinger views
│       ├── studio/                # Operator Control Studio (Match Source, Branding, Subs/Donations, Audio, Director Deck)
│       └── styles/                # tokens.css, overlay.css, studio.css
├── scripts/
│   └── generate-sfx.py            # Generates mastered stereo broadcast SFX WAVs in public/sfx/
├── public/sfx/                    # Built-in broadcast WAV sound effects
└── tests/                         # Vitest unit & contract test suite
```

---

## 8. Broadcast Visual Dynamics & Dynamic Player Feedback

The broadcast overlay incorporates live TV broadcast design patterns:

### 1. Active Striker Recognition & Dynamic Theming
- **Dynamic Role Header:** The batsman currently on strike (`isStriker === true`) receives a vibrant hot-magenta (`#d81b60` / `#e91e63`) header cell with an animated golden `STRIKER` badge. The non-striker and bowler remain in broadcast dark-slate (`#040c1b`).
- **Strike Rotation:** As batsmen rotate strike on odd runs or over ends, the magenta highlight automatically shifts to the active batsman.
- **Card Styling:** The active batsman's column container gets `.ov-player-col--striker` featuring an illuminated gradient, a golden top accent edge, luminous golden name typography (`#fffb91`), and an `ON STRIKE` pill tag.

### 2. Blinking Bat Sticker
- The cricket bat sticker beside the striker's figures is animated with `@keyframes ov-bat-blink`. It rhythmically pulses, rotates subtly, and flashes with a golden aura (`#facc15`), drawing viewer attention to the active batsman.

### 3. Current Delivery Ball Ripple & Radar Animation
- In the overs strip, the single latest bowled delivery (`isLatest: true`) features an animated cyan circular border with continuous concentric radar ripple rings (`.ov-ball-ripple-ring` and `.ov-ball-ripple-ring-outer`) expanding smoothly outward.
- The ring dynamically tints to match the delivery outcome (electric violet `#e040fb` for SIX, fiery red `#ff3838` for WICKET, vibrant green `#00e676` for FOUR).

### 4. Main Scoreboard Score Label Zoom In/Out
- The main batting team score label (`.ov-team-score`) in the top scoreboard features `@keyframes ov-score-pop`. On each run update, it scales up to 122% with a warm golden flash (`#fffb8f`), then zooms out smoothly with elastic settling.
- Uses `transform-origin: left center` for batting and `right center` for bowling scores to prevent layout shifting.

### 5. Dismissed Batsman Grayscale & Persistent `OUT` Badge
- When a wicket falls, the dismissed batsman's avatar immediately transitions to a high-contrast black-and-white grayscale filter (`filter: grayscale(100%) contrast(1.08) brightness(0.84)`).
- A prominent red `OUT` badge appears over his figures, and his role header reverts to dark, remaining in this state until the incoming batsman walks in.

### 6. Accessibility & Performance
- All animations use hardware-accelerated compositor properties (`transform`, `opacity`, `filter`).
- Supports `@media (prefers-reduced-motion: reduce)`, automatically disabling looping pulses and pops for viewers or stream encoders requiring reduced motion.

---

## 9. Security & Verification

### Security Controls Implemented
- **Zero-Trust Input Validation:** All REST inputs validated with `zod` v4 schemas.
- **SSRF Protection:** Strict hostname allowlists on both Crex match URLs (`crex.com`), YouTube channel URLs (`youtube.com`), and Crex CDN image proxy (`kind` enum + alphanumeric key regex).
- **Safe File Uploads:** `multer` v2 memory storage with size ceilings (5 MB images, 10 MB audio), extension allowlists, binary **magic-byte signature checks** (`server/utils/fileValidation.ts`), UUID filenames outside source code, and `X-Content-Type-Options: nosniff`.
- **Log & Secret Hygiene:** Structured logger automatically redacts `authorization`, `apiKey`, `token`, `secret`, `password`; `GET /api/config` masks any stored YouTube API key.

### Verification Commands
```bash
npm run typecheck   # Strict client + server TypeScript check
npm test            # Vitest suite (20 tests across 5 files)
npm run build       # Server tsc + Client Vite production build
npm audit --omit=dev
```
