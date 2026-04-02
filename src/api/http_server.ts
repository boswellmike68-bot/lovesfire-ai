import express from 'express';
import { governedQueue } from '../queue/governed_queue';
import { JobStatus } from '../types/job_contract';
import { bbnccEngine } from '../governance/bbncc_engine';
import { getAuditStore } from '../reflection/audit_log';
import { AuditEventType } from '../reflection/audit_store';

const app = express();

// CORS middleware for local Bozaboard frontend
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8080');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: '1mb' }));

// ---- POST /advisory — BBnCC Governance Response (text only, no video) ----

app.post('/advisory', (req, res) => {
  try {
    const { input } = req.body;

    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      res.status(400).json({ error: 'Request body must include a non-empty "input" string.' });
      return;
    }

    // Run through BBnCC governance pipeline (intake + alignment only, no video)
    const result = bbnccEngine.process(input);

    if (!result.success || !result.manifest) {
      const status = result.rejectedAt === 'validation' ? 400 : 403;
      res.status(status).json({
        success: false,
        error: result.rejectionReason,
        rejectedAt: result.rejectedAt,
        validationErrors: result.validation?.errors ?? [],
      });
      return;
    }

    // Return governance metadata + scene descriptions as advisory text
    const scenes = result.manifest.scenes || [];
    const advisoryText = scenes.map((s, i) => 
      `Scene ${i + 1}: ${s.description || '(no description)'}`
    ).join('\n');

    res.status(200).json({
      success: true,
      message: advisoryText || 'Advisory processed.',
      governanceStamp: result.manifest.lineage.governanceStamp,
      specVersion: result.manifest.lineage.specVersion,
      sceneCount: scenes.length,
      warnings: result.validation?.warnings ?? [],
    });
  } catch (err: any) {
    console.error('[advisory] Error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

// ---- POST /render — BBnCC Pipeline → GovernedQueue ----

app.post('/render', (req, res) => {
  try {
    const { script } = req.body;

    if (!script || typeof script !== 'string' || script.trim().length === 0) {
      res.status(400).json({ error: 'Request body must include a non-empty "script" string.' });
      return;
    }

    // Run through the full BBnCC governance pipeline
    const result = bbnccEngine.process(script);

    if (!result.success || !result.manifest) {
      const status = result.rejectedAt === 'validation' ? 400 : 403;
      res.status(status).json({
        error: result.rejectionReason,
        rejectedAt: result.rejectedAt,
        validationErrors: result.validation?.errors ?? [],
      });
      return;
    }

    const warnings = result.validation?.warnings ?? [];
    const jobId = governedQueue.enqueue(result.manifest, warnings);

    res.status(202).json({
      jobId,
      message: 'Render queued successfully.',
      governanceStamp: result.manifest.lineage.governanceStamp,
      specVersion: result.manifest.lineage.specVersion,
      warnings,
    });
  } catch (err: any) {
    console.error('[render] Error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

// ---- GET /status/:id — Poll job status + progress ----

app.get('/status/:id', (req, res) => {
  const job = governedQueue.getJobStatus(req.params.id);
  if (!job) {
    res.status(404).send('Job not found.');
    return;
  }
  res.json({
    id: job.id,
    manifestHash: job.manifestHash,
    status: job.status,
    progress: job.progress,
    warnings: job.warnings,
    error: job.error ?? null,
    createdAt: job.createdAt,
    startedAt: job.startedAt ?? null,
    completedAt: job.completedAt ?? null,
    downloadUrl: job.status === 'completed' ? `/download/${job.id}` : null,
    sizeBytes: job.status === 'completed' ? (job.result?.length ?? 0) : null,
  });
});

// ---- GET /download/:id — Download completed video ----

app.get('/download/:id', (req, res) => {
  const job = governedQueue.getJobStatus(req.params.id);
  if (!job) {
    res.status(404).send('Job not found.');
    return;
  }
  if (job.status !== 'completed' || !job.result) {
    res.status(409).json({ error: `Job is not ready. Current status: ${job.status}` });
    return;
  }

  res.set('Content-Type', 'video/mp4');
  res.set('Content-Disposition', `attachment; filename="lovesfire_${job.id.slice(0, 8)}.mp4"`);
  res.send(job.result);
});

// ---- GET /jobs — Admin: list jobs with optional filtering ----

app.get('/jobs', (req, res) => {
  const status = req.query.status as JobStatus | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

  const jobs = governedQueue.listJobs({ status, limit });
  res.json(
    jobs.map((j) => ({
      id: j.id,
      manifestHash: j.manifestHash,
      status: j.status,
      progress: j.progress,
      error: j.error ?? null,
      createdAt: j.createdAt,
      startedAt: j.startedAt ?? null,
      completedAt: j.completedAt ?? null,
    })),
  );
});

// ---- GET /stats — Admin: queue stats ----

app.get('/stats', (_req, res) => {
  res.json(governedQueue.getStats());
});

// ---- Reflection: Audit Endpoints ----

app.get('/audit/events', (req, res) => {
  const store = getAuditStore();
  const eventType = req.query.type as AuditEventType | undefined;
  const jobId = req.query.jobId as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  res.json(store.getEvents({ eventType, jobId, limit }));
});

app.get('/audit/births', (req, res) => {
  const store = getAuditStore();
  const manifestHash = req.query.hash as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  res.json(store.getBirthCerts({ manifestHash, limit }));
});

app.get('/audit/births/:jobId', (req, res) => {
  const store = getAuditStore();
  const cert = store.getBirthCertByJobId(req.params.jobId);
  if (!cert) {
    res.status(404).json({ error: 'Birth certificate not found.' });
    return;
  }
  res.json(cert);
});

app.get('/audit/renders', (req, res) => {
  const store = getAuditStore();
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  res.json(store.getRenderStats({ limit }));
});

app.get('/audit/renders/:jobId', (req, res) => {
  const store = getAuditStore();
  const stat = store.getRenderStatByJobId(req.params.jobId);
  if (!stat) {
    res.status(404).json({ error: 'Render stat not found.' });
    return;
  }
  res.json(stat);
});

app.get('/audit/summary', (_req, res) => {
  const store = getAuditStore();
  res.json(store.getSummary());
});

const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen(PORT, () => {
  console.log(`[lovesfire-ai] Server running on http://localhost:${PORT}`);
  console.log(`[lovesfire-ai] POST /render       — queue a render (returns jobId)`);
  console.log(`[lovesfire-ai] GET  /status/:id   — poll job status + progress`);
  console.log(`[lovesfire-ai] GET  /download/:id — download completed video`);
  console.log(`[lovesfire-ai] GET  /jobs          — list all jobs (admin)`);
  console.log(`[lovesfire-ai] GET  /stats         — queue stats (admin)`);
  console.log(`[lovesfire-ai] GET  /audit/*       — reflection audit log (events, births, renders, summary)`);
  console.log(`[lovesfire-ai] VIDEO_BACKEND=${process.env.VIDEO_BACKEND || 'mock'}`);
  console.log(`[lovesfire-ai] Reflection module active — audit history persists across restarts`);
});

export default app;
