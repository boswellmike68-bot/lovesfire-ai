import { LutPresetName } from '../types';

/**
 * Each LUT preset maps to a set of FFmpeg color-manipulation filters
 * that simulate a cinematic color grade.
 *
 * These are applied BEFORE the drawtext overlay so the text stays white.
 */
export interface LutPreset {
  name: LutPresetName;
  label: string;
  filters: string;
  bgColor: string; // base color for lavfi source
}

const PRESETS: Record<Exclude<LutPresetName, 'auto'>, LutPreset> = {
  neon_pulse: {
    name: 'neon_pulse',
    label: 'Neon Pulse',
    filters: 'eq=brightness=0.06:saturation=2.2,hue=h=280+40*sin(2*PI*t):s=1.5,colorbalance=rs=0.3:bm=-0.3:bh=0.4',
    bgColor: '#0a0a2e',
  },
  dream_warmth: {
    name: 'dream_warmth',
    label: 'Dream Warmth',
    filters: 'eq=brightness=0.08:saturation=1.3:gamma=1.1,colorbalance=rs=0.25:gs=0.1:bs=-0.15,vignette=PI/3',
    bgColor: '#2e1a0a',
  },
  cold_memory: {
    name: 'cold_memory',
    label: 'Cold Memory',
    filters: 'eq=brightness=-0.04:saturation=0.6:contrast=1.15,colorbalance=rs=-0.2:gs=-0.1:bs=0.35,vignette=PI/3.5',
    bgColor: '#0a1a2e',
  },
  analog_film: {
    name: 'analog_film',
    label: 'Analog Film',
    filters: 'eq=brightness=0.04:saturation=0.85:contrast=1.1,noise=alls=8:allf=t,colorbalance=rs=0.1:gs=0.05:bs=-0.1',
    bgColor: '#1e1e14',
  },
  cyber_fade: {
    name: 'cyber_fade',
    label: 'Cyber Fade',
    filters: 'eq=brightness=0.02:saturation=1.6,hue=h=180+30*sin(PI*t):s=1.2,colorbalance=rs=-0.1:bm=0.2:bh=0.3',
    bgColor: '#0e1a2a',
  },
};

/** Keywords in descriptions that hint at a specific LUT */
const MOOD_KEYWORDS: [RegExp, Exclude<LutPresetName, 'auto'>][] = [
  [/warm|golden|sunset|dawn|fire|cozy|dream|glow/i, 'dream_warmth'],
  [/neon|pulse|electric|rave|club|strobe/i, 'neon_pulse'],
  [/cold|ice|frost|snow|memory|pale|ghost/i, 'cold_memory'],
  [/film|grain|retro|vintage|analog|vhs|tape/i, 'analog_film'],
  [/cyber|matrix|hack|digital|grid|tech|code|glitch/i, 'cyber_fade'],
];

/** Rotating fallback order when no keywords match */
const ROTATION_ORDER: Exclude<LutPresetName, 'auto'>[] = [
  'dream_warmth', 'cold_memory', 'neon_pulse', 'analog_film', 'cyber_fade',
];

/**
 * Resolve a LUT preset for a shot.
 * - Explicit name → use that preset
 * - 'auto' or undefined → detect from description, then rotate
 */
export function resolveLut(
  name: LutPresetName | undefined,
  description: string,
  sceneIndex: number,
): LutPreset {
  if (name && name !== 'auto' && PRESETS[name]) {
    return PRESETS[name];
  }

  // Auto-detect from description keywords
  for (const [pattern, presetName] of MOOD_KEYWORDS) {
    if (pattern.test(description)) {
      return PRESETS[presetName];
    }
  }

  // Rotate through presets for variety
  const fallback = ROTATION_ORDER[sceneIndex % ROTATION_ORDER.length];
  return PRESETS[fallback];
}

export function getAllPresetNames(): string[] {
  return Object.keys(PRESETS);
}

export { PRESETS };
