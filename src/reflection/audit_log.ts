/**
 * Audit Log — The Reflection facade.
 *
 * High-level API for recording governance events. Wraps AuditStore
 * with domain-specific methods that BBnCC engine and GovernedQueue
 * call directly.
 *
 * Every birth, rejection, state transition, and render completion
 * is persisted here. History survives server restarts.
 */

import { AuditStore, AuditEventType, BirthCert, RenderStat } from './audit_store';
import { BozitiveManifest } from '../governance/bozitive_manifest';
import { hashManifest } from '../utils/manifest_hash';

// ---------------------------------------------------------------------------
// Singleton Store
// ---------------------------------------------------------------------------

let _store: AuditStore | null = null;

function getStore(): AuditStore {
  if (!_store) {
    _store = new AuditStore();
  }
  return _store;
}

/**
 * Initialize with a custom DB path (used in tests).
 * Must be called before any other audit_log function.
 */
export function initAuditLog(dbPath?: string): AuditStore {
  if (_store) _store.close();
  _store = new AuditStore(dbPath);
  return _store;
}

/**
 * Get the current store instance (for query endpoints).
 */
export function getAuditStore(): AuditStore {
  return getStore();
}

// ---------------------------------------------------------------------------
// BBnCC Events
// ---------------------------------------------------------------------------

/** Record a successful BBAI intake */
export function logIntakeAccepted(
  manifestHash: string,
  governanceStamp: string,
  contentFlag: string,
  capabilityCount: number,
) {
  const store = getStore();
  store.logEvent({
    eventType: 'intake_accepted',
    manifestHash,
    governanceStamp,
    details: JSON.stringify({ contentFlag, capabilityCount }),
    createdAt: new Date().toISOString(),
  });
}

/** Record a rejected BBAI intake */
export function logIntakeRejected(
  reason: string,
  governanceStamp: string,
) {
  const store = getStore();
  store.logEvent({
    eventType: 'intake_rejected',
    governanceStamp,
    details: JSON.stringify({ reason }),
    createdAt: new Date().toISOString(),
  });
}

/** Record a successful CCAI alignment */
export function logAlignmentPassed(
  manifestHash: string,
  governanceStamp: string,
  adjustmentCount: number,
) {
  const store = getStore();
  store.logEvent({
    eventType: 'alignment_passed',
    manifestHash,
    governanceStamp,
    details: JSON.stringify({ adjustmentCount }),
    createdAt: new Date().toISOString(),
  });
}

/** Record a rejected CCAI alignment */
export function logAlignmentRejected(
  reason: string,
  governanceStamp: string,
) {
  const store = getStore();
  store.logEvent({
    eventType: 'alignment_rejected',
    governanceStamp,
    details: JSON.stringify({ reason }),
    createdAt: new Date().toISOString(),
  });
}

/** Record a Bozitive birth — saves the full birth certificate */
export function logBirth(jobId: string, manifest: BozitiveManifest) {
  const store = getStore();
  const lineage = manifest.lineage;
  const manifestHash = hashManifest(manifest);

  store.logEvent({
    eventType: 'bozitive_born',
    jobId,
    manifestHash,
    governanceStamp: lineage.governanceStamp,
    details: JSON.stringify({ sceneCount: manifest.scenes.length, specVersion: lineage.specVersion }),
    createdAt: new Date().toISOString(),
  });

  store.saveBirthCert({
    jobId,
    manifestHash,
    governanceStamp: lineage.governanceStamp,
    specVersion: lineage.specVersion,
    sceneCount: manifest.scenes.length,
    contentFlag: lineage.intake.contentFlag,
    capabilities: JSON.stringify(lineage.intake.capabilities),
    intakeWarnings: JSON.stringify(lineage.intake.warnings),
    alignmentAdjustments: JSON.stringify(lineage.alignment.adjustments),
    alignmentWarnings: JSON.stringify(lineage.alignment.warnings),
    bornAt: lineage.bornAt.toISOString(),
  });
}

// ---------------------------------------------------------------------------
// GovernedQueue Events
// ---------------------------------------------------------------------------

/** Record job queued */
export function logJobQueued(jobId: string, manifestHash: string) {
  const store = getStore();
  store.logEvent({
    eventType: 'job_queued',
    jobId,
    manifestHash,
    details: '',
    createdAt: new Date().toISOString(),
  });
}

/** Record a job state transition */
export function logJobTransition(jobId: string, from: string, to: string) {
  const store = getStore();
  store.logEvent({
    eventType: 'job_transition',
    jobId,
    details: JSON.stringify({ from, to }),
    createdAt: new Date().toISOString(),
  });
}

/** Record job completed — saves render stats */
export function logJobCompleted(
  jobId: string,
  manifestHash: string,
  sceneCount: number,
  totalDurationSeconds: number,
  renderTimeMs: number,
  fileSizeBytes: number,
  fromCache: boolean,
) {
  const store = getStore();
  store.logEvent({
    eventType: fromCache ? 'cache_hit' : 'job_completed',
    jobId,
    manifestHash,
    details: JSON.stringify({ renderTimeMs, fileSizeBytes, fromCache }),
    createdAt: new Date().toISOString(),
  });

  store.saveRenderStat({
    jobId,
    manifestHash,
    sceneCount,
    totalDurationSeconds,
    renderTimeMs,
    fileSizeBytes,
    fromCache,
    completedAt: new Date().toISOString(),
  });
}

/** Record job failed */
export function logJobFailed(jobId: string, error: string) {
  const store = getStore();
  store.logEvent({
    eventType: 'job_failed',
    jobId,
    details: JSON.stringify({ error }),
    createdAt: new Date().toISOString(),
  });
}

/** Record job timeout */
export function logJobTimeout(jobId: string) {
  const store = getStore();
  store.logEvent({
    eventType: 'job_timeout',
    jobId,
    details: '',
    createdAt: new Date().toISOString(),
  });
}
