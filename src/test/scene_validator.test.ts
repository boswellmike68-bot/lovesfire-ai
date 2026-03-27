import { validateSceneManifest } from '../validate/scene_validator';
import { Scene } from '../types';

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 1,
    label: 'Scene 1',
    description: 'A calm sunset over water',
    onscreenText: 'Every era has one moment.',
    durationSeconds: 5,
    ...overrides,
  };
}

// --- Tests ---

function testValidManifest() {
  const result = validateSceneManifest([makeScene(), makeScene({ id: 2 })]);
  console.assert(result.valid === true, 'Two valid scenes should pass');
  console.assert(result.errors.length === 0, 'No errors expected');
}

function testEmptyManifest() {
  const result = validateSceneManifest([]);
  console.assert(result.valid === false, 'Empty manifest should fail');
  console.assert(result.errors.length > 0, 'Should have at least one error');
  console.assert(result.errors[0].field === 'manifest', 'Error should be on manifest field');
  console.assert(result.errors[0].code === 'EMPTY_MANIFEST', `Expected code EMPTY_MANIFEST, got ${result.errors[0].code}`);
}

function testDurationTooLow() {
  const result = validateSceneManifest([makeScene({ durationSeconds: 0 })]);
  console.assert(result.valid === false, 'Duration 0 should fail');
  console.assert(
    result.errors.some((e) => e.code === 'DURATION_TOO_LOW'),
    'Error should have code DURATION_TOO_LOW',
  );
}

function testDurationTooHigh() {
  const result = validateSceneManifest([makeScene({ durationSeconds: 60 })]);
  console.assert(result.valid === false, 'Duration 60 should fail');
  console.assert(
    result.errors.some((e) => e.field === 'durationSeconds' && e.message.includes('exceeds')),
    'Error should mention exceeding max',
  );
}

function testEmptyDescriptionWarning() {
  const result = validateSceneManifest([makeScene({ description: '' })]);
  console.assert(result.valid === true, 'Empty description is a warning, not an error');
  console.assert(
    result.warnings.some((w) => w.field === 'description' && w.message.includes('empty')),
    'Should warn about empty description',
  );
}

function testLongDescriptionWarning() {
  const longDesc = 'x'.repeat(600);
  const result = validateSceneManifest([makeScene({ description: longDesc })]);
  console.assert(result.valid === true, 'Long description is a warning');
  console.assert(
    result.warnings.some((w) => w.field === 'description' && w.message.includes('truncated')),
    'Should warn about truncation',
  );
}

function testGlitchFlagWarning() {
  const result = validateSceneManifest([
    makeScene({ description: 'High-energy glitch transition' }),
  ]);
  console.assert(
    result.warnings.some((w) => w.code === 'GLITCH_APPLIED'),
    'Should have GLITCH_APPLIED warning code',
  );
}

function testTooManyScenes() {
  const scenes = Array.from({ length: 15 }, (_, i) => makeScene({ id: i + 1 }));
  const result = validateSceneManifest(scenes);
  console.assert(result.valid === false, '15 scenes should fail (max 10)');
}

function testTotalDurationWarning() {
  const scenes = Array.from({ length: 5 }, (_, i) =>
    makeScene({ id: i + 1, durationSeconds: 28 }),
  );
  const result = validateSceneManifest(scenes);
  console.assert(result.valid === true, 'Total >120s is a warning, not an error');
  console.assert(
    result.warnings.some((w) => w.message.includes('120s')),
    'Should warn about total duration',
  );
}

function testLongOnscreenTextWarning() {
  const longText = 'y'.repeat(250);
  const result = validateSceneManifest([makeScene({ onscreenText: longText })]);
  console.assert(
    result.warnings.some((w) => w.field === 'onscreenText' && w.message.includes('overflow')),
    'Should warn about long on-screen text',
  );
}

// --- Run all tests ---

function testWarningCodesAreStrings() {
  const result = validateSceneManifest([
    makeScene({ description: '', onscreenText: 'y'.repeat(250) }),
  ]);
  for (const w of result.warnings) {
    console.assert(typeof w.code === 'string' && w.code.length > 0, `Warning code should be a non-empty string, got: ${w.code}`);
  }
}

const tests = [
  testValidManifest,
  testEmptyManifest,
  testDurationTooLow,
  testDurationTooHigh,
  testEmptyDescriptionWarning,
  testLongDescriptionWarning,
  testGlitchFlagWarning,
  testTooManyScenes,
  testTotalDurationWarning,
  testLongOnscreenTextWarning,
  testWarningCodesAreStrings,
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

console.log(`\nscene_validator: ${passed} passed, ${failed} failed out of ${tests.length}`);
if (failed > 0) process.exit(1);
