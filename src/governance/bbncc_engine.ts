/**
 * BBnCC Engine — The Creation Pipeline
 *
 * Orchestrates the full governance flow:
 *
 *   1. BBAI Intake  → evaluates raw script, checks content safety
 *   2. Parse        → transforms raw script into Scene[]
 *   3. CCAI Align   → validates scenes against MommaSpec, harmonizes style
 *   4. Validate     → runs structural validation (existing scene_validator)
 *   5. Birth        → produces a BozitiveManifest ready for GovernedQueue
 *
 * The engine does NOT render — it produces a governed manifest that
 * the GovernedQueue consumes. Separation of creation from execution.
 */

import { MommaSpec, hashMommaSpec, MOMMA_SPEC_V1 } from './momma_spec';
import { BBAIIntake } from './bbai_intake';
import { CCAIAlignment } from './ccai_alignment';
import { BozitiveManifest, BozitiveLineage } from './bozitive_manifest';
import { ingestScript } from '../ingest/script_ingest';
import { parseScenes } from '../parse/scene_parser';
import { validateSceneManifest, ValidationResult } from '../validate/scene_validator';
import * as audit from '../reflection/audit_log';

// ---------------------------------------------------------------------------
// Engine Result
// ---------------------------------------------------------------------------

export interface BBnCCResult {
  /** Did the script pass the full pipeline? */
  success: boolean;
  /** The governed manifest (only present if success === true) */
  manifest?: BozitiveManifest;
  /** Validation result from scene_validator */
  validation?: ValidationResult;
  /** Rejection reason (only present if success === false) */
  rejectionReason?: string;
  /** Which stage rejected: 'intake' | 'alignment' | 'validation' */
  rejectedAt?: 'intake' | 'alignment' | 'validation';
}

// ---------------------------------------------------------------------------
// BBnCC Engine
// ---------------------------------------------------------------------------

export class BBnCCEngine {
  private bbai: BBAIIntake;
  private ccai: CCAIAlignment;
  private spec: MommaSpec;
  private governanceStamp: string;

  constructor(spec: MommaSpec = MOMMA_SPEC_V1) {
    this.spec = spec;
    this.bbai = new BBAIIntake(spec);
    this.ccai = new CCAIAlignment(spec);
    this.governanceStamp = hashMommaSpec(spec);
    console.log(`[BBnCC] Engine initialized — MommaSpec v${spec.version}, stamp=${this.governanceStamp}`);
  }

  /**
   * Process a raw script through the full BBnCC pipeline.
   * Returns a governed BozitiveManifest or a rejection.
   */
  process(rawScript: string): BBnCCResult {
    const startTime = Date.now();

    // --- Stage 1: BBAI Intake ---
    const intake = this.bbai.evaluate(rawScript);
    if (!intake.accepted) {
      audit.logIntakeRejected(intake.rejectionReason || 'Unknown', this.governanceStamp);
      console.log(`[BBnCC] Pipeline REJECTED at intake: ${intake.rejectionReason}`);
      return {
        success: false,
        rejectionReason: intake.rejectionReason,
        rejectedAt: 'intake',
      };
    }

    // --- Stage 2: Parse ---
    const { raw } = ingestScript(rawScript);
    let scenes;
    try {
      scenes = parseScenes(raw);
    } catch (err: any) {
      console.log(`[BBnCC] Pipeline REJECTED at parse: ${err.message}`);
      return {
        success: false,
        rejectionReason: `Parse error: ${err.message}`,
        rejectedAt: 'intake',
      };
    }

    // --- Stage 3: CCAI Alignment ---
    const alignment = this.ccai.align(scenes, intake);
    if (!alignment.aligned) {
      audit.logAlignmentRejected(alignment.rejectionReason || 'Unknown', this.governanceStamp);
      console.log(`[BBnCC] Pipeline REJECTED at alignment: ${alignment.rejectionReason}`);
      return {
        success: false,
        rejectionReason: alignment.rejectionReason,
        rejectedAt: 'alignment',
      };
    }

    audit.logIntakeAccepted('pending', this.governanceStamp, intake.contentFlag, intake.capabilities.length);
    audit.logAlignmentPassed('pending', this.governanceStamp, alignment.adjustments.length);

    // --- Stage 4: Structural Validation ---
    const validation = validateSceneManifest(scenes);
    if (!validation.valid) {
      console.log(`[BBnCC] Pipeline REJECTED at validation: ${validation.errors.length} error(s)`);
      return {
        success: false,
        validation,
        rejectionReason: validation.errors.map((e) => e.message).join('; '),
        rejectedAt: 'validation',
      };
    }

    // --- Stage 5: Birth ---
    const lineage: BozitiveLineage = {
      specVersion: this.spec.version,
      governanceStamp: this.governanceStamp,
      intake,
      alignment,
      bornAt: new Date(),
    };

    const manifest: BozitiveManifest = {
      rawScript: raw,
      scenes,
      lineage,
      compliant: true,
    };

    const elapsed = Date.now() - startTime;
    console.log(`[BBnCC] Bozitive born in ${elapsed}ms — ${scenes.length} scene(s), stamp=${this.governanceStamp}`);

    // Birth certificate will be saved when the job is queued (jobId is assigned there)
    return {
      success: true,
      manifest,
      validation,
    };
  }
}

// Singleton with default MommaSpec
export const bbnccEngine = new BBnCCEngine();
