import { v4 as uuidv4 } from 'uuid';
import { SceneManifest, ValidationEntry } from '../validate/scene_validator';
import { planShots } from '../plan/shot_planner';
import { createVideoGenerator } from '../generate/video_generator_adapter';
import { composeTimeline } from '../compose/timeline_compositor';
import { burnCaptions } from '../compose/captions';
import { exportFinal } from '../export/exporter';
import { hashManifest } from '../utils/manifest_hash';
import { GeneratedClip } from '../types';

// ---------------------------------------------------------------------------
// Job Lifecycle Contract (JLC)
// ---------------------------------------------------------------------------

export type JobStatus =
  | 'queued'
  | 'planning'
  | 'rendering'
  | 'exporting'
  | 'completed'
  | 'failed';

export interface JobProgress {
  currentScene: number;
  totalScenes: number;
  phase: JobStatus;
  percent: number;
}

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

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const WORKER_COUNT = parseInt(process.env.WORKER_COUNT || '2', 10);
const RENDER_TIMEOUT_MS = parseInt(process.env.RENDER_TIMEOUT_MS || '600000', 10); // 10 min
const CLEANUP_AFTER_MS = parseInt(process.env.CLEANUP_AFTER_MS || '3600000', 10); // 1 hour
const CLEANUP_INTERVAL_MS = 60_000; // check every minute

// ---------------------------------------------------------------------------
// Worker Pool + Queue Manager
// ---------------------------------------------------------------------------

class JobQueue {
  private queue: RenderJob[] = [];
  private activeWorkers = 0;
  private history: Map<string, RenderJob> = new Map();
  private cache: Map<string, Buffer> = new Map(); // manifestHash → result

  constructor() {
    setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    console.log(`[Queue] Initialized — ${WORKER_COUNT} worker(s), timeout ${RENDER_TIMEOUT_MS / 1000}s, cleanup after ${CLEANUP_AFTER_MS / 1000}s`);
  }

  enqueue(manifest: SceneManifest, warnings: ValidationEntry[] = []): string {
    const manifestHash = hashManifest(manifest);

    // Cache hit — return instantly
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
      console.log(`[Queue] Job ${job.id} served from cache (hash=${manifestHash})`);
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
    this.queue.push(job);
    this.history.set(job.id, job);

    console.log(`[Queue] Job ${job.id} queued (hash=${manifestHash}). Queue depth: ${this.queue.length}`);
    this.dispatch();
    return job.id;
  }

  // Try to assign queued jobs to available workers
  private dispatch() {
    while (this.activeWorkers < WORKER_COUNT && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.activeWorkers++;
      this.runJob(job);
    }
  }

  private isTimedOut(job: RenderJob): boolean {
    return (job.status as string) === 'failed';
  }

  private async runJob(job: RenderJob) {
    job.status = 'planning';
    job.startedAt = new Date();

    // Timeout race — cast through string because TS narrows status after assignment
    const timeoutId = setTimeout(() => {
      const s = job.status as string;
      if (s !== 'completed' && s !== 'failed') {
        job.status = 'failed';
        job.error = `Render timed out after ${RENDER_TIMEOUT_MS / 1000}s`;
        job.completedAt = new Date();
        console.error(`[Queue] Job ${job.id} TIMED OUT`);
      }
    }, RENDER_TIMEOUT_MS);

    try {
      const { scenes } = job.manifest;
      const videoGenerator = createVideoGenerator();

      // --- PLANNING ---
      const shots = planShots(scenes);
      const totalSteps = shots.length + 2; // scenes + compose + export
      job.progress = { currentScene: 0, totalScenes: shots.length, phase: 'planning', percent: 0 };
      console.log(`[Queue] Job ${job.id} — planned ${shots.length} shot(s)`);

      // --- RENDERING (parallel within this job up to shot count) ---
      job.status = 'rendering';
      const clips: GeneratedClip[] = [];
      for (let i = 0; i < shots.length; i++) {
        if (this.isTimedOut(job)) return; // timeout killed us
        job.progress = {
          currentScene: i + 1,
          totalScenes: shots.length,
          phase: 'rendering',
          percent: Math.round(((i + 1) / totalSteps) * 100),
        };
        const clip = await videoGenerator.generate(shots[i]);
        clips.push(clip);
      }
      console.log(`[Queue] Job ${job.id} — rendered ${clips.length} clip(s)`);

      // --- EXPORTING (compose + captions + mux) ---
      if (this.isTimedOut(job)) return;
      job.status = 'exporting';
      job.progress = {
        currentScene: shots.length,
        totalScenes: shots.length,
        phase: 'exporting',
        percent: Math.round(((shots.length + 1) / totalSteps) * 100),
      };

      const timelinePath = await composeTimeline(clips);
      console.log(`[Queue] Job ${job.id} — timeline composed`);

      let finalPath: string;
      try {
        finalPath = await burnCaptions(timelinePath, scenes);
        console.log(`[Queue] Job ${job.id} — captions burned`);
      } catch (captionErr) {
        console.log(`[Queue] Job ${job.id} — caption burn failed, using uncaptioned: ${captionErr}`);
        finalPath = timelinePath;
      }

      const buffer = await exportFinal(finalPath);

      // --- COMPLETED ---
      job.result = buffer;
      job.status = 'completed';
      job.progress = {
        currentScene: shots.length,
        totalScenes: shots.length,
        phase: 'completed',
        percent: 100,
      };

      // Store in cache
      this.cache.set(job.manifestHash, buffer);

      const elapsed = ((Date.now() - job.startedAt!.getTime()) / 1000).toFixed(1);
      console.log(`[Queue] Job ${job.id} completed in ${elapsed}s — ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
    } catch (err: any) {
      if (!this.isTimedOut(job)) { // not already timed-out
        job.status = 'failed';
        job.error = err.message;
        console.error(`[Queue] Job ${job.id} failed: ${err.message}`);
      }
    } finally {
      clearTimeout(timeoutId);
      job.completedAt = job.completedAt ?? new Date();
      this.activeWorkers--;
      this.dispatch(); // check for more work
    }
  }

  // Auto-cleanup old completed/failed jobs
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
      console.log(`[Queue] Cleaned up ${cleaned} old job(s)`);
    }
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
      queued: this.queue.length,
      active: this.activeWorkers,
      maxWorkers: WORKER_COUNT,
      totalJobs: this.history.size,
      cacheSize: this.cache.size,
    };
  }
}

export const renderQueue = new JobQueue();
