import { pointOfSail, type PointOfSail } from '../learn/model';

export interface BoatFacts {
  twa: number;
  sail: string;
  inIrons: boolean;
  capsized: boolean;
  heel: number;
  speedKn: number;
  grounded?: boolean;
  collided?: boolean;
}

export interface BoatReadout {
  /** What the boat is doing, in plain words. */
  point: string;
  /** Why, and the one thing to do about the sail. */
  sail: string;
  /** Heel, speed, and any warning. */
  line: string;
}

const POINT: Record<PointOfSail, string> = {
  'no-go': 'No-go zone',
  'close-hauled': 'Close hauled',
  'close-reach': 'Close reach',
  'beam-reach': 'Beam reach',
  'broad-reach': 'Broad reach',
  run: 'Run',
};

/**
 * One sentence a non-sailor can read from the sofa.
 * The no-go zone is taught as about 45° either side of the wind.
 */
export function boatReadout(boat: BoatFacts): BoatReadout {
  const point = pointOfSail(boat.twa);
  const heelDeg = Math.abs(boat.heel * (180 / Math.PI));
  const speed = `${boat.speedKn.toFixed(1)} kn`;
  if (boat.capsized) {
    return {
      point: 'Capsized',
      sail: 'Too much sail, or you stayed hiked out. Ease the sheet and stay with the boat.',
      line: `${speed} · the boat will right itself. Do not swim away from it.`,
    };
  }
  if (boat.grounded) {
    return {
      point: 'Aground',
      sail: 'The board is in the mud. You left the deep water.',
      line: `${speed} · Paddle back toward the channel. Do not force it.`,
    };
  }
  if (boat.collided) {
    return {
      point: 'You hit something',
      sail: 'The approach was too fast, or there was no escape route.',
      line: `${speed} · Ease the sheet, stop, and go round again. Do not fend off with hands or feet.`,
    };
  }
  if (boat.inIrons || (point === 'no-go' && boat.speedKn < 0.8)) {
    return {
      point: 'In irons, no drive',
      sail: boat.sail === 'trimmed' ? 'The sail is pinned. Ease it, then steer off the wind.' : 'Sail luffing, no drive. Push the tiller so the bow falls off.',
      line: `${speed} · The no-go zone is about 45° either side of the wind.`,
    };
  }
  let sail: string;
  if (boat.speedKn < 0.6) sail = boat.sail === 'luffing' ? 'Sail luffing, trim in' : 'Not moving yet. Steer, then trim in.';
  else if (boat.sail === 'stalled') sail = 'Over-trimmed, ease out';
  else if (boat.sail === 'luffing' || boat.sail === 'aback') sail = 'Sail luffing, trim in';
  else sail = 'Sail drawing';
  if (point === 'no-go') sail = 'Too close to the wind. Bear away until the sail draws.';
  const heel = heelDeg > 18 ? `Heeling ${heelDeg.toFixed(0)}°. Hike out or ease the sheet.` : heelDeg < 4 ? 'Boat flat' : `Heel ${heelDeg.toFixed(0)}°`;
  const name = point === 'no-go' ? 'No-go zone' : POINT[point];
  return { point: name, sail, line: `${speed} · ${heel}` };
}
