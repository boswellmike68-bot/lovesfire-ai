/**
 * render_industrial_promo.ts
 *
 * "Future of Manufacturing" — Chatham-Kent Regional Promo
 *
 * Renders a short-form vertical video (9:16) showcasing the industrial
 * bio-composite opportunity for the Chatham-Kent region. Designed as the
 * visual follow-up asset to the council briefing document.
 *
 * Usage:
 *   npx ts-node src/scripts/render_industrial_promo.ts
 *   # or after build:
 *   node dist/scripts/render_industrial_promo.js
 *
 * Environment:
 *   VIDEO_BACKEND=mock   (default — FFmpeg color-bar placeholders)
 *   DRY_RUN=1            (optional — skip FFmpeg, print commands only)
 */

import { Scene } from '../types';
import { planShots } from '../plan/shot_planner';
import { createVideoGenerator } from '../generate/video_generator_adapter';
import { composeTimeline } from '../compose/timeline_compositor';
import { burnCaptions } from '../compose/captions';

// ---------------------------------------------------------------------------
// Scene Definitions — "Future of Manufacturing" narrative
// ---------------------------------------------------------------------------

const scenes: Scene[] = [
  {
    id: 1,
    label: 'Opening — The Land',
    description:
      'Aerial drone shot of flat agricultural land in southwestern Ontario at golden hour. ' +
      'Fallow fields stretching to the horizon. Quiet, vast, underutilized.',
    onscreenText: 'Chatham-Kent, Ontario',
    durationSeconds: 5,
    lut: 'dream_warmth',
    motion: 'drift',
    intensity: 'low',
  },
  {
    id: 2,
    label: 'The Crop — Structural Fiber',
    description:
      'Close-up of industrial hemp stalks growing tall and dense in a field. ' +
      'Sunlight filtering through the canopy. Green, towering, engineered.',
    onscreenText: 'Structural Fiber Feedstock',
    durationSeconds: 5,
    lut: 'analog_film',
    motion: 'zoom_in',
    intensity: 'low',
  },
  {
    id: 3,
    label: 'The Harvest — Industrial Scale',
    description:
      'Wide shot of a combine harvester moving through a hemp field. ' +
      'Dust trail behind it. Scale and efficiency.',
    onscreenText: '90-Day Crop Cycle — Single Season',
    durationSeconds: 4,
    lut: 'dream_warmth',
    motion: 'parallax',
    intensity: 'medium',
  },
  {
    id: 4,
    label: 'The Facility — Processing',
    description:
      'Interior of a modern decorticating facility. Fiber separation machinery. ' +
      'Clean industrial floor. Workers in safety gear operating equipment.',
    onscreenText: '40–60 Direct Jobs Per Facility',
    durationSeconds: 5,
    lut: 'cold_memory',
    motion: 'drift',
    intensity: 'medium',
  },
  {
    id: 5,
    label: 'The Product — Bio-Composite Panels',
    description:
      'Close-up of hempcrete panels and bio-composite boards stacked on pallets. ' +
      'Clean lines, industrial packaging. Ready for construction supply chain.',
    onscreenText: 'Carbon-Negative Building Materials',
    durationSeconds: 5,
    lut: 'cold_memory',
    motion: 'zoom_in',
    intensity: 'medium',
  },
  {
    id: 6,
    label: 'The Build — Construction',
    description:
      'Time-lapse style shot of a house frame being insulated with hempcrete panels. ' +
      'Construction workers installing bio-composite wall sections.',
    onscreenText: '15–25% Lower Insulation Costs',
    durationSeconds: 5,
    lut: 'analog_film',
    motion: 'zoom_out',
    intensity: 'medium',
  },
  {
    id: 7,
    label: 'The Math — Carbon Impact',
    description:
      'Animated data visualization overlay on a field background. ' +
      'Numbers rising: tonnes of CO2 sequestered per hectare.',
    onscreenText: '8–15 Tonnes CO₂ Sequestered / Hectare / Year',
    durationSeconds: 5,
    lut: 'neon_pulse',
    motion: 'ease_in',
    intensity: 'high',
  },
  {
    id: 8,
    label: 'The Network — Supply Chain',
    description:
      'Map overlay showing Chatham-Kent connected to Windsor-Detroit corridor, ' +
      'Highway 401, and Great Lakes shipping routes. Logistics advantage.',
    onscreenText: 'Windsor–Detroit Corridor Access',
    durationSeconds: 4,
    lut: 'cyber_fade',
    motion: 'drift',
    intensity: 'medium',
  },
  {
    id: 9,
    label: 'The Legacy — Restored Land',
    description:
      'Split screen: left side shows degraded fallow land, right side shows ' +
      'thriving hemp field with rich dark soil visible at the base.',
    onscreenText: 'Soil Stabilization & Bio-Renewal',
    durationSeconds: 5,
    lut: 'dream_warmth',
    motion: 'parallax',
    intensity: 'low',
  },
  {
    id: 10,
    label: 'Closing — The Future',
    description:
      'Slow aerial pullback from a completed bio-composite housing development. ' +
      'Green roofs, solar panels, hemp fields visible in the background.',
    onscreenText: 'The Future of Manufacturing Starts Here',
    durationSeconds: 6,
    lut: 'dream_warmth',
    motion: 'zoom_out',
    intensity: 'high',
  },
];

// ---------------------------------------------------------------------------
// Render Pipeline
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(60));
  console.log(' LovesfireAI — "Future of Manufacturing" Promo Render');
  console.log(' Target: Chatham-Kent Industrial Bio-Composite Initiative');
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
    console.log(`  Scene ${clip.sceneId}: ${clip.durationSeconds}s → ${clip.filePath}`);
  }
  console.log();

  // Step 3: Compose timeline
  console.log('[3/4] Composing timeline...');
  const timelinePath = await composeTimeline(clips);
  console.log(`  Timeline: ${timelinePath}`);
  console.log();

  // Step 4: Burn captions
  console.log('[4/4] Burning captions...');
  const finalPath = await burnCaptions(timelinePath, scenes);
  console.log(`  Final output: ${finalPath}`);
  console.log();

  console.log('='.repeat(60));
  console.log(' RENDER COMPLETE');
  console.log(` Output: ${finalPath}`);
  console.log(` Duration: ${totalDuration}s`);
  console.log(` Scenes: ${scenes.length}`);
  console.log('='.repeat(60));

  return finalPath;
}

main().catch((err) => {
  console.error('[render_industrial_promo] Fatal error:', err.message);
  process.exit(1);
});
