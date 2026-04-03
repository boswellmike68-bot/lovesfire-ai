/**
 * Monetized HTTP Server — LovesfireAI with Programmable Revenue
 *
 * This version adds credit-based API gating to the governance pipeline.
 * Every render costs credits. Credits are purchased via Stripe.
 *
 * The system now has "financial lungs" — it can fund its own operations.
 */

import express from 'express';
import { governedQueue } from '../queue/governed_queue';
import { JobStatus } from '../types/job_contract';
import { bbnccEngine } from '../governance/bbncc_engine';
import { getAuditStore } from '../reflection/audit_log';
import { AuditEventType } from '../reflection/audit_store';
import { initCreditStore, getCreditStore } from '../monetization/credit_store';
import { requireApiKey, requireCredits, AuthenticatedRequest } from '../monetization/api_key_middleware';
import { handleStripeWebhook, createPaymentIntent, CREDIT_PACKAGES } from '../monetization/stripe_webhook';
import { calculateRenderCost, calculateAdvisoryCost, getPricingBreakdown } from '../monetization/pricing';

const app = express();

// Initialize credit store
initCreditStore();

// CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'http://localhost:8080');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Stripe webhook needs raw body
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

// JSON parsing for all other routes
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Monetization Endpoints
// ---------------------------------------------------------------------------

// ---- POST /api-keys — Create a new API key ----
app.post('/api-keys', (req, res) => {
  try {
    const { userId, initialCredits } = req.body;

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const store = getCreditStore();
    const apiKey = store.createApiKey(userId, initialCredits || 0);

    res.status(201).json({
      apiKey,
      userId,
      credits: initialCredits || 0,
      message: 'API key created successfully',
    });
  } catch (err: any) {
    console.error('[api-keys] Error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

// ---- GET /credits — Check credit balance ----
app.get('/credits', requireApiKey, (req: AuthenticatedRequest, res) => {
  try {
    const store = getCreditStore();
    const balance = store.getBalance(req.apiKey!);
    const transactions = store.getTransactions(req.apiKey!, 10);

    res.json({
      apiKey: req.apiKey,
      userId: req.userId,
      balance,
      recentTransactions: transactions,
    });
  } catch (err: any) {
    console.error('[credits] Error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

// ---- POST /credits/purchase — Create payment intent for credit purchase ----
app.post('/credits/purchase', requireApiKey, async (req: AuthenticatedRequest, res) => {
  try {
    const { package: packageType } = req.body;

    if (!packageType || !CREDIT_PACKAGES[packageType as keyof typeof CREDIT_PACKAGES]) {
      res.status(400).json({
        error: 'Invalid package type',
        availablePackages: Object.keys(CREDIT_PACKAGES),
      });
      return;
    }

    const paymentIntent = await createPaymentIntent(req.apiKey!, packageType);

    res.json({
      clientSecret: paymentIntent.clientSecret,
      amount: paymentIntent.amount,
      credits: paymentIntent.credits,
      package: packageType,
    });
  } catch (err: any) {
    console.error('[credits/purchase] Error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

// ---- GET /pricing — Get pricing information ----
app.get('/pricing', (_req, res) => {
  res.json({
    packages: CREDIT_PACKAGES,
    costs: {
      advisory: calculateAdvisoryCost(),
      renderPerScene: 5,
      renderPerSecond: 0.5,
    },
    example: {
      twoScenes10Seconds: calculateRenderCost([
        { id: 1, label: 'Scene 1', description: 'Test', onscreenText: '', durationSeconds: 5 },
        { id: 2, label: 'Scene 2', description: 'Test', onscreenText: '', durationSeconds: 5 },
      ]),
    },
  });
});

// ---------------------------------------------------------------------------
// Governed Endpoints (Monetized)
// ---------------------------------------------------------------------------

// ---- POST /advisory — BBnCC Governance Response (costs 1 credit) ----
app.post('/advisory', requireApiKey, requireCredits(1), (req: AuthenticatedRequest, res) => {
  try {
    const { input } = req.body;

    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      res.status(400).json({ error: 'Request body must include a non-empty "input" string.' });
      return;
    }

    // Deduct credits BEFORE processing
    const store = getCreditStore();
    const cost = calculateAdvisoryCost();
    const deducted = store.deductCredits(req.apiKey!, cost, 'advisory');

    if (!deducted) {
      res.status(402).json({ error: 'Failed to deduct credits' });
      return;
    }

    // Run through BBnCC governance pipeline
    const result = bbnccEngine.process(input);

    if (!result.success || !result.manifest) {
      const status = result.rejectedAt === 'validation' ? 400 : 403;
      res.status(status).json({
        success: false,
        error: result.rejectionReason,
        rejectedAt: result.rejectedAt,
        validationErrors: result.validation?.errors ?? [],
        creditsCharged: cost,
      });
      return;
    }

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
      creditsCharged: cost,
      creditsRemaining: store.getBalance(req.apiKey!),
    });
  } catch (err: any) {
    console.error('[advisory] Error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

// ---- POST /render — BBnCC Pipeline → GovernedQueue (costs 5+ credits) ----
app.post('/render', requireApiKey, (req: AuthenticatedRequest, res) => {
  try {
    const { script, highRes } = req.body;

    if (!script || typeof script !== 'string' || script.trim().length === 0) {
      res.status(400).json({ error: 'Request body must include a non-empty "script" string.' });
      return;
    }

    // Run through BBnCC governance pipeline
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

    // Calculate cost based on scene complexity
    const cost = calculateRenderCost(result.manifest.scenes, highRes || false);
    const breakdown = getPricingBreakdown(result.manifest.scenes, highRes || false);

    // Check if user has enough credits
    const store = getCreditStore();
    const balance = store.getBalance(req.apiKey!);

    if (balance < cost) {
      res.status(402).json({
        error: 'Insufficient credits',
        required: cost,
        balance,
        breakdown,
        hint: 'Purchase more credits at /credits/purchase',
      });
      return;
    }

    // Deduct credits BEFORE queueing
    const deducted = store.deductCredits(req.apiKey!, cost, 'render');
    if (!deducted) {
      res.status(500).json({ error: 'Failed to deduct credits' });
      return;
    }

    // Queue the render
    const warnings = result.validation?.warnings ?? [];
    const jobId = governedQueue.enqueue(result.manifest, warnings);

    res.status(202).json({
      jobId,
      message: 'Render queued successfully.',
      governanceStamp: result.manifest.lineage.governanceStamp,
      specVersion: result.manifest.lineage.specVersion,
      warnings,
      creditsCharged: cost,
      creditsRemaining: store.getBalance(req.apiKey!),
      breakdown,
    });
  } catch (err: any) {
    console.error('[render] Error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Public Endpoints (No Auth Required)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Admin Endpoints (Protected)
// ---------------------------------------------------------------------------

// ---- GET /admin/keys — List all API keys ----
app.get('/admin/keys', (req, res) => {
  // TODO: Add admin authentication
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const store = getCreditStore();
  const keys = store.getAllKeys();
  res.json(keys);
});

// ---- GET /admin/revenue — Get total revenue stats ----
app.get('/admin/revenue', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const store = getCreditStore();
  const totalCredits = store.getTotalRevenue();
  
  res.json({
    totalCreditsPurchased: totalCredits,
    estimatedRevenue: {
      usd: (totalCredits / 10) * 5, // Rough estimate: 10 credits = $5
    },
  });
});

// ---- GET /jobs — Admin: list jobs ----
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

// ---- Audit Endpoints ----
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

// ---------------------------------------------------------------------------
// Server Start
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen(PORT, () => {
  console.log(`[lovesfire-ai] 💰 MONETIZED SERVER running on http://localhost:${PORT}`);
  console.log(`[lovesfire-ai] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[lovesfire-ai] 🔑 API Key Endpoints:`);
  console.log(`[lovesfire-ai]    POST /api-keys          — create new API key`);
  console.log(`[lovesfire-ai]    GET  /credits           — check balance (requires auth)`);
  console.log(`[lovesfire-ai]    POST /credits/purchase  — buy credits (requires auth)`);
  console.log(`[lovesfire-ai]    GET  /pricing           — view pricing tiers`);
  console.log(`[lovesfire-ai] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[lovesfire-ai] 🎬 Governed Endpoints (Require API Key):`);
  console.log(`[lovesfire-ai]    POST /advisory          — governance check (1 credit)`);
  console.log(`[lovesfire-ai]    POST /render            — queue render (5+ credits)`);
  console.log(`[lovesfire-ai] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[lovesfire-ai] 📊 Public Endpoints:`);
  console.log(`[lovesfire-ai]    GET  /status/:id        — poll job status`);
  console.log(`[lovesfire-ai]    GET  /download/:id      — download video`);
  console.log(`[lovesfire-ai] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[lovesfire-ai] 💳 Payment:`);
  console.log(`[lovesfire-ai]    POST /webhook/stripe    — Stripe webhook`);
  console.log(`[lovesfire-ai] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[lovesfire-ai] 🔐 Admin Endpoints:`);
  console.log(`[lovesfire-ai]    GET  /admin/keys        — list all API keys`);
  console.log(`[lovesfire-ai]    GET  /admin/revenue     — revenue stats`);
  console.log(`[lovesfire-ai]    GET  /jobs              — list jobs`);
  console.log(`[lovesfire-ai]    GET  /stats             — queue stats`);
  console.log(`[lovesfire-ai]    GET  /audit/*           — audit logs`);
  console.log(`[lovesfire-ai] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[lovesfire-ai] VIDEO_BACKEND=${process.env.VIDEO_BACKEND || 'mock'}`);
  console.log(`[lovesfire-ai] 🫁 Financial lungs: ACTIVE`);
  console.log(`[lovesfire-ai] 🧬 Governance: BBnCC + MommaSpec v1.0.0`);
  console.log(`[lovesfire-ai] 💾 Persistence: SQLite (audit + credits)`);
});

export default app;
