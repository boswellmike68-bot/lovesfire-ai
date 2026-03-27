import crypto from 'crypto';
import { SceneManifest } from '../validate/scene_validator';

/**
 * Produce a deterministic SHA-256 hash of a render manifest.
 * Two identical scripts will always produce the same hash,
 * enabling cache lookups and reproducibility tracking.
 */
export function hashManifest(manifest: SceneManifest): string {
  const canonical = {
    scenes: manifest.scenes.map((s) => ({
      id: s.id,
      description: s.description,
      onscreenText: s.onscreenText,
      durationSeconds: s.durationSeconds,
    })),
  };
  const json = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
}
