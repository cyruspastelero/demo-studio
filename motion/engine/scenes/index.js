// Scene registry. Each scene: { defaults, build(root, params, ctx, durationSec) -> { update(localSec) } }.
import { kineticText, cardScatter, logoLockup, sparkle, shapeSweep } from './text.js';
import { tiltedPanel, uiFocus, promptType, buttonPress, aspectMorph, deviceFrame } from './ui.js';
import { tiles, doneBurst, statCounter, featureList, notificationStack, chartReveal } from './data.js';

export const SCENES = {
  kineticText, cardScatter, logoLockup, sparkle, shapeSweep,
  tiltedPanel, uiFocus, promptType, buttonPress, aspectMorph, deviceFrame,
  tiles, doneBurst, statCounter, featureList, notificationStack, chartReveal,
};
