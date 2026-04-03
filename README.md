# LovesfireAI – Cinematic Engine for AI-Generated Vertical Video

Backend service that converts long-form text scripts into stitched, 9:16, TikTok-ready MP4s with cinematic color grading, camera motion, and audio-reactive effects.

## Prerequisites

- **Node.js** >= 18
- **ffmpeg** installed and available on PATH

## Setup

```bash
npm install
```

## Run (Development)

```bash
npm run dev
```

Server starts on `http://localhost:3000`.

## Script Language

Each scene supports the following directives:

```
Scene 1
Visual: High-energy glitch transition with bass drop.
Audio: Stop scrolling. Most AI tools are built on old logic.
Style: cyber fade
Motion: jitter
BPM: 150
Intensity: high
Duration: 3s
```

| Directive | Required | Description |
|---|---|---|
| `Visual:` / `Description:` | Yes | Scene visual description |
| `Audio:` / `Text:` / `Narration:` | No | Onscreen text / voiceover |
| `Style:` | No | LUT preset name (auto-detects from description) |
| `Motion:` | No | Camera motion curve (auto-detects from description) |
| `BPM:` | No | Beats per minute for audio-reactive effects (40–220) |
| `Intensity:` | No | Audio intensity: `low`, `medium`, `high` |
| `Duration:` | No | Scene duration in seconds (default 5s) |

### LUT Presets (Style)

| Preset | Mood | Keywords |
|---|---|---|
| `neon pulse` | Electric, club | neon, pulse, electric, rave, strobe |
| `dream warmth` | Golden, cozy | warm, golden, sunset, dawn, fire, glow |
| `cold memory` | Icy, distant | cold, ice, frost, snow, memory, ghost |
| `analog film` | Retro, grain | film, grain, retro, vintage, vhs |
| `cyber fade` | Digital, tech | cyber, matrix, hack, digital, glitch |

### Camera Motion Curves (Motion)

| Curve | Effect |
|---|---|
| `drift` | Slow horizontal pan |
| `zoom in` | Ken Burns push-in |
| `zoom out` | Reverse Ken Burns pull-back |
| `jitter` | Handheld shake |
| `parallax` | Diagonal depth drift |
| `ease in` | Quadratic ease-in zoom |
| `none` | Static (no motion) |

### Audio-Reactive Effects

Automatically applied based on BPM, intensity, and scene description:

| Effect | Trigger | FFmpeg Modulation |
|---|---|---|
| **Vignette pulse** | Mid energy > 0.2 | Vignette angle oscillates at beat frequency |
| **Hue shift** | Bass energy > 0.3 | Hue rotates at half-beat frequency |
| **Brightness pulse** | Always | Brightness oscillates at beat frequency |
| **Noise bursts** | High energy > 0.4 | Temporal noise scaled by intensity |
| **Drop flash** | "drop"/"burst" in description | Saturation spike at scene midpoint |

## API

### `POST /render` — Queue a render

```json
{ "script": "Scene 1\nVisual: ...\nDuration: 3s\n\nScene 2\n..." }
```

**Response (202):**
```json
{
  "jobId": "d1c6d2b0-...",
  "message": "Render queued successfully.",
  "warnings": [{ "code": "GLITCH_APPLIED", "sceneId": 1, "field": "description", "message": "..." }]
}
```

### `GET /status/:id` — Poll job status + progress

```json
{
  "id": "d1c6d2b0-...",
  "manifestHash": "76c4c2ad090859ba",
  "status": "rendering",
  "progress": { "currentScene": 2, "totalScenes": 4, "phase": "rendering", "percent": 50 },
  "warnings": [...],
  "downloadUrl": null
}
```

Status values: `queued` → `planning` → `rendering` → `exporting` → `completed` | `failed`

### `GET /download/:id` — Download completed video

Returns `video/mp4` (409 if not yet complete).

### `GET /jobs` — Admin: list jobs

`GET /jobs?status=rendering&limit=10`

### `GET /stats` — Admin: queue stats

```json
{ "queued": 0, "active": 1, "maxWorkers": 2, "totalJobs": 5, "cacheSize": 2 }
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `VIDEO_BACKEND` | `mock` | Video generator backend (`mock`, `pika`, `runway`) |
| `DRY_RUN` | `false` | Print FFmpeg args without executing |
| `WORKER_COUNT` | `2` | Parallel render workers |
| `RENDER_TIMEOUT_MS` | `600000` | Max render time per job (ms) |
| `CLEANUP_AFTER_MS` | `3600000` | Auto-delete completed jobs after (ms) |

## Test

```powershell
# Queue a render
$r = Invoke-RestMethod -Method Post -Uri http://localhost:3000/render `
  -ContentType 'application/json' -Body (Get-Content -Raw test_request.json)
$r.jobId

# Poll status
Invoke-RestMethod -Uri "http://localhost:3000/status/$($r.jobId)"

# Download when completed
Invoke-RestMethod -Uri "http://localhost:3000/download/$($r.jobId)" -OutFile output.mp4
```

```bash
# curl equivalent
JOB=$(curl -s -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d @test_request.json | jq -r '.jobId')

curl -s http://localhost:3000/status/$JOB
curl http://localhost:3000/download/$JOB --output output.mp4
```

## Run tests

```bash
npm test
```

42 tests across 3 suites: filter builder (16), scene validator (11), audio reactive (15).

---

## Programmable Revenue (API Monetization)

LovesfireAI includes a **credit-based API monetization** system. Every `/render` and `/advisory` call requires an API key with sufficient credits.

### Monetized Endpoints

| Endpoint | Auth | Cost | Description |
|----------|------|------|-------------|
| `POST /api-keys` | None | Free | Create API key |
| `GET /credits` | Bearer | Free | Check balance |
| `POST /credits/purchase` | Bearer | — | Buy credits via Stripe |
| `GET /pricing` | None | Free | View pricing tiers |
| `POST /advisory` | Bearer | 1 credit | Governance check (no video) |
| `POST /render` | Bearer | 5+ credits | Queue video render |
| `POST /webhook/stripe` | Stripe sig | — | Payment webhook |
| `GET /admin/keys` | x-admin-key | — | List all API keys |
| `GET /admin/revenue` | x-admin-key | — | Revenue stats |

### Credit Packages

| Package | Price | Credits |
|---------|-------|---------|
| Starter | $5 | 10 |
| Pro | $25 | 60 |
| Steward | $100 | 300 |

### Run Monetized Server

```bash
npm run dev:monetized    # development
npm start                # production (after npm run build)
```

### Additional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | — | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | — | Stripe webhook signing secret |
| `ADMIN_KEY` | — | Admin endpoint authentication key |
| `CORS_ORIGIN` | `http://localhost:8080` | Allowed CORS origin |
| `NODE_ENV` | `development` | `production` uses `DATA_DIR` for SQLite |
| `DATA_DIR` | `./data` | Persistent volume mount path for SQLite databases |

---

## Smoke Tests

Run after every deploy to verify core monetization flows:

```bash
# PowerShell
.\scripts\smoke-test.ps1 -BaseUrl "https://YOUR_PRODUCTION_URL"

# Bash / CI
bash scripts/smoke-test.sh https://YOUR_PRODUCTION_URL
```

Tests cover: key creation, balance check, advisory deduction, render queueing, zero-credit rejection (402), invalid key (401), missing auth (401).

---

## Security Checklist

Before going live, verify every item:

### Secrets & Keys
- [ ] `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set via environment variables, never committed
- [ ] `ADMIN_KEY` is a cryptographically random string (>= 32 characters)
- [ ] `.env` is in `.gitignore` (confirmed)
- [ ] No secrets appear in client-side code or localStorage (only user API keys)
- [ ] API keys are prefixed `lf_` and generated with `crypto.randomBytes(24)`

### Authentication & Authorization
- [ ] All monetized endpoints require `Authorization: Bearer` header
- [ ] Admin endpoints require `x-admin-key` header
- [ ] Stripe webhooks verify signature via `stripe-signature` header
- [ ] Invalid/missing auth returns 401 (not 403 or 500)
- [ ] Insufficient credits returns 402 with clear error message

### Data Protection
- [ ] SQLite databases (`credits.db`, `audit.db`) are on a persistent volume (`DATA_DIR`)
- [ ] Database files are in `.gitignore` (`*.db`, `*.db-wal`, `*.db-shm`)
- [ ] Credit deduction happens BEFORE processing (prevents compute theft)
- [ ] Transaction log records every credit change with timestamp

### Network & Transport
- [ ] `CORS_ORIGIN` is set to the exact frontend domain (not `*`)
- [ ] Deployment platform provides automatic SSL/TLS via Let's Encrypt
- [ ] Stripe webhook endpoint accepts only `POST` with raw body

### Rate Limiting & Abuse (Recommended)
- [ ] Add `express-rate-limit` to `/api-keys` (prevent key farming)
- [ ] Add `express-rate-limit` to `/render` (prevent queue flooding)
- [ ] Monitor `/admin/revenue` for unusual credit patterns
- [ ] Consider API key expiration for inactive keys

### Governance Integrity
- [ ] BBnCC engine rejects forbidden content regardless of credit balance
- [ ] MommaSpec governance stamp is included in every response
- [ ] Audit trail persists across server restarts
- [ ] Birth certificates are immutable once created

### Pre-Launch Verification
- [ ] Run `scripts/smoke-test.sh` against production URL
- [ ] Verify Stripe test webhook fires correctly
- [ ] Confirm zero-credit key cannot render (HTTP 402)
- [ ] Confirm invalid key cannot access credits (HTTP 401)
- [ ] Check server logs to confirm FFmpeg is installed
- [ ] Verify `/admin/revenue` returns correct totals

---

## CI/CD

GitHub Actions runs on every push to `main`:

1. **Build** — `npm ci && npm run build`
2. **Unit Tests** — all test suites
3. **Smoke Tests** — starts server, runs full monetization flow

The deployment platform auto-deploys from `main` after CI passes.

---

## Contact

For questions, contributions, or technical support, please contact:

- **Mike** – bossbozitive@outlook.com
- **Sponsor** – https://github.com/sponsors/boswellmike68
