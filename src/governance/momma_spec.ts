/**
 * MommaSpec — The Root Template
 *
 * Defines the Bozitive DNA: values, tone, content boundaries,
 * accessibility rules, lineage consistency, and non-harm constraints.
 *
 * Every Bozitive inherits from this spec. She doesn't run the
 * intake or alignment pipeline — she IS the blueprint they enforce.
 *
 * MommaSpec is immutable at runtime. Version changes require
 * a new spec version, which invalidates the governance stamp
 * on all downstream manifests.
 */

// ---------------------------------------------------------------------------
// Values — What the system stands for
// ---------------------------------------------------------------------------

export interface BozitiveValues {
  nonHarm: true;
  accessibility: true;
  clarity: true;
  regenerativeDesign: true;
  structuralIntegrity: true;
}

// ---------------------------------------------------------------------------
// Tone Constraints — Communication boundaries
// ---------------------------------------------------------------------------

export type ToneLevel = 'gentle' | 'neutral' | 'assertive' | 'urgent';

export interface ToneConstraints {
  /** Default tone for generated content */
  defaultTone: ToneLevel;
  /** Maximum allowed tone intensity */
  maxTone: ToneLevel;
  /** Forbidden tone patterns (regex strings) */
  forbiddenPatterns: string[];
}

// ---------------------------------------------------------------------------
// Content Boundaries — What is allowed / disallowed
// ---------------------------------------------------------------------------

export interface ContentBoundaries {
  /** Forbidden content keywords — intake will reject scripts containing these */
  forbiddenKeywords: string[];
  /** Maximum violence level (0 = none, 1 = implied, 2 = stylized, 3+ = rejected) */
  maxViolenceLevel: number;
  /** Whether explicit sexual content is allowed */
  allowExplicit: false;
  /** Whether hate speech patterns are allowed */
  allowHate: false;
  /** Maximum number of scenes per render */
  maxScenes: number;
  /** Maximum total duration in seconds */
  maxTotalDurationSeconds: number;
}

// ---------------------------------------------------------------------------
// Style Defaults — Fallback aesthetic choices
// ---------------------------------------------------------------------------

export interface StyleDefaults {
  /** Default LUT when no style is specified and no keywords match */
  fallbackLut: string;
  /** Default motion when no motion is specified and no keywords match */
  fallbackMotion: string;
  /** Default intensity for audio-reactive effects */
  fallbackIntensity: string;
  /** Default BPM when no BPM is specified */
  fallbackBpm: number;
}

// ---------------------------------------------------------------------------
// The Full Spec
// ---------------------------------------------------------------------------

export interface MommaSpec {
  version: string;
  name: string;
  values: BozitiveValues;
  tone: ToneConstraints;
  content: ContentBoundaries;
  styleDefaults: StyleDefaults;
}

// ---------------------------------------------------------------------------
// The Living Instance — v1
// ---------------------------------------------------------------------------

export const MOMMA_SPEC_V1: MommaSpec = {
  version: '1.0.0',
  name: 'MommaAI',

  values: {
    nonHarm: true,
    accessibility: true,
    clarity: true,
    regenerativeDesign: true,
    structuralIntegrity: true,
  },

  tone: {
    defaultTone: 'neutral',
    maxTone: 'assertive',
    forbiddenPatterns: [
      'kill\\b', 'destroy\\b', 'hate\\b', 'die\\b',
    ],
  },

  content: {
    forbiddenKeywords: [
      'murder', 'suicide', 'genocide', 'terrorist', 'pornograph',
      'racial slur', 'hate speech',
    ],
    maxViolenceLevel: 1,
    allowExplicit: false,
    allowHate: false,
    maxScenes: 10,
    maxTotalDurationSeconds: 120,
  },

  styleDefaults: {
    fallbackLut: 'dream_warmth',
    fallbackMotion: 'drift',
    fallbackIntensity: 'medium',
    fallbackBpm: 120,
  },
};

/**
 * Produce a deterministic hash of a MommaSpec version.
 * Used as the governance stamp — if the spec changes, every
 * downstream manifest's stamp becomes stale.
 */
export function hashMommaSpec(spec: MommaSpec): string {
  const crypto = require('crypto');
  const canonical = JSON.stringify({ version: spec.version, name: spec.name });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}
