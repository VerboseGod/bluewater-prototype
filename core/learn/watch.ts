import { byTheLee, gybeStars, tackStars, type GybeRecord, type SailSample, type TackRecord } from './model';

/**
 * Watches the sim's tack and gybe marks. Speed kept is the slowest point of
 * the tack divided by the speed on the way in. Quality is the peak of the
 * tack-quality term the forces already use.
 */
export class ManeuverWatch {
  tacks: TackRecord[] = [];
  gybes: GybeRecord[] = [];
  private entry = 0;
  private min = 0;
  private peakQ = 0;
  private tracking = false;
  private side = 1;
  private crossed = false;
  private gybeEntry = 0;
  private leeTime = 0;

  reset(): void {
    this.tacks = [];
    this.gybes = [];
    this.entry = 0;
    this.min = 0;
    this.peakQ = 0;
    this.tracking = false;
    this.side = 1;
    this.crossed = false;
    this.gybeEntry = 0;
    this.leeTime = 0;
  }

  push(sample: SailSample, dt: number, added: 'tack' | 'gybe' | null): void {
    const abs = Math.abs(sample.twa);
    if (abs > 0.7 && abs < 1.35 && sample.vFwd > 0.8) {
      this.entry = sample.vFwd;
      this.side = Math.sign(sample.twa) || this.side;
      this.tracking = false;
    }
    if (abs < 0.62) {
      if (!this.tracking) {
        this.tracking = true;
        this.min = sample.vFwd;
        this.peakQ = sample.tackQuality;
        this.crossed = false;
      }
      this.min = Math.min(this.min, sample.vFwd);
      this.peakQ = Math.max(this.peakQ, sample.tackQuality);
      if (sample.crew * this.side > -0.05) this.crossed = true;
    }

    if (abs > 2.2 && sample.vFwd > 0.6) this.gybeEntry = sample.vFwd;
    if (byTheLee(sample.twa, sample.boom)) this.leeTime += dt;
    else this.leeTime = Math.max(0, this.leeTime - dt * 0.5);

    if (added === 'tack') {
      const entry = this.entry > 0.4 ? this.entry : Math.max(sample.vFwd, 0.5);
      const min = this.min > 0 ? Math.min(this.min, sample.vFwd) : sample.vFwd;
      const kept = min / entry;
      const quality = this.peakQ;
      this.tacks.push({
        at: sample.time,
        x: sample.x,
        y: sample.y,
        entry,
        min,
        exit: sample.vFwd,
        kept,
        quality,
        crossed: this.crossed,
        stars: tackStars(kept, quality),
      });
      this.tracking = false;
      this.entry = 0;
      this.min = 0;
      this.peakQ = 0;
      this.crossed = false;
    }

    if (added === 'gybe') {
      const entry = this.gybeEntry > 0.4 ? this.gybeEntry : Math.max(sample.vFwd, 0.5);
      const kept = sample.vFwd / entry;
      const satByTheLee = this.leeTime > 1.2;
      const controlled = !sample.capsized && sample.shake < 0.45 && sample.sheet > 0.15;
      this.gybes.push({
        at: sample.time,
        x: sample.x,
        y: sample.y,
        entry,
        exit: sample.vFwd,
        kept,
        sheet: sample.sheet,
        shake: sample.shake,
        byTheLee: satByTheLee,
        capsized: sample.capsized,
        controlled,
        stars: gybeStars({ controlled, byTheLee: satByTheLee, capsized: sample.capsized, kept }),
      });
      this.gybeEntry = 0;
      this.leeTime = 0;
    }

    const last = this.tacks[this.tacks.length - 1];
    if (last && sample.time - last.at < 5 && sample.time >= last.at && sample.vFwd > last.exit && !sample.inIrons) {
      last.exit = sample.vFwd;
    }
  }
}
