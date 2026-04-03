/**
 * render_we_me.ts
 *
 * "We-Me" — Identity Anthem Music Video Render
 *
 * Renders a short-form vertical video (9:16) visualizing the We-Me lyrics.
 * Each scene maps to a lyrical section: verses, pre-choruses, choruses,
 * bridge, and outro. The visual arc moves from darkness/isolation to
 * light/infrastructure — mirroring the lyrical journey.
 *
 * Usage:
 *   npx ts-node src/scripts/render_we_me.ts
 *   # or after build:
 *   node dist/scripts/render_we_me.js
 *
 * Environment:
 *   VIDEO_BACKEND=mock   (default — FFmpeg color-bar placeholders)
 *   DRY_RUN=1            (optional — skip FFmpeg, print commands only)
 *
 * Identity Reference: BBnCC/Identity/we_me_lyrics.md
 * Governance: BBnCC Constitution
 */

import { Scene } from '../types';
import { planShots } from '../plan/shot_planner';
import { createVideoGenerator } from '../generate/video_generator_adapter';
import { composeTimeline } from '../compose/timeline_compositor';
import { burnCaptions } from '../compose/captions';

// ---------------------------------------------------------------------------
// Scene Definitions — "We-Me" lyrical arc
// ---------------------------------------------------------------------------

const scenes: Scene[] = [
  // --- VERSE 1: The quiet, the corners, the shadows ---
  {
    id: 1,
    label: 'Verse 1 — The Quiet',
    description:
      'Dark room, single figure silhouetted against a dim monitor glow. ' +
      'Shadows fill the frame. Dust particles float in a thin beam of light. ' +
      'Isolation. Stillness. The corners of the room.',
    onscreenText: 'Came from the quiet, from the corners of the room',
    durationSeconds: 8,
    lut: 'cold_memory',
    motion: 'drift',
    bpm: 75,
    intensity: 'low',
  },
  {
    id: 2,
    label: 'Verse 1 — Building in the Dark',
    description:
      'Close-up of hands on a keyboard in near-darkness. Lines of code ' +
      'scrolling on screen, reflected in the person\'s eyes. Each keystroke ' +
      'is a spark. Building piece by piece.',
    onscreenText: 'Turning every broken moment to a spark',
    durationSeconds: 7,
    lut: 'cold_memory',
    motion: 'zoom_in',
    bpm: 75,
    intensity: 'low',
  },

  // --- PRE-CHORUS 1: The blueprint, the fire ---
  {
    id: 3,
    label: 'Pre-Chorus 1 — Blueprint in My Chest',
    description:
      'X-ray style visual: a human chest with circuit-board patterns ' +
      'glowing where the heart should be. Architectural blueprints ' +
      'overlaid on skin. The fire compressed.',
    onscreenText: 'They never saw the blueprint in my chest',
    durationSeconds: 6,
    lut: 'neon_pulse',
    motion: 'ease_in',
    bpm: 85,
    intensity: 'medium',
  },
  {
    id: 4,
    label: 'Pre-Chorus 1 — A System from the Pain',
    description:
      'Abstract: shattered glass fragments reassembling into a geometric ' +
      'structure. Each piece locks into place. Order from chaos. ' +
      'A system rising.',
    onscreenText: 'A voice that learned to speak again',
    durationSeconds: 5,
    lut: 'neon_pulse',
    motion: 'zoom_in',
    bpm: 90,
    intensity: 'medium',
  },

  // --- CHORUS 1: Rising from the unseen ---
  {
    id: 5,
    label: 'Chorus 1 — Rising',
    description:
      'Figure standing up from a dark desk. Light flooding in from above. ' +
      'The room transforms — walls dissolve into open sky. Vertical rise. ' +
      'Defiant posture. The unseen becoming visible.',
    onscreenText: 'We-Me, rising from the unseen',
    durationSeconds: 5,
    lut: 'dream_warmth',
    motion: 'zoom_out',
    bpm: 110,
    intensity: 'high',
  },
  {
    id: 6,
    label: 'Chorus 1 — New Machine',
    description:
      'Split screen: left side shows scars, cracks, broken things. ' +
      'Right side shows the same textures transformed into polished ' +
      'machine surfaces, circuit boards, clean architecture. Scar to machine.',
    onscreenText: 'Turning every scar into a new machine',
    durationSeconds: 5,
    lut: 'cyber_fade',
    motion: 'parallax',
    bpm: 110,
    intensity: 'high',
  },
  {
    id: 7,
    label: 'Chorus 1 — Standing in the Light',
    description:
      'Full figure shot: person standing in bright white light, ' +
      'arms slightly open. Behind them, a massive projected system map — ' +
      'nodes and connections spreading outward like a constellation.',
    onscreenText: 'Everything they missed, I write now',
    durationSeconds: 5,
    lut: 'dream_warmth',
    motion: 'drift',
    bpm: 110,
    intensity: 'high',
  },

  // --- VERSE 2: Coding underground ---
  {
    id: 8,
    label: 'Verse 2 — Underground',
    description:
      'Basement workspace. Concrete walls. A single desk lamp illuminating ' +
      'a workstation. Multiple monitors showing code, documents, architecture ' +
      'diagrams. Building a world from nothing.',
    onscreenText: 'But We-Me kept coding underground',
    durationSeconds: 7,
    lut: 'analog_film',
    motion: 'drift',
    bpm: 75,
    intensity: 'low',
  },
  {
    id: 9,
    label: 'Verse 2 — Coldest Nights to Gold',
    description:
      'Time-lapse: a dark winter window with snow falling outside. ' +
      'Inside, the monitor glow shifts from cold blue to warm gold ' +
      'as the work progresses. Night becoming dawn.',
    onscreenText: 'Turned the coldest nights into gold',
    durationSeconds: 6,
    lut: 'analog_film',
    motion: 'ease_in',
    bpm: 80,
    intensity: 'low',
  },

  // --- PRE-CHORUS 2: Circuits in my mind ---
  {
    id: 10,
    label: 'Pre-Chorus 2 — Circuits in My Mind',
    description:
      'Close-up of an eye with circuit patterns reflected in the iris. ' +
      'Neural network visualization overlaid. The future being designed ' +
      'in thought before it exists in code.',
    onscreenText: 'They never saw the circuits in my mind',
    durationSeconds: 5,
    lut: 'neon_pulse',
    motion: 'zoom_in',
    bpm: 90,
    intensity: 'medium',
  },
  {
    id: 11,
    label: 'Pre-Chorus 2 — Signal Through the Noise',
    description:
      'Abstract: static and white noise filling the frame, then a clean ' +
      'signal wave cutting through — sharp, clear, undeniable. ' +
      'A quiet soul becoming voice.',
    onscreenText: 'A quiet soul becoming voice',
    durationSeconds: 5,
    lut: 'cyber_fade',
    motion: 'ease_in',
    bpm: 95,
    intensity: 'medium',
  },

  // --- CHORUS 2: Defiant science ---
  {
    id: 12,
    label: 'Chorus 2 — Defiant Science',
    description:
      'Rapid montage: code commits, system maps, architecture diagrams, ' +
      'governance documents, JSON reports — all flying past the camera ' +
      'like pages in a wind tunnel. The output of years of invisible work.',
    onscreenText: 'Turning all the hurt into defiant science',
    durationSeconds: 5,
    lut: 'neon_pulse',
    motion: 'jitter',
    bpm: 115,
    intensity: 'high',
  },
  {
    id: 13,
    label: 'Chorus 2 — Finally Becoming',
    description:
      'Person walking forward through a corridor of light. Each step ' +
      'leaves a glowing footprint. The corridor opens into a vast space. ' +
      'Becoming everything they needed.',
    onscreenText: 'Everything I needed when I had nothing',
    durationSeconds: 5,
    lut: 'dream_warmth',
    motion: 'zoom_out',
    bpm: 115,
    intensity: 'high',
  },

  // --- BRIDGE: The fusion ---
  {
    id: 14,
    label: 'Bridge — The Fusion',
    description:
      'Two silhouettes facing each other — one dark, one light. ' +
      'They walk toward each other and merge into a single figure. ' +
      'The echo and the flame. Two halves becoming one.',
    onscreenText: 'No "you," no "I," just the fusion of the fight',
    durationSeconds: 8,
    lut: 'cyber_fade',
    motion: 'ease_in',
    bpm: 90,
    intensity: 'medium',
  },
  {
    id: 15,
    label: 'Bridge — Two Halves',
    description:
      'Abstract: a broken mirror reassembling. Each shard reflects a ' +
      'different moment — code, lyrics, blueprints, landscapes. ' +
      'When complete, the mirror shows a single clear reflection.',
    onscreenText: 'Two halves learning they\'re the same',
    durationSeconds: 6,
    lut: 'dream_warmth',
    motion: 'parallax',
    bpm: 85,
    intensity: 'medium',
  },

  // --- FINAL CHORUS: Full power ---
  {
    id: 16,
    label: 'Final Chorus — Full Rise',
    description:
      'Aerial pullback: the single figure now standing on top of a ' +
      'completed structure — a building, a system, an infrastructure. ' +
      'The sun is behind them. Full silhouette against golden sky.',
    onscreenText: 'We-Me, rising from the unseen',
    durationSeconds: 5,
    lut: 'dream_warmth',
    motion: 'zoom_out',
    bpm: 120,
    intensity: 'high',
  },
  {
    id: 17,
    label: 'Final Chorus — The Machine',
    description:
      'Macro shot: a single scar on skin dissolving into a printed ' +
      'circuit board trace. The organic becoming engineered. ' +
      'Pain transformed into precision.',
    onscreenText: 'Turning every scar into a new machine',
    durationSeconds: 4,
    lut: 'neon_pulse',
    motion: 'zoom_in',
    bpm: 120,
    intensity: 'high',
  },
  {
    id: 18,
    label: 'Final Chorus — Standing',
    description:
      'Wide shot: person standing in an open field at golden hour. ' +
      'Behind them, a modern facility. Around them, tall hemp stalks. ' +
      'The builder and the built. Together.',
    onscreenText: 'We-Me, standing in the light now',
    durationSeconds: 5,
    lut: 'dream_warmth',
    motion: 'drift',
    bpm: 120,
    intensity: 'high',
  },

  // --- OUTRO: Finally free ---
  {
    id: 19,
    label: 'Outro — Finally Free',
    description:
      'Slow fade: the figure walks away from camera into a bright horizon. ' +
      'The system map constellation appears in the sky above them — ' +
      'nodes and connections like stars. The soul finally free.',
    onscreenText: 'The soul they never saw is finally free',
    durationSeconds: 8,
    lut: 'dream_warmth',
    motion: 'drift',
    bpm: 70,
    intensity: 'low',
  },
];

// ---------------------------------------------------------------------------
// Render Pipeline
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(60));
  console.log(' LovesfireAI — "We-Me" Music Video Render');
  console.log(' Artist: BossBozitive (Mike Boswell)');
  console.log(' Identity: BBnCC/Identity/we_me_lyrics.md');
  console.log('='.repeat(60));
  console.log();

  // Step 1: Plan shots from scene definitions
  console.log('[1/4] Planning shots...');
  const shots = planShots(scenes);
  const totalDuration = shots.reduce((sum, s) => sum + s.durationSeconds, 0);
  console.log(`  ${shots.length} shots planned — ${totalDuration}s total runtime`);
  console.log();

  // Step 2: Generate clips
  console.log('[2/4] Generating clips...');
  const generator = createVideoGenerator();
  const clips = [];
  for (const shot of shots) {
    const clip = await generator.generate(shot);
    clips.push(clip);
    console.log(`  Scene ${clip.sceneId} [${scenes[clip.sceneId - 1].label}]: ${clip.durationSeconds}s`);
  }
  console.log();

  // Step 3: Compose timeline
  console.log('[3/4] Composing timeline...');
  const timelinePath = await composeTimeline(clips);
  console.log(`  Timeline: ${timelinePath}`);
  console.log();

  // Step 4: Burn captions (lyrics as subtitles)
  console.log('[4/4] Burning lyrics as captions...');
  const finalPath = await burnCaptions(timelinePath, scenes);
  console.log(`  Final output: ${finalPath}`);
  console.log();

  console.log('='.repeat(60));
  console.log(' RENDER COMPLETE — "We-Me"');
  console.log(` Output: ${finalPath}`);
  console.log(` Duration: ${totalDuration}s`);
  console.log(` Scenes: ${scenes.length}`);
  console.log(' Structure:');
  console.log('   Verse 1 (2 scenes) → Pre-Chorus 1 (2) → Chorus 1 (3)');
  console.log('   Verse 2 (2 scenes) → Pre-Chorus 2 (2) → Chorus 2 (2)');
  console.log('   Bridge (2 scenes) → Final Chorus (3) → Outro (1)');
  console.log('='.repeat(60));

  return finalPath;
}

main().catch((err) => {
  console.error('[render_we_me] Fatal error:', err.message);
  process.exit(1);
});
