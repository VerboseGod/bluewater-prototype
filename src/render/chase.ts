import { windwardSign } from '../../core/sim/sim';

/** Where the default chase camera sits, and the point it looks at. */
export interface ChaseAim {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
}

/**
 * Slightly above and behind, on the windward quarter, so the hull, sail, and
 * sailor sit together in the lower middle of a TV frame. The look point is
 * above the hull, which drops the boat below the centre and clear of the dial.
 */
export function chaseAim(
  x: number,
  z: number,
  heading: number,
  awa: number,
  twa: number,
  waterY: number,
  pitch: number,
  /** Hold this windward side through a tack so the camera does not swap quarters mid-turn. */
  windwardHold?: number,
): ChaseAim {
  const windward = windwardHold || windwardSign(awa, twa);
  const fx = Math.cos(heading);
  const fz = Math.sin(heading);
  const sx = Math.sin(heading);
  const sz = -Math.cos(heading);
  const back = 14.2;
  const side = 6.1;
  return {
    x: x - fx * back + sx * windward * side,
    y: waterY + 4.6 + pitch * 0.6,
    z: z - fz * back + sz * windward * side,
    lookX: x + fx * 0.2,
    lookY: waterY + 3.15,
    lookZ: z + fz * 0.2,
  };
}
