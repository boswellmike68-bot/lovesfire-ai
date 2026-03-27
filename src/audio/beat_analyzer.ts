import { AudioEnvelope, Intensity, DEFAULT_ENVELOPE } from './audio_envelope';

/**
 * Interface for audio analyzers.
 * The mock implementation generates plausible envelopes from scene metadata.
 * A real implementation would use ffprobe + aubio or essentia on actual audio.
 */
export interface AudioAnalyzer {
  analyze(description: string, durationSeconds: number, bpmOverride?: number, intensityOverride?: Intensity): AudioEnvelope;
}

/** Keywords that imply high energy */
const HIGH_KEYWORDS = /glitch|explosion|drop|smash|bass|heavy|intense|rave|strobe|burst|crash/i;
/** Keywords that imply low energy */
const LOW_KEYWORDS = /calm|quiet|soft|gentle|whisper|ambient|fade|dream|slow|still|peace/i;
/** Keywords that imply a drop/transition */
const DROP_KEYWORDS = /drop|transition|shift|break|burst|reveal|crash/i;

/**
 * Mock beat analyzer — generates deterministic, plausible audio envelopes
 * from scene description and duration. No actual audio file required.
 *
 * When real Suno tracks arrive, swap this for a real analyzer that
 * reads the audio file and produces the same AudioEnvelope shape.
 */
export class MockBeatAnalyzer implements AudioAnalyzer {
  analyze(
    description: string,
    durationSeconds: number,
    bpmOverride?: number,
    intensityOverride?: Intensity,
  ): AudioEnvelope {
    // Detect intensity from description
    let intensity: Intensity = 'medium';
    if (HIGH_KEYWORDS.test(description)) intensity = 'high';
    else if (LOW_KEYWORDS.test(description)) intensity = 'low';

    // Apply explicit override
    if (intensityOverride) intensity = intensityOverride;

    // BPM: default based on intensity, or explicit override
    const baseBpm = intensity === 'high' ? 140 : intensity === 'low' ? 80 : 120;
    const bpm = bpmOverride ?? baseBpm;

    // Energy bands — derived from intensity with slight variation per scene
    const scale = intensity === 'high' ? 1.0 : intensity === 'low' ? 0.3 : 0.6;
    const bassEnergy = Math.min(1.0, scale * 0.8 + (durationSeconds % 3) * 0.05);
    const midEnergy = Math.min(1.0, scale * 0.7 + (durationSeconds % 5) * 0.04);
    const highEnergy = Math.min(1.0, scale * 0.5 + (durationSeconds % 7) * 0.03);

    const hasDrop = DROP_KEYWORDS.test(description);

    return { bpm, intensity, bassEnergy, midEnergy, highEnergy, hasDrop };
  }
}

/** Singleton for the current audio analyzer backend */
export function createAudioAnalyzer(): AudioAnalyzer {
  // Future: switch on env var for real analyzer
  return new MockBeatAnalyzer();
}

export { DEFAULT_ENVELOPE };
