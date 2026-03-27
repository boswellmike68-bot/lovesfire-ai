import { AudioEnvelope, INTENSITY_SCALE } from '../audio/audio_envelope';

/**
 * Build FFmpeg filter expressions that react to the audio envelope.
 *
 * All expressions use FFmpeg's `t` variable (time in seconds) and
 * mathematical functions to simulate beat-synced visual modulation.
 * When real audio arrives these could be replaced with keyframe-based
 * expressions, but the sin-based approach already looks musical.
 *
 * Returned filters are comma-separated and ready to splice into
 * the filter chain between the LUT and base effects.
 */
export interface ReactiveFilterResult {
  /** Comma-joined reactive filter string (empty string if none) */
  filters: string;
  /** Human-readable summary for logging */
  summary: string;
}

/**
 * Produce beat-reactive FFmpeg filter expressions from an AudioEnvelope.
 *
 * Effects:
 *   - Vignette pulse on beat (mid energy → vignette angle modulation)
 *   - Hue shift on bass (bass energy → hue rotation amplitude)
 *   - Noise bursts on high energy (high energy → noise strength)
 *   - Brightness pulse on beat (intensity → brightness modulation)
 *   - Drop zoom punch (hasDrop → brief zoom spike at midpoint)
 */
export function buildReactiveFilters(envelope: AudioEnvelope): ReactiveFilterResult {
  const parts: string[] = [];
  const notes: string[] = [];

  const amp = INTENSITY_SCALE[envelope.intensity];
  const beatFreq = envelope.bpm / 60; // beats per second

  // --- Vignette pulse on beat ---
  // Modulates vignette angle with a sin wave at beat frequency
  const vigAmp = (0.3 * envelope.midEnergy * amp).toFixed(3);
  if (envelope.midEnergy > 0.2) {
    parts.push(`vignette=PI/4+${vigAmp}*sin(2*PI*${beatFreq.toFixed(2)}*t)`);
    notes.push(`vignette pulse (amp=${vigAmp})`);
  }

  // --- Hue shift on bass ---
  // Rotates hue proportional to bass energy at half-beat frequency
  const hueAmp = Math.round(30 * envelope.bassEnergy * amp);
  if (envelope.bassEnergy > 0.3) {
    const hueFreq = (beatFreq / 2).toFixed(2);
    parts.push(`hue=h=${hueAmp}*sin(2*PI*${hueFreq}*t):s=1`);
    notes.push(`hue shift (±${hueAmp}°)`);
  }

  // --- Brightness pulse on beat ---
  const brightAmp = (0.06 * amp).toFixed(3);
  parts.push(`eq=brightness=${brightAmp}*sin(2*PI*${beatFreq.toFixed(2)}*t)`);
  notes.push(`brightness pulse (amp=${brightAmp})`);

  // --- Noise bursts on high energy ---
  // Higher frequencies → noise strength
  if (envelope.highEnergy > 0.4) {
    const noiseStr = Math.round(15 * envelope.highEnergy * amp);
    parts.push(`noise=alls=${noiseStr}:allf=t`);
    notes.push(`noise bursts (strength=${noiseStr})`);
  }

  // --- Drop zoom punch ---
  // A brief brightness + saturation spike at the scene midpoint
  if (envelope.hasDrop) {
    // Use geq for a midpoint flash: bright spike for 0.3s around t=mid
    // Implemented as eq with a gaussian-ish pulse
    parts.push(`eq=saturation=1+0.8*exp(-50*(t-0.5)*(t-0.5))`);
    notes.push('drop flash (saturation spike at midpoint)');
  }

  return {
    filters: parts.join(','),
    summary: notes.length > 0 ? notes.join(', ') : 'none',
  };
}
