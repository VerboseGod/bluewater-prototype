/**
 * Open-sea swell is the existing wave set. Inside the breakwater it is
 * attenuated. Near shore the height also falls with depth, so a shoal is
 * calmer than the same place in deep water.
 * `inside` is the marina basin. `depth` is metres of water.
 */
export function waveScaleAt(inside: boolean, depth: number): number {
  const shoal = Math.min(1, Math.sqrt(Math.max(0, depth) / 8));
  return shoal * (inside ? 0.2 : 1);
}
