import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { GeneratedClip } from '../types';
import { getFFmpegPath } from '../utils/ffmpeg_path';

export async function composeTimeline(clips: GeneratedClip[]): Promise<string> {
  if (clips.length === 0) {
    throw new Error('No clips to compose.');
  }

  const sorted = [...clips].sort((a, b) => a.sceneId - b.sceneId);
  const outputDir = path.join(os.tmpdir(), 'lovesfire-ai');
  const concatFile = path.join(outputDir, `concat_${uuidv4().slice(0, 8)}.txt`);
  const outputFile = path.join(outputDir, `timeline_${uuidv4().slice(0, 8)}.mp4`);

  const concatContent = sorted
    .map((clip) => `file '${clip.filePath.replace(/\\/g, '/')}'`)
    .join('\n');
  fs.writeFileSync(concatFile, concatContent, 'utf-8');

  console.log(`[timeline_compositor] Composing ${sorted.length} clips into timeline...`);

  const ffmpeg = getFFmpegPath();

  const cmd = [
    `"${ffmpeg}"`, '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', `"${concatFile}"`,
    '-vf', '"scale=1080:1920"',
    '-r', '30',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    `"${outputFile}"`,
  ].join(' ');

  execSync(cmd, { stdio: 'pipe' });
  console.log(`[timeline_compositor] Timeline composed: ${outputFile}`);

  fs.unlinkSync(concatFile);

  return outputFile;
}
