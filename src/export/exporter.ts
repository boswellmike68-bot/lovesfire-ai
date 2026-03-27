import fs from 'fs';

export async function exportFinal(videoPath: string): Promise<Buffer> {
  console.log(`[exporter] Reading final video: ${videoPath}`);
  const buffer = fs.readFileSync(videoPath);
  return buffer;
}
