export type LutPresetName = 'neon_pulse' | 'dream_warmth' | 'cold_memory' | 'analog_film' | 'cyber_fade' | 'auto';
export type MotionCurveName = 'drift' | 'zoom_in' | 'zoom_out' | 'jitter' | 'parallax' | 'ease_in' | 'auto' | 'none';
export type AudioIntensity = 'low' | 'medium' | 'high';

export type Scene = {
  id: number;
  label: string;
  description: string;
  onscreenText: string;
  durationSeconds: number;
  lut?: LutPresetName;
  motion?: MotionCurveName;
  bpm?: number;
  intensity?: AudioIntensity;
};

export type PlannedShot = {
  sceneId: number;
  prompt: string;
  durationSeconds: number;
  aspectRatio: '9:16';
  lut?: LutPresetName;
  motion?: MotionCurveName;
  bpm?: number;
  intensity?: AudioIntensity;
};

export type GeneratedClip = {
  sceneId: number;
  filePath: string;
  durationSeconds: number;
};

export interface VideoGenerator {
  generate(shot: PlannedShot): Promise<GeneratedClip>;
}
