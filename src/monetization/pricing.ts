/**
 * Pricing Engine — Cost Calculation
 *
 * Determines how many credits each operation costs based on complexity.
 * This is the "value meter" of the system.
 */

import { Scene } from '../types';

// Base costs (in credits)
export const PRICING = {
  advisory: 1,           // Just governance check, no video
  renderPerScene: 5,     // Base cost per scene
  renderPerSecond: 0.5,  // Additional cost per second of video
  highResMultiplier: 2,  // 2x cost for high-res output
  watermarkRemoval: 10,  // One-time fee to remove watermark
};

/**
 * Calculate the credit cost for a render job.
 */
export function calculateRenderCost(scenes: Scene[], highRes: boolean = false): number {
  const sceneCount = scenes.length;
  const totalDuration = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);

  let cost = PRICING.renderPerScene * sceneCount;
  cost += PRICING.renderPerSecond * totalDuration;

  if (highRes) {
    cost *= PRICING.highResMultiplier;
  }

  return Math.ceil(cost);
}

/**
 * Calculate the credit cost for an advisory request.
 */
export function calculateAdvisoryCost(): number {
  return PRICING.advisory;
}

/**
 * Get pricing breakdown for display to user.
 */
export function getPricingBreakdown(scenes: Scene[], highRes: boolean = false) {
  const sceneCount = scenes.length;
  const totalDuration = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  const baseCost = PRICING.renderPerScene * sceneCount;
  const durationCost = PRICING.renderPerSecond * totalDuration;
  const total = calculateRenderCost(scenes, highRes);

  return {
    sceneCount,
    totalDuration,
    breakdown: {
      scenes: baseCost,
      duration: durationCost,
      highRes: highRes ? total - (baseCost + durationCost) : 0,
    },
    total,
  };
}
