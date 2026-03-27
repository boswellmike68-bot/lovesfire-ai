import { Scene, LutPresetName, MotionCurveName, AudioIntensity } from '../types';

const MAX_SCENES = 10;
const DEFAULT_DURATION = 5;
const FALLBACK_DURATION = 8;
const ONSCREEN_TEXT_MAX = 80;

export function parseScenes(rawScript: string): Scene[] {
  if (!rawScript || rawScript.trim().length === 0) {
    throw new Error('Script is empty. Provide at least one scene.');
  }

  const sceneHeaderPattern = /^Scene\s+\d+/i;
  const lines = rawScript.split('\n');

  const sceneBlocks: string[][] = [];
  let currentBlock: string[] | null = null;

  for (const line of lines) {
    if (sceneHeaderPattern.test(line.trim())) {
      if (currentBlock) {
        sceneBlocks.push(currentBlock);
      }
      currentBlock = [line];
    } else if (currentBlock) {
      currentBlock.push(line);
    }
  }
  if (currentBlock) {
    sceneBlocks.push(currentBlock);
  }

  if (sceneBlocks.length === 0) {
    console.log('[scene_parser] No scene headers found. Treating entire script as one scene.');
    return [
      {
        id: 1,
        label: 'Scene 1',
        description: rawScript.trim().substring(0, 200),
        onscreenText: rawScript.trim().substring(0, ONSCREEN_TEXT_MAX),
        durationSeconds: FALLBACK_DURATION,
      },
    ];
  }

  const scenes: Scene[] = [];

  for (let i = 0; i < Math.min(sceneBlocks.length, MAX_SCENES); i++) {
    const block = sceneBlocks[i];
    const id = i + 1;

    const bodyLines = block.slice(1).map((l) => l.trim()).filter((l) => l.length > 0);

    const description = extractDescription(bodyLines);
    const onscreenText = extractOnscreenText(bodyLines, description);
    const durationSeconds = extractDuration(block[0], bodyLines) || DEFAULT_DURATION;
    const lut = extractStyle(bodyLines);
    const motion = extractMotion(bodyLines);
    const bpm = extractBpm(bodyLines);
    const intensity = extractIntensity(bodyLines);

    scenes.push({
      id,
      label: `Scene ${id}`,
      description,
      onscreenText,
      durationSeconds,
      ...(lut && { lut }),
      ...(motion && { motion }),
      ...(bpm && { bpm }),
      ...(intensity && { intensity }),
    });
  }

  if (scenes.length === 0) {
    throw new Error('Parsing yielded 0 scenes. Check script format.');
  }

  return scenes;
}

function extractDescription(bodyLines: string[]): string {
  const descLine = bodyLines.find((l) =>
    l.toLowerCase().startsWith('description:') || l.toLowerCase().startsWith('visual:')
  );
  if (descLine) {
    return descLine.replace(/^(?:description|visual):\s*/i, '').trim();
  }

  for (const line of bodyLines) {
    if (!line.toLowerCase().startsWith('text:') && line.length > 0) {
      return line;
    }
  }

  return 'Visual scene';
}

function extractOnscreenText(bodyLines: string[], description: string): string {
  const textLine = bodyLines.find((l) =>
    l.toLowerCase().startsWith('text:') || l.toLowerCase().startsWith('audio:') || l.toLowerCase().startsWith('narration:')
  );
  if (textLine) {
    return textLine.replace(/^(?:text|audio|narration):\s*/i, '').replace(/^[“""]|[""]$/g, '').trim();
  }

  const quotedLine = bodyLines.find((l) => /^[""].*[""]$/.test(l));
  if (quotedLine) {
    return quotedLine.replace(/^[""]|[""]$/g, '').trim();
  }

  if (description.length <= ONSCREEN_TEXT_MAX) {
    return description;
  }
  return description.substring(0, ONSCREEN_TEXT_MAX).trim() + '…';
}

const VALID_INTENSITIES: AudioIntensity[] = ['low', 'medium', 'high'];

function extractBpm(bodyLines: string[]): number | undefined {
  const line = bodyLines.find((l) => l.toLowerCase().startsWith('bpm:'));
  if (!line) return undefined;
  const val = parseInt(line.replace(/^bpm:\s*/i, '').trim(), 10);
  if (isNaN(val) || val < 40 || val > 220) return undefined;
  return val;
}

function extractIntensity(bodyLines: string[]): AudioIntensity | undefined {
  const line = bodyLines.find((l) => l.toLowerCase().startsWith('intensity:'));
  if (!line) return undefined;
  const raw = line.replace(/^intensity:\s*/i, '').trim().toLowerCase();
  if (VALID_INTENSITIES.includes(raw as AudioIntensity)) return raw as AudioIntensity;
  return undefined;
}

const VALID_LUTS: LutPresetName[] = ['neon_pulse', 'dream_warmth', 'cold_memory', 'analog_film', 'cyber_fade', 'auto'];
const VALID_MOTIONS: MotionCurveName[] = ['drift', 'zoom_in', 'zoom_out', 'jitter', 'parallax', 'ease_in', 'auto', 'none'];

function extractStyle(bodyLines: string[]): LutPresetName | undefined {
  const line = bodyLines.find((l) => l.toLowerCase().startsWith('style:'));
  if (!line) return undefined;
  const raw = line.replace(/^style:\s*/i, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (VALID_LUTS.includes(raw as LutPresetName)) return raw as LutPresetName;
  return 'auto';
}

function extractMotion(bodyLines: string[]): MotionCurveName | undefined {
  const line = bodyLines.find((l) => l.toLowerCase().startsWith('motion:'));
  if (!line) return undefined;
  const raw = line.replace(/^motion:\s*/i, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (VALID_MOTIONS.includes(raw as MotionCurveName)) return raw as MotionCurveName;
  return 'auto';
}

function extractDuration(headerLine: string, bodyLines: string[]): number | null {
  const allText = headerLine + ' ' + bodyLines.join(' ');

  const rangeMatch = allText.match(/\((\d+)[–\-](\d+)s\)/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    return end - start;
  }

  const singleMatch = allText.match(/\((\d+)s\)/);
  if (singleMatch) {
    return parseInt(singleMatch[1], 10);
  }

  // Standalone "Duration: 5s" or "Duration: 5" line
  const durationLineMatch = allText.match(/Duration\s*:\s*(\d+)\s*s?/i);
  if (durationLineMatch) {
    return parseInt(durationLineMatch[1], 10);
  }

  return null;
}
