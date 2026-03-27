import { Scene, PlannedShot } from '../types';

const MIN_DURATION = 3;
const MAX_DURATION = 12;

export function planShots(scenes: Scene[]): PlannedShot[] {
  return scenes.map((scene) => {
    let duration = scene.durationSeconds;
    if (duration < MIN_DURATION) duration = MIN_DURATION;
    if (duration > MAX_DURATION) duration = MAX_DURATION;

    return {
      sceneId: scene.id,
      prompt: `Vertical cinematic video, 9:16, ${scene.description}`,
      durationSeconds: duration,
      aspectRatio: '9:16' as const,
      lut: scene.lut,
      motion: scene.motion,
      bpm: scene.bpm,
      intensity: scene.intensity,
    };
  });
}
