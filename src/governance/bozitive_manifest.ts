/**
 * Bozitive Manifest — The Birth Certificate
 *
 * Every render that passes through the BBnCC engine produces
 * a BozitiveManifest. This extends the SceneManifest with:
 *
 *   - lineage: who created it, when, through what spec
 *   - intake record: BBAI's assessment
 *   - alignment record: CCAI's assessment
 *   - governance stamp: hash of the MommaSpec that was applied
 *
 * This is the traceable proof that a Bozitive was born correctly.
 */

import { SceneManifest } from '../validate/scene_validator';

// ---------------------------------------------------------------------------
// Intake Record — BBAI's assessment
// ---------------------------------------------------------------------------

export type ContentFlag = 'clean' | 'mild_language' | 'stylized_violence' | 'rejected';

export interface IntakeCapability {
  name: string;
  required: boolean;
}

export interface IntakeRecord {
  /** Did the input pass intake? */
  accepted: boolean;
  /** Detected content safety flag */
  contentFlag: ContentFlag;
  /** Capabilities the script requires */
  capabilities: IntakeCapability[];
  /** Intake-level warnings */
  warnings: string[];
  /** Reason for rejection (if accepted === false) */
  rejectionReason?: string;
  /** Timestamp of intake evaluation */
  evaluatedAt: Date;
}

// ---------------------------------------------------------------------------
// Alignment Record — CCAI's assessment
// ---------------------------------------------------------------------------

export interface AlignmentAdjustment {
  sceneId: number;
  field: string;
  from: string;
  to: string;
  reason: string;
}

export interface AlignmentRecord {
  /** Did the manifest pass alignment? */
  aligned: boolean;
  /** Adjustments CCAI made to bring the manifest into compliance */
  adjustments: AlignmentAdjustment[];
  /** Alignment-level warnings */
  warnings: string[];
  /** Reason for rejection (if aligned === false) */
  rejectionReason?: string;
  /** Timestamp of alignment evaluation */
  evaluatedAt: Date;
}

// ---------------------------------------------------------------------------
// Lineage — Who created this Bozitive
// ---------------------------------------------------------------------------

export interface BozitiveLineage {
  /** MommaSpec version used */
  specVersion: string;
  /** Hash of the MommaSpec at time of creation */
  governanceStamp: string;
  /** BBAI intake record */
  intake: IntakeRecord;
  /** CCAI alignment record */
  alignment: AlignmentRecord;
  /** Timestamp of birth (manifest creation) */
  bornAt: Date;
}

// ---------------------------------------------------------------------------
// The Full Bozitive Manifest
// ---------------------------------------------------------------------------

export interface BozitiveManifest extends SceneManifest {
  /** Unique lineage trace for this Bozitive */
  lineage: BozitiveLineage;
  /** Is this manifest fully compliant with MommaSpec? */
  compliant: boolean;
}
