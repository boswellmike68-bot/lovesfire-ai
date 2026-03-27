import { Scene } from '../types';

/**
 * A validated set of scenes ready to enter the render pipeline.
 * Carries the original script for traceability and the parsed scenes.
 */
export interface SceneManifest {
  rawScript: string;
  scenes: Scene[];
}

const MIN_DURATION = 1;
const MAX_DURATION = 30;
const MAX_TEXT_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SCENES = 10;

export type WarningCode =
  | 'EMPTY_DESCRIPTION'
  | 'DESCRIPTION_TRUNCATED'
  | 'TEXT_OVERFLOW'
  | 'GLITCH_APPLIED'
  | 'LONG_TOTAL_DURATION';

export type ErrorCode =
  | 'EMPTY_MANIFEST'
  | 'TOO_MANY_SCENES'
  | 'DURATION_TOO_LOW'
  | 'DURATION_TOO_HIGH';

export interface ValidationEntry {
  code: ErrorCode | WarningCode;
  sceneId: number;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationEntry[];
  warnings: ValidationEntry[];
}

/**
 * Validate a manifest of parsed scenes before they enter the render pipeline.
 * Returns structured errors and warnings — never throws.
 */
export function validateSceneManifest(scenes: Scene[]): ValidationResult {
  const errors: ValidationEntry[] = [];
  const warnings: ValidationEntry[] = [];

  if (scenes.length === 0) {
    errors.push({ code: 'EMPTY_MANIFEST', sceneId: 0, field: 'manifest', message: 'Manifest contains 0 scenes.' });
    return { valid: false, errors, warnings };
  }

  if (scenes.length > MAX_SCENES) {
    errors.push({
      code: 'TOO_MANY_SCENES',
      sceneId: 0,
      field: 'manifest',
      message: `Manifest contains ${scenes.length} scenes (max ${MAX_SCENES}).`,
    });
  }

  let totalDuration = 0;

  for (const scene of scenes) {
    // Duration bounds
    if (scene.durationSeconds < MIN_DURATION) {
      errors.push({
        code: 'DURATION_TOO_LOW',
        sceneId: scene.id,
        field: 'durationSeconds',
        message: `Duration ${scene.durationSeconds}s is below minimum ${MIN_DURATION}s.`,
      });
    }
    if (scene.durationSeconds > MAX_DURATION) {
      errors.push({
        code: 'DURATION_TOO_HIGH',
        sceneId: scene.id,
        field: 'durationSeconds',
        message: `Duration ${scene.durationSeconds}s exceeds maximum ${MAX_DURATION}s.`,
      });
    }
    totalDuration += scene.durationSeconds;

    // Description
    if (!scene.description || scene.description.trim().length === 0) {
      warnings.push({
        code: 'EMPTY_DESCRIPTION',
        sceneId: scene.id,
        field: 'description',
        message: 'Description is empty — mock generator will use a default label.',
      });
    }
    if (scene.description && scene.description.length > MAX_DESCRIPTION_LENGTH) {
      warnings.push({
        code: 'DESCRIPTION_TRUNCATED',
        sceneId: scene.id,
        field: 'description',
        message: `Description is ${scene.description.length} chars (max ${MAX_DESCRIPTION_LENGTH}) — will be truncated.`,
      });
    }

    // On-screen text
    if (scene.onscreenText && scene.onscreenText.length > MAX_TEXT_LENGTH) {
      warnings.push({
        code: 'TEXT_OVERFLOW',
        sceneId: scene.id,
        field: 'onscreenText',
        message: `On-screen text is ${scene.onscreenText.length} chars (max ${MAX_TEXT_LENGTH}) — may overflow.`,
      });
    }

    // Glitch flag detection (informational)
    if (scene.description.toLowerCase().includes('glitch')) {
      warnings.push({
        code: 'GLITCH_APPLIED',
        sceneId: scene.id,
        field: 'description',
        message: 'Glitch effect will be applied to this scene.',
      });
    }
  }

  // Total duration sanity check
  if (totalDuration > 120) {
    warnings.push({
      code: 'LONG_TOTAL_DURATION',
      sceneId: 0,
      field: 'manifest',
      message: `Total duration is ${totalDuration}s — renders over 120s may be slow or hit memory limits.`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
