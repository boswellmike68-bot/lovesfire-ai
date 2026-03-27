import { MockBeatAnalyzer } from '../audio/beat_analyzer';
import { AudioEnvelope, INTENSITY_SCALE } from '../audio/audio_envelope';
import { buildReactiveFilters } from '../generate/reactive_filters';
import { buildFilters } from '../generate/filter_builder';
import { PlannedShot } from '../types';

const analyzer = new MockBeatAnalyzer();

function makeShot(overrides: Partial<PlannedShot> = {}): PlannedShot {
  return {
    sceneId: 1,
    prompt: 'Vertical cinematic video, 9:16, A quiet scene',
    durationSeconds: 5,
    aspectRatio: '9:16',
    ...overrides,
  };
}

// --- Beat Analyzer ---

function testHighEnergyDetection() {
  const env = analyzer.analyze('High-energy glitch explosion', 5);
  console.assert(env.intensity === 'high', `Expected high intensity, got ${env.intensity}`);
  console.assert(env.bpm >= 130, `High energy BPM should be >= 130, got ${env.bpm}`);
}

function testLowEnergyDetection() {
  const env = analyzer.analyze('Calm ambient whisper', 5);
  console.assert(env.intensity === 'low', `Expected low intensity, got ${env.intensity}`);
  console.assert(env.bpm <= 90, `Low energy BPM should be <= 90, got ${env.bpm}`);
}

function testMediumDefault() {
  const env = analyzer.analyze('Abstract shapes moving', 5);
  console.assert(env.intensity === 'medium', `Expected medium intensity, got ${env.intensity}`);
}

function testBpmOverride() {
  const env = analyzer.analyze('Calm scene', 5, 160);
  console.assert(env.bpm === 160, `BPM override should be 160, got ${env.bpm}`);
  console.assert(env.intensity === 'low', `Intensity should still auto-detect as low, got ${env.intensity}`);
}

function testIntensityOverride() {
  const env = analyzer.analyze('Calm scene', 5, undefined, 'high');
  console.assert(env.intensity === 'high', `Intensity override should be high, got ${env.intensity}`);
}

function testDropDetection() {
  const withDrop = analyzer.analyze('Massive bass drop transition', 5);
  const noDrop = analyzer.analyze('Steady flowing river', 5);
  console.assert(withDrop.hasDrop === true, 'Should detect drop');
  console.assert(noDrop.hasDrop === false, 'Should not detect drop');
}

function testEnvelopeBounds() {
  const env = analyzer.analyze('Extreme bass heavy rave glitch', 3);
  console.assert(env.bassEnergy >= 0 && env.bassEnergy <= 1, `bassEnergy out of bounds: ${env.bassEnergy}`);
  console.assert(env.midEnergy >= 0 && env.midEnergy <= 1, `midEnergy out of bounds: ${env.midEnergy}`);
  console.assert(env.highEnergy >= 0 && env.highEnergy <= 1, `highEnergy out of bounds: ${env.highEnergy}`);
}

// --- Reactive Filters ---

function testReactiveFiltersNonEmpty() {
  const env: AudioEnvelope = {
    bpm: 120, intensity: 'medium', bassEnergy: 0.6, midEnergy: 0.5, highEnergy: 0.5, hasDrop: false,
  };
  const result = buildReactiveFilters(env);
  console.assert(result.filters.length > 0, 'Reactive filters should not be empty for medium intensity');
  console.assert(result.filters.includes('eq=brightness='), 'Should include brightness pulse');
}

function testReactiveVignettePulse() {
  const env: AudioEnvelope = {
    bpm: 140, intensity: 'high', bassEnergy: 0.8, midEnergy: 0.7, highEnergy: 0.6, hasDrop: false,
  };
  const result = buildReactiveFilters(env);
  console.assert(result.filters.includes('vignette='), 'High mid energy should produce vignette pulse');
  console.assert(result.summary.includes('vignette pulse'), `Summary should mention vignette pulse, got: ${result.summary}`);
}

function testReactiveHueShift() {
  const env: AudioEnvelope = {
    bpm: 120, intensity: 'medium', bassEnergy: 0.7, midEnergy: 0.3, highEnergy: 0.2, hasDrop: false,
  };
  const result = buildReactiveFilters(env);
  console.assert(result.filters.includes('hue=h='), 'Bass energy > 0.3 should produce hue shift');
}

function testReactiveNoiseOnHighEnergy() {
  const highEnv: AudioEnvelope = {
    bpm: 140, intensity: 'high', bassEnergy: 0.5, midEnergy: 0.5, highEnergy: 0.8, hasDrop: false,
  };
  const lowEnv: AudioEnvelope = {
    bpm: 80, intensity: 'low', bassEnergy: 0.2, midEnergy: 0.2, highEnergy: 0.1, hasDrop: false,
  };
  const highResult = buildReactiveFilters(highEnv);
  const lowResult = buildReactiveFilters(lowEnv);
  console.assert(highResult.filters.includes('noise='), 'High energy should include noise bursts');
  console.assert(!lowResult.filters.includes('noise='), 'Low energy should not include noise bursts');
}

function testReactiveDropFlash() {
  const env: AudioEnvelope = {
    bpm: 120, intensity: 'medium', bassEnergy: 0.5, midEnergy: 0.5, highEnergy: 0.3, hasDrop: true,
  };
  const result = buildReactiveFilters(env);
  console.assert(result.filters.includes('saturation='), 'Drop should produce saturation spike');
  console.assert(result.summary.includes('drop flash'), 'Summary should mention drop flash');
}

function testReactiveLowIntensityMinimal() {
  const env: AudioEnvelope = {
    bpm: 80, intensity: 'low', bassEnergy: 0.15, midEnergy: 0.1, highEnergy: 0.05, hasDrop: false,
  };
  const result = buildReactiveFilters(env);
  // Should still have brightness pulse (always present) but not vignette or hue
  console.assert(result.filters.includes('eq=brightness='), 'Should still have brightness pulse');
  console.assert(!result.filters.includes('vignette='), 'Low mid energy should skip vignette');
  console.assert(!result.filters.includes('hue='), 'Low bass should skip hue shift');
}

// --- Integration: reactive in full filter chain ---

function testFilterChainIncludesReactive() {
  const shot = makeShot({ prompt: 'High-energy bass drop explosion', intensity: 'high', bpm: 140 });
  const result = buildFilters(shot);
  console.assert(result.reactive.filters.length > 0, 'Reactive filters should be present');
  console.assert(result.vf.includes('eq=brightness='), 'Full vf chain should contain reactive brightness pulse');
  console.assert(result.audioEnvelope.intensity === 'high', `Envelope intensity should be high, got ${result.audioEnvelope.intensity}`);
  console.assert(result.audioEnvelope.bpm === 140, `Envelope BPM should be 140, got ${result.audioEnvelope.bpm}`);
}

function testFilterChainReactiveSummary() {
  const shot = makeShot({ prompt: 'Ambient calm dream', intensity: 'low', bpm: 80 });
  const result = buildFilters(shot);
  console.assert(result.reactive.summary.includes('brightness pulse'), `Summary should include brightness pulse, got: ${result.reactive.summary}`);
}

// --- Run all tests ---

const tests = [
  testHighEnergyDetection,
  testLowEnergyDetection,
  testMediumDefault,
  testBpmOverride,
  testIntensityOverride,
  testDropDetection,
  testEnvelopeBounds,
  testReactiveFiltersNonEmpty,
  testReactiveVignettePulse,
  testReactiveHueShift,
  testReactiveNoiseOnHighEnergy,
  testReactiveDropFlash,
  testReactiveLowIntensityMinimal,
  testFilterChainIncludesReactive,
  testFilterChainReactiveSummary,
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

console.log(`\naudio_reactive: ${passed} passed, ${failed} failed out of ${tests.length}`);
if (failed > 0) process.exit(1);
