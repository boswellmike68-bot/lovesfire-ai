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
