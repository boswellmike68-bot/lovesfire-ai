/**
 * Audio analysis data for a single scene.
 *
 * This is the contract between audio analysis (real or mock)
 * and the reactive filter system. When real audio analysis
 * arrives (e.g. via ffprobe + aubio), it just needs to produce
 * this shape.
 */

export type Intensity = 'low' | 'medium' | 'high';

export interface AudioEnvelope {
  /** Beats per minute — drives pulse frequency */
  bpm: number;
  /** Overall energy level — controls effect amplitude */
  intensity: Intensity;
  /** Normalized bass energy 0–1 — drives hue shift */
  bassEnergy: number;
  /** Normalized mid energy 0–1 — drives vignette pulse */
  midEnergy: number;
  /** Normalized high energy 0–1 — drives noise/jitter */
  highEnergy: number;
  /** Whether a "drop" or transition occurs in this scene */
  hasDrop: boolean;
}

/** Intensity → numeric multiplier for filter amplitude */
export const INTENSITY_SCALE: Record<Intensity, number> = {
  low: 0.4,
  medium: 0.7,
  high: 1.0,
};

/** Default envelope when no audio analysis is available */
export const DEFAULT_ENVELOPE: AudioEnvelope = {
  bpm: 120,
  intensity: 'medium',
  bassEnergy: 0.5,
  midEnergy: 0.5,
  highEnergy: 0.3,
  hasDrop: false,
};
