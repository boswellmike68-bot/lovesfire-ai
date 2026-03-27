import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { Scene } from '../types';
import { getFFmpegPath } from '../utils/ffmpeg_path';

export async function burnCaptions(videoPath: string, scenes: Scene[]): Promise<string> {
  const outputDir = path.join(os.tmpdir(), 'lovesfire-ai');
  const srtFile = path.join(outputDir, `captions_${uuidv4().slice(0, 8)}.srt`);
  const outputFile = path.join(outputDir, `captioned_${uuidv4().slice(0, 8)}.mp4`);

  const srtContent = generateSrt(scenes);
  fs.writeFileSync(srtFile, srtContent, 'utf-8');

  console.log(`[captions] Burning captions onto video...`);

  const srtPathEscaped = srtFile.replace(/\\/g, '/').replace(/:/g, '\\:');

  const ffmpeg = getFFmpegPath();

  const cmd = [
    `"${ffmpeg}"`, '-y',
    '-i', `"${videoPath}"`,
    '-vf', `"subtitles='${srtPathEscaped}':force_style='FontSize=24,FontName=Arial,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=80'"`,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    `"${outputFile}"`,
  ].join(' ');

  execSync(cmd, { stdio: 'pipe' });
  console.log(`[captions] Captioned video: ${outputFile}`);

  fs.unlinkSync(srtFile);

  return outputFile;
}

function generateSrt(scenes: Scene[]): string {
  const entries: string[] = [];
  let cumulativeStart = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const start = cumulativeStart;
    const end = cumulativeStart + scene.durationSeconds;

    entries.push(
      `${i + 1}`,
      `${formatSrtTime(start)} --> ${formatSrtTime(end)}`,
      scene.onscreenText,
      '',
    );

    cumulativeStart = end;
  }

  return entries.join('\n');
}

function formatSrtTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.round((totalSeconds % 1) * 1000);

  return [
    String(hours).padStart(2, '0'),
    ':',
    String(minutes).padStart(2, '0'),
    ':',
    String(seconds).padStart(2, '0'),
    ',',
    String(millis).padStart(3, '0'),
  ].join('');
}
