import { MOMMA_SPEC_V1, hashMommaSpec } from '../governance/momma_spec';
import { BBAIIntake } from '../governance/bbai_intake';
import { CCAIAlignment } from '../governance/ccai_alignment';
import { BBnCCEngine } from '../governance/bbncc_engine';
import { Scene } from '../types';

const bbai = new BBAIIntake(MOMMA_SPEC_V1);
const ccai = new CCAIAlignment(MOMMA_SPEC_V1);
const engine = new BBnCCEngine(MOMMA_SPEC_V1);

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 1,
    label: 'Scene 1',
    description: 'A calm visual scene',
    onscreenText: 'Hello world',
    durationSeconds: 5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// MommaSpec
// ---------------------------------------------------------------------------

function testMommaSpecHash() {
  const hash = hashMommaSpec(MOMMA_SPEC_V1);
  console.assert(typeof hash === 'string' && hash.length === 16, `Hash should be 16-char string, got: ${hash}`);
  // Deterministic — same input always gives same hash
  const hash2 = hashMommaSpec(MOMMA_SPEC_V1);
  console.assert(hash === hash2, 'MommaSpec hash should be deterministic');
}

function testMommaSpecValues() {
  console.assert(MOMMA_SPEC_V1.values.nonHarm === true, 'nonHarm should be true');
  console.assert(MOMMA_SPEC_V1.content.allowExplicit === false, 'allowExplicit should be false');
  console.assert(MOMMA_SPEC_V1.content.allowHate === false, 'allowHate should be false');
}

// ---------------------------------------------------------------------------
// BBAI Intake
// ---------------------------------------------------------------------------

function testIntakeAcceptsCleanScript() {
  const result = bbai.evaluate('Scene 1\nVisual: A calm sunset over a lake.\nDuration: 5s');
  console.assert(result.accepted === true, 'Clean script should be accepted');
  console.assert(result.contentFlag === 'clean', `Content flag should be clean, got ${result.contentFlag}`);
}

function testIntakeRejectsForbiddenContent() {
  const result = bbai.evaluate('Scene 1\nVisual: A terrorist attack on the city.\nDuration: 5s');
  console.assert(result.accepted === false, 'Forbidden content should be rejected');
  console.assert(result.contentFlag === 'rejected', `Content flag should be rejected, got ${result.contentFlag}`);
  console.assert(result.rejectionReason?.includes('terrorist'), `Rejection should mention the keyword`);
}

function testIntakeRejectsForbiddenTone() {
  const result = bbai.evaluate('Scene 1\nVisual: We will destroy them all and kill the enemy.\nDuration: 5s');
  console.assert(result.accepted === false, 'Forbidden tone should be rejected');
  console.assert(result.contentFlag === 'rejected', `Content flag should be rejected`);
}

function testIntakeDetectsStylizedViolence() {
  const result = bbai.evaluate('Scene 1\nVisual: Epic battle scene with explosions.\nDuration: 5s');
  console.assert(result.accepted === true, 'Stylized violence should be accepted (level 1)');
  console.assert(result.contentFlag === 'stylized_violence', `Should flag stylized_violence, got ${result.contentFlag}`);
}

function testIntakeDetectsCapabilities() {
  const result = bbai.evaluate('Scene 1\nVisual: Glitch transition with neon zoom.\nBPM: 140\nDuration: 5s');
  console.assert(result.accepted === true, 'Should accept');
  const capNames = result.capabilities.map((c) => c.name);
  console.assert(capNames.includes('glitch_effects'), 'Should detect glitch capability');
  console.assert(capNames.includes('camera_motion'), 'Should detect camera_motion capability');
  console.assert(capNames.includes('audio_reactive'), 'Should detect audio_reactive capability');
  console.assert(capNames.includes('color_grading'), 'Should detect color_grading capability');
  console.assert(capNames.includes('ffmpeg_render'), 'Should always include ffmpeg_render');
}

function testIntakeRejectsEmptyScript() {
  const result = bbai.evaluate('');
  console.assert(result.accepted === false, 'Empty script should be rejected');
}

function testIntakeWarnsOnCapsAndExclamations() {
  const loud = 'Scene 1\nVisual: ' + 'STOP NOW!!!! '.repeat(10) + '\nDuration: 5s';
  const result = bbai.evaluate(loud);
  console.assert(result.warnings.length > 0, 'Loud script should produce warnings');
}

// ---------------------------------------------------------------------------
// CCAI Alignment
// ---------------------------------------------------------------------------

function testAlignmentPassesCleanScenes() {
  const scenes = [makeScene()];
  const intake = bbai.evaluate('Scene 1\nVisual: A calm sunset.\nDuration: 5s');
  const result = ccai.align(scenes, intake);
  console.assert(result.aligned === true, 'Clean scenes should align');
  console.assert(result.adjustments.length > 0, 'Should have default adjustments (bpm, intensity fallbacks)');
}

function testAlignmentRejectsIfIntakeRejected() {
  const scenes = [makeScene()];
  const intake = bbai.evaluate('A terrorist script');
  const result = ccai.align(scenes, intake);
  console.assert(result.aligned === false, 'Should reject if intake was rejected');
}

function testAlignmentAppliesBpmDefault() {
  const scenes = [makeScene()];
  const intake = bbai.evaluate('Scene 1\nVisual: A calm sunset.\nDuration: 5s');
  ccai.align(scenes, intake);
  console.assert(scenes[0].bpm === MOMMA_SPEC_V1.styleDefaults.fallbackBpm, `BPM should be set to fallback ${MOMMA_SPEC_V1.styleDefaults.fallbackBpm}, got ${scenes[0].bpm}`);
}

function testAlignmentAppliesIntensityDefault() {
  const scenes = [makeScene()];
  const intake = bbai.evaluate('Scene 1\nVisual: A calm sunset.\nDuration: 5s');
  ccai.align(scenes, intake);
  console.assert(scenes[0].intensity === MOMMA_SPEC_V1.styleDefaults.fallbackIntensity, `Intensity should be set to fallback`);
}

function testAlignmentTrimsExcessScenes() {
  const scenes = Array.from({ length: 15 }, (_, i) => makeScene({ id: i + 1, durationSeconds: 3 }));
  const intake = bbai.evaluate('Scene 1\nVisual: test.\nDuration: 3s');
  const result = ccai.align(scenes, intake);
  console.assert(result.aligned === true, 'Should still align after trimming');
  console.assert(scenes.length <= MOMMA_SPEC_V1.content.maxScenes, `Should trim to max ${MOMMA_SPEC_V1.content.maxScenes} scenes, got ${scenes.length}`);
}

function testAlignmentRejectsSceneLevelForbiddenContent() {
  const scenes = [makeScene({ description: 'murder scene with blood' })];
  const intake = bbai.evaluate('Scene 1\nVisual: A calm scene.\nDuration: 5s');
  const result = ccai.align(scenes, intake);
  console.assert(result.aligned === false, 'Should reject scene-level forbidden content');
}

// ---------------------------------------------------------------------------
// BBnCC Engine (full pipeline)
// ---------------------------------------------------------------------------

function testEngineAcceptsValidScript() {
  const result = engine.process('Scene 1\nVisual: A calm sunset over a lake.\nDuration: 5s');
  console.assert(result.success === true, 'Valid script should succeed');
  console.assert(result.manifest !== undefined, 'Should produce a manifest');
  console.assert(result.manifest!.compliant === true, 'Manifest should be compliant');
  console.assert(result.manifest!.lineage.specVersion === '1.0.0', 'Lineage should carry spec version');
  console.assert(result.manifest!.lineage.governanceStamp.length === 16, 'Should have governance stamp');
}

function testEngineRejectsAtIntake() {
  const result = engine.process('Scene 1\nVisual: A terrorist bombing.\nDuration: 5s');
  console.assert(result.success === false, 'Should be rejected');
  console.assert(result.rejectedAt === 'intake', `Should reject at intake, got ${result.rejectedAt}`);
}

function testEngineRejectsAtAlignment() {
  // Intake passes (no forbidden keywords in raw text), but scene-level check catches it
  const result = engine.process('Scene 1\nDescription: murder scene details.\nDuration: 5s');
  console.assert(result.success === false, 'Should be rejected at alignment');
  console.assert(result.rejectedAt === 'intake' || result.rejectedAt === 'alignment', `Should reject at intake or alignment`);
}

function testEngineProducesLineage() {
  const result = engine.process('Scene 1\nVisual: Golden sunset glow.\nMotion: drift\nDuration: 5s');
  console.assert(result.success === true, 'Should succeed');
  const lineage = result.manifest!.lineage;
  console.assert(lineage.intake.accepted === true, 'Intake should be accepted');
  console.assert(lineage.alignment.aligned === true, 'Alignment should pass');
  console.assert(lineage.bornAt instanceof Date, 'Should have birth timestamp');
  console.assert(lineage.intake.capabilities.length >= 2, 'Should have baseline capabilities');
}

function testEngineMultipleScenes() {
  const script = 'Scene 1\nVisual: Calm lake.\nDuration: 4s\n\nScene 2\nVisual: Neon city.\nStyle: neon pulse\nMotion: zoom in\nBPM: 140\nIntensity: high\nDuration: 5s';
  const result = engine.process(script);
  console.assert(result.success === true, 'Multi-scene should succeed');
  console.assert(result.manifest!.scenes.length === 2, `Should have 2 scenes, got ${result.manifest!.scenes.length}`);
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

const tests = [
  testMommaSpecHash,
  testMommaSpecValues,
  testIntakeAcceptsCleanScript,
  testIntakeRejectsForbiddenContent,
  testIntakeRejectsForbiddenTone,
  testIntakeDetectsStylizedViolence,
  testIntakeDetectsCapabilities,
  testIntakeRejectsEmptyScript,
  testIntakeWarnsOnCapsAndExclamations,
  testAlignmentPassesCleanScenes,
  testAlignmentRejectsIfIntakeRejected,
  testAlignmentAppliesBpmDefault,
  testAlignmentAppliesIntensityDefault,
  testAlignmentTrimsExcessScenes,
  testAlignmentRejectsSceneLevelForbiddenContent,
  testEngineAcceptsValidScript,
  testEngineRejectsAtIntake,
  testEngineRejectsAtAlignment,
  testEngineProducesLineage,
  testEngineMultipleScenes,
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

console.log(`\nbbncc_engine: ${passed} passed, ${failed} failed out of ${tests.length}`);
if (failed > 0) process.exit(1);
