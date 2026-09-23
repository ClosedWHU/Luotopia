// Shared playback clock for the two brand 3D scenes.
//
// Both viewers derive their animation phase from this single virtual clock, so
// they build / hold / dissolve in lockstep regardless of when each canvas
// mounts, one reset() rewinds both together, and pause()/resume() freeze both
// together. Kept on a global key so the two lazily-loaded scene chunks (wu /
// luo) always share one instance even though they are separate dynamic imports.

const KEY = '__ltBrandConductor';
const g = globalThis;
if (!g[KEY]) g[KEY] = { epoch: performance.now(), accumulated: 0, paused: false };
const s = g[KEY];

export const PERIOD = 9.0;
export const BUILD_START = 0.4;
export const BUILD_END = 4.2;
export const HOLD_END = 7.0;
export const DISSOLVE_END = 8.6;

// Seconds of playback elapsed, frozen while paused.
export function virtualTime() {
  return s.accumulated + (s.paused ? 0 : (performance.now() - s.epoch) / 1000);
}

// Current position within the loop, [0, PERIOD).
export function phaseT() {
  const t = virtualTime() % PERIOD;
  return t < 0 ? t + PERIOD : t;
}

export function isPaused() {
  return s.paused;
}

export function pause() {
  if (s.paused) return;
  s.accumulated = virtualTime();
  s.epoch = performance.now();
  s.paused = true;
}

export function resume() {
  if (!s.paused) return;
  s.epoch = performance.now();
  s.paused = false;
}

export function toggle() {
  if (s.paused) resume();
  else pause();
  return s.paused;
}

// Rewind both scenes to the top of the loop and resume.
export function reset() {
  s.accumulated = 0;
  s.epoch = performance.now();
  s.paused = false;
}
