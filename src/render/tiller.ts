/**
 * Visual yaw of the tiller, radians, in the boat's frame.
 * Positive rudder steers the bow to starboard, so the tiller swings to port.
 */
export function tillerYaw(rudderCmd: number): number {
  if (rudderCmd === 0) return 0;
  return -rudderCmd * 0.55;
}
