import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// DEPLOYMENT PREREQUISITE: Ensure FFmpeg is installed and accessible in the hosting environment for audio generation.

let cachedPath: string | null = null;

export function getFFmpegPath(): string {
  if (cachedPath) return cachedPath;

  // 1. Check if ffmpeg is on PATH
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    cachedPath = 'ffmpeg';
    return cachedPath;
  } catch { /* not on PATH */ }

  // 2. Check FFMPEG_PATH env
  const envPath = process.env.FFMPEG_PATH;
  if (envPath && fs.existsSync(envPath)) {
    cachedPath = envPath;
    return cachedPath;
  }

  // 3. Check common winget install location
  const wingetBase = path.join(
    os.homedir(),
    'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages',
  );
  if (fs.existsSync(wingetBase)) {
    try {
      const dirs = fs.readdirSync(wingetBase).filter((d) => d.startsWith('Gyan.FFmpeg'));
      for (const dir of dirs) {
        const binDir = path.join(wingetBase, dir);
        const candidates = findFileRecursive(binDir, 'ffmpeg.exe', 3);
        if (candidates.length > 0) {
          cachedPath = candidates[0];
          console.log(`[ffmpeg] Resolved via winget: ${cachedPath}`);
          return cachedPath;
        }
      }
    } catch { /* ignore */ }
  }

  throw new Error(
    'ffmpeg not found. Install it (winget install Gyan.FFmpeg) or set FFMPEG_PATH env variable.',
  );
}

function findFileRecursive(dir: string, filename: string, maxDepth: number): string[] {
  if (maxDepth <= 0) return [];
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) {
        results.push(fullPath);
      } else if (entry.isDirectory()) {
        results.push(...findFileRecursive(fullPath, filename, maxDepth - 1));
      }
    }
  } catch { /* permission denied etc */ }
  return results;
}
