/**
 * CCAI — The Alignment Agent
 *
 * Second stage of the BBnCC pipeline. Takes parsed scenes and
 * the IntakeRecord, then validates and harmonizes against MommaSpec.
 *
 * CCAI checks alignment, ensures safety, validates constraints,
 * harmonizes tone and behavior, and ensures every scene fits
 * the Bozitive contract.
 *
 * If a scene's style conflicts with MommaSpec values, CCAI adjusts
 * it and records the adjustment for traceability.
 */

import { Scene } from '../types';
import { MommaSpec } from './momma_spec';
import { IntakeRecord } from './bozitive_manifest';
import { AlignmentRecord, AlignmentAdjustment } from './bozitive_manifest';

// ---------------------------------------------------------------------------
// CCAI Alignment Class
// ---------------------------------------------------------------------------

export class CCAIAlignment {
  constructor(private spec: MommaSpec) {}

  /**
   * Align a set of parsed scenes against MommaSpec.
   * May mutate scenes in-place (adjustments) and records every change.
   */
  align(scenes: Scene[], intake: IntakeRecord): AlignmentRecord {
    const adjustments: AlignmentAdjustment[] = [];
    const warnings: string[] = [];
    const now = new Date();

    // If intake was rejected, alignment auto-fails
    if (!intake.accepted) {
      return {
        aligned: false,
        adjustments: [],
        warnings: [],
        rejectionReason: `Intake was rejected: ${intake.rejectionReason}`,
        evaluatedAt: now,
      };
    }

    // --- Scene Count Enforcement ---
    if (scenes.length > this.spec.content.maxScenes) {
      warnings.push(`Trimming ${scenes.length - this.spec.content.maxScenes} excess scene(s) to meet MommaSpec limit.`);
      scenes.length = this.spec.content.maxScenes;
    }

    // --- Total Duration Enforcement ---
    let totalDuration = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
    if (totalDuration > this.spec.content.maxTotalDurationSeconds) {
      warnings.push(`Total duration ${totalDuration}s exceeds MommaSpec limit of ${this.spec.content.maxTotalDurationSeconds}s — trimming last scenes.`);
      let accumulated = 0;
      for (let i = 0; i < scenes.length; i++) {
        accumulated += scenes[i].durationSeconds;
        if (accumulated > this.spec.content.maxTotalDurationSeconds) {
          const overflow = accumulated - this.spec.content.maxTotalDurationSeconds;
          const newDuration = scenes[i].durationSeconds - overflow;
          if (newDuration >= 1) {
            adjustments.push({
              sceneId: scenes[i].id,
              field: 'durationSeconds',
              from: `${scenes[i].durationSeconds}`,
              to: `${newDuration}`,
              reason: 'Trimmed to fit MommaSpec total duration limit.',
            });
            scenes[i].durationSeconds = newDuration;
          }
          // Remove any remaining scenes
          if (i + 1 < scenes.length) {
            const removed = scenes.length - (i + 1);
            scenes.length = i + 1;
            warnings.push(`Removed ${removed} trailing scene(s) to meet duration limit.`);
          }
          break;
        }
      }
    }

    // --- Per-Scene Alignment ---
    for (const scene of scenes) {
      // Content re-check at scene level
      const sceneText = `${scene.description} ${scene.onscreenText}`.toLowerCase();

      for (const keyword of this.spec.content.forbiddenKeywords) {
        if (sceneText.includes(keyword.toLowerCase())) {
          return {
            aligned: false,
            adjustments,
            warnings,
            rejectionReason: `Scene ${scene.id} contains forbidden content: "${keyword}"`,
            evaluatedAt: now,
          };
        }
      }

      // Style harmonization — apply fallback defaults from MommaSpec
      if (!scene.lut) {
        adjustments.push({
          sceneId: scene.id,
          field: 'lut',
          from: 'undefined',
          to: 'auto',
          reason: 'No style specified — CCAI applied auto-detection with MommaSpec fallback.',
        });
      }

      if (!scene.motion) {
        adjustments.push({
          sceneId: scene.id,
          field: 'motion',
          from: 'undefined',
          to: 'auto',
          reason: 'No motion specified — CCAI applied auto-detection with MommaSpec fallback.',
        });
      }

      // Intensity harmonization
      if (!scene.intensity) {
        scene.intensity = this.spec.styleDefaults.fallbackIntensity as any;
        adjustments.push({
          sceneId: scene.id,
          field: 'intensity',
          from: 'undefined',
          to: this.spec.styleDefaults.fallbackIntensity,
          reason: 'No intensity specified — CCAI applied MommaSpec default.',
        });
      }

      // BPM fallback
      if (!scene.bpm) {
        scene.bpm = this.spec.styleDefaults.fallbackBpm;
        adjustments.push({
          sceneId: scene.id,
          field: 'bpm',
          from: 'undefined',
          to: `${this.spec.styleDefaults.fallbackBpm}`,
          reason: 'No BPM specified — CCAI applied MommaSpec default.',
        });
      }

      // Tone check on description
      for (const pattern of this.spec.tone.forbiddenPatterns) {
        if (new RegExp(pattern, 'i').test(scene.description)) {
          return {
            aligned: false,
            adjustments,
            warnings,
            rejectionReason: `Scene ${scene.id} description violates tone constraint: "${pattern}"`,
            evaluatedAt: now,
          };
        }
      }
    }

    console.log(`[CCAI] Alignment PASSED — ${scenes.length} scene(s), ${adjustments.length} adjustment(s)`);

    return {
      aligned: true,
      adjustments,
      warnings,
      evaluatedAt: now,
    };
  }
}
