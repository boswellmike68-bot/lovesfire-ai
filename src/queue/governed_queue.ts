/**
 * Governed Queue — The Archangel Overwatch layer.
 *
 * Merges the formal Job Lifecycle Contract with the worker pool
 * and the full render pipeline. Every state transition is validated,
 * logged, and traceable.
 *
 * This is the single governance surface for all render operations.
 */

import { v4 as uuidv4 } from 'uuid';
import { SceneManifest, ValidationEntry } from '../validate/scene_validator';
import { RenderJob, JobStatus, JobProgress, VALID_TRANSITIONS } from '../types/job_contract';
import { WorkerPool } from './worker_pool';
import { planShots } from '../plan/shot_planner';
import { createVideoGenerator } from '../generate/video_generator_adapter';
import { composeTimeline } from '../compose/timeline_compositor';
import { burnCaptions } from '../compose/captions';
import { exportFinal } from '../export/exporter';
import { hashManifest } from '../utils/manifest_hash';
import { GeneratedClip } from '../types';
import * as audit from '../reflection/audit_log';
import { BozitiveManifest } from '../governance/bozitive_manifest';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const WORKER_COUNT = parseInt(process.env.WORKER_COUNT || '2', 10);
const RENDER_TIMEOUT_MS = parseInt(process.env.RENDER_TIMEOUT_MS || '600000', 10);
const CLEANUP_AFTER_MS = parseInt(process.env.CLEANUP_AFTER_MS || '3600000', 10);
const CLEANUP_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// GovernedQueue
// ---------------------------------------------------------------------------

export class GovernedQueue {
  private pool: WorkerPool;
  private history: Map<string, RenderJob> = new Map();
  private cache: Map<string, Buffer> = new Map();

  constructor() {
    this.pool = new WorkerPool(WORKER_COUNT);
    setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    console.log(`[Overwatch] Governance initialized — ${WORKER_COUNT} worker(s), timeout ${RENDER_TIMEOUT_MS / 1000}s, cleanup after ${CLEANUP_AFTER_MS / 1000}s`);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  enqueue(manifest: SceneManifest, warnings: ValidationEntry[] = []): string {
    const manifestHash = hashManifest(manifest);

    // Cache hit — instant return
    const cached = this.cache.get(manifestHash);
    if (cached) {
      const job: RenderJob = {
        id: uuidv4(),
        manifestHash,
        manifest,
        warnings,
        status: 'completed',
        progress: null,
        result: cached,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
      };
      this.history.set(job.id, job);
      audit.logJobCompleted(job.id, manifestHash, manifest.scenes.length, 0, 0, cached.length, true);
      console.log(`[Overwatch] Job ${job.id} served from cache (hash=${manifestHash})`);
      return job.id;
    }

    const job: RenderJob = {
      id: uuidv4(),
      manifestHash,
      manifest,
      warnings,
      status: 'queued',
      progress: null,
      createdAt: new Date(),
    };
    this.history.set(job.id, job);

    // Save birth certificate if this is a BozitiveManifest
    if ('lineage' in manifest) {
      audit.logBirth(job.id, manifest as BozitiveManifest);
    }
    audit.logJobQueued(job.id, manifestHash);
    console.log(`[Overwatch] Job ${job.id} queued (hash=${manifestHash}). Queue depth: ${this.pool.queueDepth + 1}`);

    // Fire-and-forget — pool manages concurrency
    this.processJob(job);

    return job.id;
  }

  getJobStatus(id: string): RenderJob | undefined {
    return this.history.get(id);
  }

  listJobs(filter?: { status?: JobStatus; limit?: number }): RenderJob[] {
    let jobs = Array.from(this.history.values());
    if (filter?.status) {
      jobs = jobs.filter((j) => j.status === filter.status);
    }
    jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return jobs.slice(0, filter?.limit ?? 50);
  }

  getStats() {
    return {
      queued: this.pool.queueDepth,
      active: this.pool.active,
      maxWorkers: WORKER_COUNT,
      totalJobs: this.history.size,
      cacheSize: this.cache.size,
    };
  }

  // -----------------------------------------------------------------------
  // Governance: Validated State Transitions
  // -----------------------------------------------------------------------

  private transition(job: RenderJob, to: JobStatus) {
    const from = job.status;
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      console.error(`[Overwatch] INVALID TRANSITION: ${job.id} ${from} → ${to}`);
      return;
    }
    job.status = to;
    audit.logJobTransition(job.id, from, to);
    console.log(`[Overwatch] Job ${job.id}: ${from} → ${to}`);
  }

  // -----------------------------------------------------------------------
  // Pipeline Execution
  // -----------------------------------------------------------------------

  private async processJob(job: RenderJob) {
    await this.pool.run(async () => {
      this.transition(job, 'planning');
      job.startedAt = new Date();

      // Timeout race
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        const s = job.status as string;
        if (s !== 'completed' && s !== 'failed') {
          timedOut = true;
          this.transition(job, 'failed');
          job.error = `Render timed out after ${RENDER_TIMEOUT_MS / 1000}s`;
          job.completedAt = new Date();
          console.error(`[Overwatch] Job ${job.id} TIMED OUT`);
        }
      }, RENDER_TIMEOUT_MS);

      try {
        const { scenes } = job.manifest;
        const videoGenerator = createVideoGenerator();

        // --- PLANNING ---
        const shots = planShots(scenes);
        const totalSteps = shots.length + 2;
        job.progress = { currentScene: 0, totalScenes: shots.length, phase: 'planning', percent: 0 };
        console.log(`[Overwatch] Job ${job.id} — planned ${shots.length} shot(s)`);

        // --- RENDERING ---
        this.transition(job, 'rendering');
        const clips: GeneratedClip[] = [];
        for (let i = 0; i < shots.length; i++) {
          if (timedOut) return;
          job.progress = {
            currentScene: i + 1,
            totalScenes: shots.length,
            phase: 'rendering',
            percent: Math.round(((i + 1) / totalSteps) * 100),
          };
          const clip = await videoGenerator.generate(shots[i]);
          clips.push(clip);
        }
        console.log(`[Overwatch] Job ${job.id} — rendered ${clips.length} clip(s)`);

        // --- EXPORTING ---
        if (timedOut) return;
        this.transition(job, 'exporting');
        job.progress = {
          currentScene: shots.length,
          totalScenes: shots.length,
          phase: 'exporting',
          percent: Math.round(((shots.length + 1) / totalSteps) * 100),
        };

        const timelinePath = await composeTimeline(clips);
        console.log(`[Overwatch] Job ${job.id} — timeline composed`);

        let finalPath: string;
        try {
          finalPath = await burnCaptions(timelinePath, scenes);
          console.log(`[Overwatch] Job ${job.id} — captions burned`);
        } catch (captionErr) {
          console.log(`[Overwatch] Job ${job.id} — caption burn failed, using uncaptioned: ${captionErr}`);
          finalPath = timelinePath;
        }

        const buffer = await exportFinal(finalPath);

        // --- COMPLETED ---
        job.result = buffer;
        this.transition(job, 'completed');
        job.progress = {
          currentScene: shots.length,
          totalScenes: shots.length,
          phase: 'completed',
          percent: 100,
        };

        this.cache.set(job.manifestHash, buffer);

        const renderTimeMs = Date.now() - job.startedAt!.getTime();
        const totalDuration = job.manifest.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
        audit.logJobCompleted(job.id, job.manifestHash, shots.length, totalDuration, renderTimeMs, buffer.length, false);

        const elapsed = (renderTimeMs / 1000).toFixed(1);
        console.log(`[Overwatch] Job ${job.id} completed in ${elapsed}s — ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
      } catch (err: any) {
        if (!timedOut) {
          this.transition(job, 'failed');
          job.error = err.message;
          audit.logJobFailed(job.id, err.message);
          console.error(`[Overwatch] Job ${job.id} failed: ${err.message}`);
        }
      } finally {
        clearTimeout(timeoutId);
        job.completedAt = job.completedAt ?? new Date();
      }
    });
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  private cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, job] of this.history) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.completedAt &&
        now - job.completedAt.getTime() > CLEANUP_AFTER_MS
      ) {
        this.history.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[Overwatch] Cleaned up ${cleaned} old job(s)`);
    }
  }
}

// Singleton
export const governedQueue = new GovernedQueue();
