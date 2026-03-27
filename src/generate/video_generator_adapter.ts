import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { PlannedShot, GeneratedClip, VideoGenerator } from '../types';
import { getFFmpegPath } from '../utils/ffmpeg_path';
import { buildFFmpegArgs, buildFilters } from './filter_builder';

export class MockVideoGenerator implements VideoGenerator {
  private dryRun: boolean;

  constructor(dryRun?: boolean) {
    this.dryRun = dryRun ?? (process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true');
  }

  async generate(shot: PlannedShot): Promise<GeneratedClip> {
    const outputDir = path.join(os.tmpdir(), 'lovesfire-ai');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = `scene_${shot.sceneId}_${uuidv4().slice(0, 8)}.mp4`;
    const filePath = path.join(outputDir, filename);

    const ffmpeg = getFFmpegPath();
    const { executable, args } = buildFFmpegArgs(shot, filePath, ffmpeg);
    const { isGlitch } = buildFilters(shot);

    if (this.dryRun) {
      console.log(`[mock_generator] DRY RUN Scene ${shot.sceneId} (${shot.durationSeconds}s, glitch=${isGlitch})`);
      console.log(`[mock_generator]   ${executable} ${args.join(' ')}`);
      return {
        sceneId: shot.sceneId,
        filePath: `(dry-run) ${filePath}`,
        durationSeconds: shot.durationSeconds,
      };
    }

    console.log(`[mock_generator] Generating placeholder for Scene ${shot.sceneId} (${shot.durationSeconds}s, glitch=${isGlitch})`);

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        execFileSync(executable, args, { stdio: 'pipe' });
        break;
      } catch (err: any) {
        if (attempt === maxRetries) {
          throw new Error(`FFmpeg failed after ${maxRetries} attempts for Scene ${shot.sceneId}: ${err.message}`);
        }
        const delayMs = attempt * 500;
        console.log(`[mock_generator] FFmpeg attempt ${attempt}/${maxRetries} failed for Scene ${shot.sceneId}, retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return {
      sceneId: shot.sceneId,
      filePath,
      durationSeconds: shot.durationSeconds,
    };
  }
}

export function createVideoGenerator(): VideoGenerator {
  const backend = process.env.VIDEO_BACKEND || 'mock';

  switch (backend) {
    case 'mock':
      return new MockVideoGenerator();
    // Future: case 'pika': return new PikaGenerator();
    // Future: case 'runway': return new RunwayGenerator();
    default:
      console.log(`[video_generator] Unknown backend "${backend}", falling back to mock.`);
      return new MockVideoGenerator();
  }
}
