/**
 * Job Lifecycle Contract (JLC)
 *
 * Defines the formal state machine and data contract for render jobs.
 * Every job transitions through these states deterministically:
 *
 *   queued → planning → rendering → exporting → completed
 *                                              ↘ failed
 *
 * This contract is the governance surface — sponsors, workers, and
 * the API all reference this single source of truth.
 */

import { SceneManifest, ValidationEntry } from '../validate/scene_validator';

// ---------------------------------------------------------------------------
// State Machine
// ---------------------------------------------------------------------------

export type JobStatus =
  | 'queued'
  | 'planning'
  | 'rendering'
  | 'exporting'
  | 'completed'
  | 'failed';

/** Valid state transitions — enforced by GovernedQueue */
export const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  queued: ['planning', 'failed'],
  planning: ['rendering', 'failed'],
  rendering: ['exporting', 'failed'],
  exporting: ['completed', 'failed'],
  completed: [],
  failed: [],
};

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface JobProgress {
  currentScene: number;
  totalScenes: number;
  phase: JobStatus;
  percent: number;
}

// ---------------------------------------------------------------------------
// Job Record
// ---------------------------------------------------------------------------

export interface RenderJob {
  id: string;
  manifestHash: string;
  manifest: SceneManifest;
  warnings: ValidationEntry[];
  status: JobStatus;
  progress: JobProgress | null;
  result?: Buffer;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}
