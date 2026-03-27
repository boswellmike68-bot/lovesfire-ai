import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { AuditStore } from '../reflection/audit_store';
import { initAuditLog, getAuditStore, logIntakeAccepted, logIntakeRejected, logAlignmentPassed, logAlignmentRejected, logBirth, logJobQueued, logJobTransition, logJobCompleted, logJobFailed, logJobTimeout } from '../reflection/audit_log';
import { BozitiveManifest } from '../governance/bozitive_manifest';

// Use a temp DB for each test run
const TEST_DB = path.join(os.tmpdir(), `lovesfire-audit-test-${Date.now()}.db`);

function cleanup() {
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.unlinkSync(TEST_DB + '-wal'); } catch {}
  try { fs.unlinkSync(TEST_DB + '-shm'); } catch {}
}

// Initialize with test DB
initAuditLog(TEST_DB);

function makeBozitiveManifest(): BozitiveManifest {
  return {
    rawScript: 'Scene 1\nVisual: Test scene.\nDuration: 5s',
    scenes: [
      { id: 1, label: 'Scene 1', description: 'Test scene', onscreenText: '', durationSeconds: 5 },
    ],
    lineage: {
      specVersion: '1.0.0',
      governanceStamp: 'abc123def456',
      intake: {
        accepted: true,
        contentFlag: 'clean',
        capabilities: [{ name: 'ffmpeg_render', required: true }],
        warnings: [],
        evaluatedAt: new Date(),
      },
      alignment: {
        aligned: true,
        adjustments: [{ sceneId: 1, field: 'bpm', from: 'undefined', to: '120', reason: 'default' }],
        warnings: [],
        evaluatedAt: new Date(),
      },
      bornAt: new Date(),
    },
    compliant: true,
  };
}

// ---------------------------------------------------------------------------
// Store Tests
// ---------------------------------------------------------------------------

function testStoreCreatesDB() {
  console.assert(fs.existsSync(TEST_DB), 'DB file should exist after init');
}

function testLogEvent() {
  const store = getAuditStore();
  const id = store.logEvent({
    eventType: 'intake_accepted',
    manifestHash: 'hash123',
    governanceStamp: 'stamp456',
    details: '{"test": true}',
    createdAt: new Date().toISOString(),
  });
  console.assert(typeof id === 'number' && id > 0, `Should return a row ID, got ${id}`);
}

function testGetEvents() {
  const store = getAuditStore();
  const events = store.getEvents({ eventType: 'intake_accepted' });
  console.assert(events.length >= 1, `Should have at least 1 intake_accepted event, got ${events.length}`);
  console.assert(events[0].eventType === 'intake_accepted', 'Event type should match filter');
}

function testSaveBirthCert() {
  const store = getAuditStore();
  const id = store.saveBirthCert({
    jobId: 'job-test-1',
    manifestHash: 'hash-birth-1',
    governanceStamp: 'stamp-1',
    specVersion: '1.0.0',
    sceneCount: 3,
    contentFlag: 'clean',
    capabilities: '["ffmpeg_render"]',
    intakeWarnings: '[]',
    alignmentAdjustments: '[]',
    alignmentWarnings: '[]',
    bornAt: new Date().toISOString(),
  });
  console.assert(id > 0, `Should return birth cert ID, got ${id}`);
}

function testGetBirthCerts() {
  const store = getAuditStore();
  const certs = store.getBirthCerts();
  console.assert(certs.length >= 1, `Should have at least 1 birth cert, got ${certs.length}`);
}

function testGetBirthCertByJobId() {
  const store = getAuditStore();
  const cert = store.getBirthCertByJobId('job-test-1');
  console.assert(cert !== undefined, 'Should find birth cert by job ID');
  console.assert(cert!.sceneCount === 3, `Scene count should be 3, got ${cert!.sceneCount}`);
  console.assert(cert!.specVersion === '1.0.0', 'Spec version should match');
}

function testSaveRenderStat() {
  const store = getAuditStore();
  const id = store.saveRenderStat({
    jobId: 'job-test-1',
    manifestHash: 'hash-render-1',
    sceneCount: 3,
    totalDurationSeconds: 15,
    renderTimeMs: 45000,
    fileSizeBytes: 10_000_000,
    fromCache: false,
    completedAt: new Date().toISOString(),
  });
  console.assert(id > 0, `Should return render stat ID, got ${id}`);
}

function testGetRenderStats() {
  const store = getAuditStore();
  const stats = store.getRenderStats();
  console.assert(stats.length >= 1, `Should have at least 1 render stat, got ${stats.length}`);
  console.assert(stats[0].fileSizeBytes === 10_000_000, 'File size should match');
}

function testGetRenderStatByJobId() {
  const store = getAuditStore();
  const stat = store.getRenderStatByJobId('job-test-1');
  console.assert(stat !== undefined, 'Should find render stat by job ID');
  console.assert(stat!.renderTimeMs === 45000, `Render time should be 45000, got ${stat!.renderTimeMs}`);
  console.assert(stat!.fromCache === false, 'Should not be from cache');
}

function testGetSummary() {
  const store = getAuditStore();
  const summary = store.getSummary();
  console.assert(summary.totalBirths >= 1, `Should have at least 1 birth, got ${summary.totalBirths}`);
  console.assert(summary.totalRenders >= 1, `Should have at least 1 render, got ${summary.totalRenders}`);
  console.assert(summary.avgRenderTimeMs > 0, `Avg render time should be > 0, got ${summary.avgRenderTimeMs}`);
}

// ---------------------------------------------------------------------------
// Facade Tests (audit_log.ts)
// ---------------------------------------------------------------------------

function testLogIntakeAccepted() {
  logIntakeAccepted('hash-facade-1', 'stamp-facade-1', 'clean', 3);
  const store = getAuditStore();
  const events = store.getEvents({ eventType: 'intake_accepted', limit: 1 });
  console.assert(events.length >= 1, 'Should log intake_accepted via facade');
}

function testLogIntakeRejected() {
  logIntakeRejected('Forbidden word', 'stamp-facade-1');
  const store = getAuditStore();
  const events = store.getEvents({ eventType: 'intake_rejected', limit: 1 });
  console.assert(events.length >= 1, 'Should log intake_rejected via facade');
  console.assert(events[0].details.includes('Forbidden word'), 'Details should contain reason');
}

function testLogBirth() {
  const manifest = makeBozitiveManifest();
  logBirth('job-facade-birth', manifest);
  const store = getAuditStore();
  const cert = store.getBirthCertByJobId('job-facade-birth');
  console.assert(cert !== undefined, 'Birth cert should be saved via facade');
  console.assert(cert!.governanceStamp === 'abc123def456', 'Stamp should match');
}

function testLogJobQueued() {
  logJobQueued('job-q-1', 'hash-q-1');
  const store = getAuditStore();
  const events = store.getEvents({ eventType: 'job_queued', limit: 1 });
  console.assert(events.length >= 1, 'Should log job_queued');
}

function testLogJobTransition() {
  logJobTransition('job-t-1', 'queued', 'planning');
  const store = getAuditStore();
  const events = store.getEvents({ eventType: 'job_transition', limit: 1 });
  console.assert(events.length >= 1, 'Should log job_transition');
  console.assert(events[0].details.includes('planning'), 'Details should contain target state');
}

function testLogJobCompleted() {
  logJobCompleted('job-c-1', 'hash-c-1', 4, 18, 120000, 30_000_000, false);
  const store = getAuditStore();
  const stat = store.getRenderStatByJobId('job-c-1');
  console.assert(stat !== undefined, 'Render stat should be saved via facade');
  console.assert(stat!.sceneCount === 4, `Scene count should be 4, got ${stat!.sceneCount}`);
}

function testLogJobCompletedFromCache() {
  logJobCompleted('job-cache-1', 'hash-cache-1', 4, 0, 0, 30_000_000, true);
  const store = getAuditStore();
  const events = store.getEvents({ eventType: 'cache_hit', limit: 1 });
  console.assert(events.length >= 1, 'Should log cache_hit event');
  const stat = store.getRenderStatByJobId('job-cache-1');
  console.assert(stat!.fromCache === true, 'Should mark as from cache');
}

function testLogJobFailed() {
  logJobFailed('job-f-1', 'FFmpeg crashed');
  const store = getAuditStore();
  const events = store.getEvents({ eventType: 'job_failed', limit: 1 });
  console.assert(events.length >= 1, 'Should log job_failed');
  console.assert(events[0].details.includes('FFmpeg crashed'), 'Details should contain error');
}

function testPersistenceAcrossInstances() {
  // Close and re-open the store to simulate server restart
  const store1 = getAuditStore();
  const summaryBefore = store1.getSummary();
  store1.close();

  // Re-init pointing to same DB file
  initAuditLog(TEST_DB);
  const store2 = getAuditStore();
  const summaryAfter = store2.getSummary();

  console.assert(summaryAfter.totalBirths === summaryBefore.totalBirths, `Births should survive restart: ${summaryBefore.totalBirths} vs ${summaryAfter.totalBirths}`);
  console.assert(summaryAfter.totalRenders === summaryBefore.totalRenders, `Renders should survive restart: ${summaryBefore.totalRenders} vs ${summaryAfter.totalRenders}`);
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

const tests = [
  testStoreCreatesDB,
  testLogEvent,
  testGetEvents,
  testSaveBirthCert,
  testGetBirthCerts,
  testGetBirthCertByJobId,
  testSaveRenderStat,
  testGetRenderStats,
  testGetRenderStatByJobId,
  testGetSummary,
  testLogIntakeAccepted,
  testLogIntakeRejected,
  testLogBirth,
  testLogJobQueued,
  testLogJobTransition,
  testLogJobCompleted,
  testLogJobCompletedFromCache,
  testLogJobFailed,
  testPersistenceAcrossInstances,
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    test();
    passed++;
    console.log(`  PASS  ${test.name}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL  ${test.name}: ${err.message}`);
  }
}

console.log(`\naudit_log: ${passed} passed, ${failed} failed out of ${tests.length}`);

// Cleanup
getAuditStore().close();
cleanup();

if (failed > 0) process.exit(1);
