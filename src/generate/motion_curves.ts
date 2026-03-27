import { MotionCurveName } from '../types';

/**
 * Each motion curve maps to an FFmpeg zoompan filter expression.
 * zoompan operates on a single input frame and produces panning/zooming.
 *
 * For lavfi color sources we set s=1080x1920 (output size) and
 * generate a slightly oversized source (1296x2304 = 1.2x) so there's
 * room to pan and zoom without black borders.
 *
 * Key zoompan params:
 *   z  = zoom factor expression (1.0 = no zoom)
 *   x  = pan X expression
 *   y  = pan Y expression
 *   d  = total frames (duration * fps)
 *   s  = output size
 *   fps = output framerate
 */
export interface MotionCurve {
  name: MotionCurveName;
  label: string;
  /** zoompan filter string (without the "zoompan=" prefix) */
  params: (durationSeconds: number, fps: number) => string;
  /** Source must be oversized to allow panning. Returns lavfi size. */
  sourceSize: string;
}

const OUT_W = 1080;
const OUT_H = 1920;
const OVERSCAN = 1.2;
const SRC_W = Math.round(OUT_W * OVERSCAN);
const SRC_H = Math.round(OUT_H * OVERSCAN);

const CURVES: Record<Exclude<MotionCurveName, 'auto' | 'none'>, MotionCurve> = {
  drift: {
    name: 'drift',
    label: 'Slow Drift',
    sourceSize: `${SRC_W}x${SRC_H}`,
    params: (dur, fps) => {
      const d = dur * fps;
      // Gentle horizontal drift from left to right
      return `z=1.0:x='(iw-${OUT_W})*on/${d}':y='(ih-${OUT_H})/2':d=${d}:s=${OUT_W}x${OUT_H}:fps=${fps}`;
    },
  },
  zoom_in: {
    name: 'zoom_in',
    label: 'Zoom In',
    sourceSize: `${SRC_W}x${SRC_H}`,
    params: (dur, fps) => {
      const d = dur * fps;
      // Smooth zoom from 1.0 to 1.15 with center hold
      return `z='1+0.15*on/${d}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${OUT_W}x${OUT_H}:fps=${fps}`;
    },
  },
  zoom_out: {
    name: 'zoom_out',
    label: 'Zoom Out',
    sourceSize: `${SRC_W}x${SRC_H}`,
    params: (dur, fps) => {
      const d = dur * fps;
      // Reverse Ken Burns — start zoomed, pull back
      return `z='1.15-0.15*on/${d}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${OUT_W}x${OUT_H}:fps=${fps}`;
    },
  },
  jitter: {
    name: 'jitter',
    label: 'Jitter',
    sourceSize: `${SRC_W}x${SRC_H}`,
    params: (dur, fps) => {
      const d = dur * fps;
      // Subtle random-feeling shake using sin at different frequencies
      return `z=1.0:x='(iw-${OUT_W})/2+8*sin(15*PI*on/${d})':y='(ih-${OUT_H})/2+6*sin(19*PI*on/${d})':d=${d}:s=${OUT_W}x${OUT_H}:fps=${fps}`;
    },
  },
  parallax: {
    name: 'parallax',
    label: 'Parallax',
    sourceSize: `${SRC_W}x${SRC_H}`,
    params: (dur, fps) => {
      const d = dur * fps;
      // Diagonal drift (NW to SE) simulating parallax depth
      return `z=1.02:x='(iw-${OUT_W})*on/${d}':y='(ih-${OUT_H})*on/${d}':d=${d}:s=${OUT_W}x${OUT_H}:fps=${fps}`;
    },
  },
  ease_in: {
    name: 'ease_in',
    label: 'Ease In',
    sourceSize: `${SRC_W}x${SRC_H}`,
    params: (dur, fps) => {
      const d = dur * fps;
      // Quadratic ease-in zoom — starts slow, accelerates
      return `z='1+0.12*(on/${d})*(on/${d})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${OUT_W}x${OUT_H}:fps=${fps}`;
    },
  },
};

/** Keywords in descriptions that hint at a motion curve */
const MOTION_KEYWORDS: [RegExp, Exclude<MotionCurveName, 'auto' | 'none'>][] = [
  [/drift|pan|slide|sweep/i, 'drift'],
  [/zoom\s*in|push\s*in|close\s*up|approach/i, 'zoom_in'],
  [/zoom\s*out|pull\s*back|wide|reveal/i, 'zoom_out'],
  [/shake|jitter|handheld|shaky|tremor|glitch/i, 'jitter'],
  [/parallax|depth|layer|3d/i, 'parallax'],
  [/ease|slow\s*start|gentle|cinematic/i, 'ease_in'],
];

/** Rotating fallback order when no keywords match */
const ROTATION_ORDER: Exclude<MotionCurveName, 'auto' | 'none'>[] = [
  'zoom_in', 'drift', 'ease_in', 'zoom_out', 'parallax', 'jitter',
];

/**
 * Resolve a motion curve for a shot.
 * - 'none' → returns null (no motion)
 * - Explicit name → use that curve
 * - 'auto' or undefined → detect from description, then rotate
 */
export function resolveMotion(
  name: MotionCurveName | undefined,
  description: string,
  sceneIndex: number,
): MotionCurve | null {
  if (name === 'none') return null;

  if (name && name !== 'auto' && CURVES[name]) {
    return CURVES[name];
  }

  // Auto-detect from description keywords
  for (const [pattern, curveName] of MOTION_KEYWORDS) {
    if (pattern.test(description)) {
      return CURVES[curveName];
    }
  }

  // Rotate through curves for variety
  const fallback = ROTATION_ORDER[sceneIndex % ROTATION_ORDER.length];
  return CURVES[fallback];
}

export function getAllCurveNames(): string[] {
  return Object.keys(CURVES);
}

export { CURVES, SRC_W, SRC_H, OUT_W, OUT_H };
