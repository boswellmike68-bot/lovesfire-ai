import { PlannedShot } from '../types';
import { resolveLut, LutPreset } from './lut_presets';
import { resolveMotion, MotionCurve, SRC_W, SRC_H, OUT_W, OUT_H } from './motion_curves';
import { createAudioAnalyzer } from '../audio/beat_analyzer';
import { AudioEnvelope } from '../audio/audio_envelope';
import { buildReactiveFilters, ReactiveFilterResult } from './reactive_filters';

const FPS = 30;
const audioAnalyzer = createAudioAnalyzer();

export interface FilterBuildResult {
  color: string;
  isGlitch: boolean;
  lutPreset: LutPreset;
  motionCurve: MotionCurve | null;
  audioEnvelope: AudioEnvelope;
  reactive: ReactiveFilterResult;
  effectFilters: string;
  drawtext: string;
  vf: string;
}

/**
 * Build the complete FFmpeg -vf filter string for a given shot.
 * Pure function — no side effects, fully testable.
 *
 * Filter chain order:
 *   1. zoompan (motion curve) — if active, operates on oversized source
 *   2. LUT color grade
 *   3. audio-reactive modulation (beat pulse, hue shift, noise bursts)
 *   4. glitch/base effects
 *   5. drawtext overlay
 */
export function buildFilters(shot: PlannedShot): FilterBuildResult {
  const description = shot.prompt;
  const sceneIdx = shot.sceneId - 1;
  const isGlitch = description.toLowerCase().includes('glitch');

  // Resolve LUT and motion
  const lutPreset = resolveLut(shot.lut, description, sceneIdx);
  const motionCurve = resolveMotion(shot.motion, description, sceneIdx);

  // Analyze audio envelope
  const audioEnvelope = audioAnalyzer.analyze(description, shot.durationSeconds, shot.bpm, shot.intensity);
  const reactive = buildReactiveFilters(audioEnvelope);

  // --- Motion ---
  const motionFilter = motionCurve
    ? `zoompan=${motionCurve.params(shot.durationSeconds, FPS)}`
    : null;

  // --- LUT color grade ---
  const lutFilter = lutPreset.filters;

  // --- Base effects (glitch or subtle) ---
  const baseEffects = isGlitch
    ? 'noise=alls=20:allf=t+u'
    : '';

  // --- Drawtext ---
  const safeLabel = escapeDrawtext(description.slice(0, 20));
  const fontRef = process.platform === 'win32'
    ? `fontfile='C\\:/Windows/Fonts/arial.ttf'`
    : 'font=Arial';
  const drawtext =
    `drawtext=text='${safeLabel}...':${fontRef}:fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2`;

  // --- Combine ---
  const filterParts: string[] = [];
  if (motionFilter) filterParts.push(motionFilter);
  filterParts.push(lutFilter);
  if (reactive.filters) filterParts.push(reactive.filters);
  if (baseEffects) filterParts.push(baseEffects);
  filterParts.push(drawtext);

  const effectFilters = [lutFilter, reactive.filters, baseEffects].filter(Boolean).join(',');
  const vf = filterParts.join(',');
  const color = lutPreset.bgColor;

  return { color, isGlitch, lutPreset, motionCurve, audioEnvelope, reactive, effectFilters, drawtext, vf };
}

/**
 * Build the full FFmpeg argument array for a mock scene render.
 * Pure function — returns args without executing anything.
 *
 * When a motion curve is active the lavfi source is oversized (1.2x)
 * so zoompan has room to pan without black borders.
 */
export function buildFFmpegArgs(
  shot: PlannedShot,
  outputPath: string,
  ffmpegPath: string = 'ffmpeg'
): { executable: string; args: string[] } {
  const { color, vf, motionCurve } = buildFilters(shot);

  const sourceW = motionCurve ? SRC_W : OUT_W;
  const sourceH = motionCurve ? SRC_H : OUT_H;

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=${color}:s=${sourceW}x${sourceH}:d=${shot.durationSeconds}:r=${FPS}`,
    '-f', 'lavfi',
    '-i', 'anullsrc=r=44100:cl=stereo',
    '-vf', vf,
    '-t', `${shot.durationSeconds}`,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-shortest',
    outputPath,
  ];

  return { executable: ffmpegPath, args };
}

/** Escape characters that break FFmpeg drawtext syntax */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\u2019')
    .replace(/:/g, '\\:');
}
