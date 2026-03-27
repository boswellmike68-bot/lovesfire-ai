import { buildFilters, buildFFmpegArgs, escapeDrawtext } from '../generate/filter_builder';
import { PlannedShot } from '../types';

function makeShot(overrides: Partial<PlannedShot> = {}): PlannedShot {
  return {
    sceneId: 1,
    prompt: 'Vertical cinematic video, 9:16, A quiet scene',
    durationSeconds: 5,
    aspectRatio: '9:16',
    ...overrides,
  };
}

// --- escapeDrawtext ---

function testEscapeColons() {
  const result = escapeDrawtext('key:value:pair');
  console.assert(result === 'key\\:value\\:pair', `escapeDrawtext colons failed: got "${result}"`);
}

function testEscapeBackslashes() {
  const result = escapeDrawtext('path\\to\\file');
  console.assert(result === 'path\\\\to\\\\file', `escapeDrawtext backslashes failed: got "${result}"`);
}

function testEscapeApostrophes() {
  const result = escapeDrawtext("it's here");
  console.assert(!result.includes("'"), `escapeDrawtext apostrophe failed: got "${result}"`);
}

// --- buildFilters ---

function testGlitchDetection() {
  const glitchShot = makeShot({ prompt: 'Vertical cinematic video, 9:16, High-energy glitch transition' });
  const normalShot = makeShot({ prompt: 'Vertical cinematic video, 9:16, A quiet scene' });

  const glitchResult = buildFilters(glitchShot);
  const normalResult = buildFilters(normalShot);

  console.assert(glitchResult.isGlitch === true, 'Glitch shot should be detected as glitch');
  console.assert(normalResult.isGlitch === false, 'Normal shot should not be glitch');

  console.assert(glitchResult.effectFilters.includes('noise='), 'Glitch filters should include noise');
  console.assert(!normalResult.effectFilters.includes('noise='), 'Normal filters should not include noise');
}

function testLutAutoDetection() {
  const warmShot = makeShot({ prompt: 'golden sunset glow', sceneId: 1 });
  const coldShot = makeShot({ prompt: 'icy cold memory fade', sceneId: 2 });

  const warmResult = buildFilters(warmShot);
  const coldResult = buildFilters(coldShot);

  console.assert(warmResult.lutPreset.name === 'dream_warmth', `Expected dream_warmth, got ${warmResult.lutPreset.name}`);
  console.assert(coldResult.lutPreset.name === 'cold_memory', `Expected cold_memory, got ${coldResult.lutPreset.name}`);
}

function testLutExplicitOverride() {
  const shot = makeShot({ lut: 'neon_pulse', prompt: 'golden sunset' });
  const result = buildFilters(shot);
  console.assert(result.lutPreset.name === 'neon_pulse', `Explicit LUT should override auto-detect, got ${result.lutPreset.name}`);
}

function testLutRotation() {
  const shot1 = makeShot({ sceneId: 1, prompt: 'abstract shapes' });
  const shot2 = makeShot({ sceneId: 2, prompt: 'abstract shapes' });
  const r1 = buildFilters(shot1);
  const r2 = buildFilters(shot2);
  console.assert(r1.lutPreset.name !== r2.lutPreset.name, `Scenes with no keyword match should rotate LUTs: ${r1.lutPreset.name} vs ${r2.lutPreset.name}`);
  console.assert(r1.color !== r2.color, `Different LUTs should produce different bgColors: ${r1.color} vs ${r2.color}`);
}

function testMotionAutoDetection() {
  const zoomShot = makeShot({ prompt: 'slow push in on face' });
  const shakeShot = makeShot({ prompt: 'handheld shaky camera' });

  const zoomResult = buildFilters(zoomShot);
  const shakeResult = buildFilters(shakeShot);

  console.assert(zoomResult.motionCurve?.name === 'zoom_in', `Expected zoom_in, got ${zoomResult.motionCurve?.name}`);
  console.assert(shakeResult.motionCurve?.name === 'jitter', `Expected jitter, got ${shakeResult.motionCurve?.name}`);
}

function testMotionNone() {
  const shot = makeShot({ motion: 'none' });
  const result = buildFilters(shot);
  console.assert(result.motionCurve === null, 'motion=none should produce null motionCurve');
  console.assert(!result.vf.includes('zoompan'), 'vf should not contain zoompan when motion=none');
}

function testMotionInVf() {
  const shot = makeShot({ motion: 'drift' });
  const result = buildFilters(shot);
  console.assert(result.motionCurve?.name === 'drift', `Expected drift curve, got ${result.motionCurve?.name}`);
  console.assert(result.vf.includes('zoompan='), 'vf should contain zoompan for drift motion');
}

function testVfContainsDrawtext() {
  const result = buildFilters(makeShot());
  console.assert(result.vf.includes('drawtext='), 'vf should contain drawtext filter');
  console.assert(result.vf.includes('fontcolor=white'), 'drawtext should set white fontcolor');
}

function testVfContainsLutFilters() {
  const result = buildFilters(makeShot());
  console.assert(result.vf.includes('eq='), 'vf should contain eq filter from LUT preset');
  console.assert(result.vf.includes('colorbalance='), 'vf should contain colorbalance from LUT preset');
}

// --- buildFFmpegArgs ---

function testArgsContainExpectedFlags() {
  const { executable, args } = buildFFmpegArgs(makeShot({ motion: 'none' }), '/tmp/out.mp4', 'ffmpeg');

  console.assert(executable === 'ffmpeg', `executable should be ffmpeg, got ${executable}`);
  console.assert(args.includes('-y'), 'args should include -y (overwrite)');
  console.assert(args.includes('-vf'), 'args should include -vf');
  console.assert(args.includes('-shortest'), 'args should include -shortest');
  console.assert(args[args.length - 1] === '/tmp/out.mp4', 'last arg should be output path');
}

function testArgsDurationMatchesShot() {
  const shot = makeShot({ durationSeconds: 7 });
  const { args } = buildFFmpegArgs(shot, '/tmp/out.mp4');

  const tIdx = args.indexOf('-t');
  console.assert(tIdx !== -1, 'args should include -t');
  console.assert(args[tIdx + 1] === '7', `duration should be 7, got ${args[tIdx + 1]}`);
}

function testArgsOversizedSourceForMotion() {
  const motionShot = makeShot({ motion: 'zoom_in' });
  const staticShot = makeShot({ motion: 'none' });

  const { args: motionArgs } = buildFFmpegArgs(motionShot, '/tmp/out.mp4');
  const { args: staticArgs } = buildFFmpegArgs(staticShot, '/tmp/out.mp4');

  const motionInput = motionArgs.find((a) => a.startsWith('color=c='));
  const staticInput = staticArgs.find((a) => a.startsWith('color=c='));

  console.assert(motionInput?.includes('1296x2304'), `Motion source should be oversized (1296x2304), got: ${motionInput}`);
  console.assert(staticInput?.includes('1080x1920'), `Static source should be standard (1080x1920), got: ${staticInput}`);
}

function testArgsNoShellMetacharacters() {
  const { args } = buildFFmpegArgs(makeShot(), '/tmp/out.mp4');
  for (const arg of args) {
    console.assert(!arg.includes('"'), `arg should not contain double quotes: ${arg}`);
  }
}

// --- Run all tests ---

const tests = [
  testEscapeColons,
  testEscapeBackslashes,
  testEscapeApostrophes,
  testGlitchDetection,
  testLutAutoDetection,
  testLutExplicitOverride,
  testLutRotation,
  testMotionAutoDetection,
  testMotionNone,
  testMotionInVf,
  testVfContainsDrawtext,
  testVfContainsLutFilters,
  testArgsContainExpectedFlags,
  testArgsDurationMatchesShot,
  testArgsOversizedSourceForMotion,
  testArgsNoShellMetacharacters,
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

console.log(`\nfilter_builder: ${passed} passed, ${failed} failed out of ${tests.length}`);
if (failed > 0) process.exit(1);
