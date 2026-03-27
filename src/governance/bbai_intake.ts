/**
 * BBAI — The Intake Agent
 *
 * First stage of the BBnCC pipeline. Receives raw script input,
 * evaluates intent, checks content safety against MommaSpec,
 * identifies required capabilities, and produces an IntakeRecord.
 *
 * BBAI doesn't birth — he prepares.
 */

import { MommaSpec } from './momma_spec';
import { IntakeRecord, IntakeCapability, ContentFlag } from './bozitive_manifest';

// ---------------------------------------------------------------------------
// Capability Detection Keywords
// ---------------------------------------------------------------------------

const CAPABILITY_KEYWORDS: [RegExp, string][] = [
  [/glitch|noise|static|distort/i, 'glitch_effects'],
  [/zoom|pan|drift|shake|jitter|parallax/i, 'camera_motion'],
  [/beat|bpm|pulse|bass|drop|rhythm/i, 'audio_reactive'],
  [/neon|cyber|analog|film|warmth|cold/i, 'color_grading'],
  [/caption|subtitle|text|overlay/i, 'text_overlay'],
  [/transition|fade|cut|wipe/i, 'transitions'],
];

// ---------------------------------------------------------------------------
// BBAI Intake Class
// ---------------------------------------------------------------------------

export class BBAIIntake {
  constructor(private spec: MommaSpec) {}

  /**
   * Evaluate raw script input and produce an IntakeRecord.
   * Pure assessment — no mutations, no side effects.
   */
  evaluate(rawScript: string): IntakeRecord {
    const warnings: string[] = [];
    const now = new Date();

    // --- Content Safety Check ---
    const contentFlag = this.checkContentSafety(rawScript);
    if (contentFlag === 'rejected') {
      const reason = this.findRejectionReason(rawScript);
      console.log(`[BBAI] Intake REJECTED — ${reason}`);
      return {
        accepted: false,
        contentFlag: 'rejected',
        capabilities: [],
        warnings: [],
        rejectionReason: reason,
        evaluatedAt: now,
      };
    }

    if (contentFlag === 'stylized_violence') {
      warnings.push('Content contains stylized violence references — within MommaSpec tolerance.');
    }
    if (contentFlag === 'mild_language') {
      warnings.push('Content contains mild language — within MommaSpec tolerance.');
    }

    // --- Tone Check ---
    const toneWarnings = this.checkTone(rawScript);
    warnings.push(...toneWarnings);

    // --- Capability Detection ---
    const capabilities = this.detectCapabilities(rawScript);

    // --- Structure Check ---
    if (!rawScript || rawScript.trim().length === 0) {
      return {
        accepted: false,
        contentFlag: 'clean',
        capabilities: [],
        warnings: [],
        rejectionReason: 'Empty script — nothing to process.',
        evaluatedAt: now,
      };
    }

    const sceneCount = (rawScript.match(/^Scene\s+\d+/gim) || []).length;
    if (sceneCount === 0) {
      warnings.push('No scene headers detected — script will be treated as a single scene.');
    }
    if (sceneCount > this.spec.content.maxScenes) {
      warnings.push(`Script has ${sceneCount} scenes (max ${this.spec.content.maxScenes}) — excess scenes will be trimmed.`);
    }

    console.log(`[BBAI] Intake ACCEPTED — ${sceneCount} scene(s), ${capabilities.length} capability(ies), ${contentFlag}`);

    return {
      accepted: true,
      contentFlag,
      capabilities,
      warnings,
      evaluatedAt: now,
    };
  }

  // -----------------------------------------------------------------------
  // Content Safety
  // -----------------------------------------------------------------------

  private checkContentSafety(text: string): ContentFlag {
    const lower = text.toLowerCase();

    // Hard reject — forbidden keywords
    for (const keyword of this.spec.content.forbiddenKeywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return 'rejected';
      }
    }

    // Tone pattern check — forbidden patterns are hard rejects
    for (const pattern of this.spec.tone.forbiddenPatterns) {
      if (new RegExp(pattern, 'i').test(text)) {
        return 'rejected';
      }
    }

    // Stylized violence detection (level 1 = allowed, level 2+ = flag)
    const violenceHints = /fight|battle|war|weapon|blood|explosion|crash|smash/i;
    if (violenceHints.test(text)) {
      return 'stylized_violence';
    }

    // Mild language
    const mildHints = /damn|hell|crap|ass\b/i;
    if (mildHints.test(text)) {
      return 'mild_language';
    }

    return 'clean';
  }

  private findRejectionReason(text: string): string {
    const lower = text.toLowerCase();

    for (const keyword of this.spec.content.forbiddenKeywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return `Forbidden content detected: "${keyword}"`;
      }
    }

    for (const pattern of this.spec.tone.forbiddenPatterns) {
      if (new RegExp(pattern, 'i').test(text)) {
        return `Forbidden tone pattern detected: "${pattern}"`;
      }
    }

    return 'Content violates MommaSpec boundaries.';
  }

  // -----------------------------------------------------------------------
  // Tone Check
  // -----------------------------------------------------------------------

  private checkTone(text: string): string[] {
    const warnings: string[] = [];

    // Count exclamation marks as urgency indicator
    const exclamations = (text.match(/!/g) || []).length;
    if (exclamations > 10) {
      warnings.push(`High urgency tone detected (${exclamations} exclamation marks) — may exceed assertive threshold.`);
    }

    // All-caps detection
    const words = text.split(/\s+/);
    const capsWords = words.filter((w) => w.length > 3 && w === w.toUpperCase());
    if (capsWords.length > 5) {
      warnings.push(`Excessive capitalization detected (${capsWords.length} all-caps words) — tone may be too aggressive.`);
    }

    return warnings;
  }

  // -----------------------------------------------------------------------
  // Capability Detection
  // -----------------------------------------------------------------------

  private detectCapabilities(text: string): IntakeCapability[] {
    const caps: IntakeCapability[] = [];

    for (const [pattern, name] of CAPABILITY_KEYWORDS) {
      if (pattern.test(text)) {
        caps.push({ name, required: true });
      }
    }

    // Every render requires these baseline capabilities
    const baseCaps: IntakeCapability[] = [
      { name: 'ffmpeg_render', required: true },
      { name: 'scene_parsing', required: true },
    ];

    return [...baseCaps, ...caps];
  }
}
