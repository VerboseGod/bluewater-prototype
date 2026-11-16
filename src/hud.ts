import { KT, RAD } from './sim/math';
import type { ManeuverMark, Simulation, TrackPoint } from './sim/sim';

export class Hud {
  readonly root: HTMLElement;
  private speed: HTMLElement;
  private heading: HTMLElement;
  private windText: HTMLElement;
  private dial: SVGSVGElement;
  private arrow: SVGElement;
  private trueMark: SVGLineElement;
  private modeBtn: HTMLButtonElement;
  private qualityBtn: HTMLButtonElement;
  private fps: HTMLElement;
  private hint: HTMLElement;
  private sheetFill: HTMLElement;
  private sheetMark: HTMLElement;
  private sheetWord: HTMLElement;
  private heelFill: HTMLElement;
  private heelWord: HTMLElement;
  private link: HTMLElement;
  private debrief: HTMLElement;
  private trackCanvas: HTMLCanvasElement;
  private stats: HTMLElement;
  onToggleMode: () => void = () => undefined;
  onToggleQuality: () => void = () => undefined;

  constructor(parent: HTMLElement) {
    parent.innerHTML = `
      <canvas id="view"></canvas>
      <div class="hud">
        <div class="top">
          <div class="panel speed"><b id="speed">0.0</b><span id="hdg">0 kn · heading 000</span></div>
          <div class="panel dial-wrap">
            <strong id="windtext">Apparent wind</strong>
            <svg class="dial" id="dial" viewBox="-60 -60 120 120" aria-hidden="true">
              <circle cx="0" cy="0" r="52" fill="none" stroke="rgba(231,246,242,0.25)" stroke-width="4"></circle>
              <path d="M0,-52 A52,52 0 0 1 36,-38" fill="none" stroke="rgba(255,90,90,0.0)" stroke-width="8" id="nogo"></path>
              <line id="truewind" x1="0" y1="0" x2="0" y2="-40" stroke="#8ee3ef" stroke-width="3"></line>
              <g id="awarrow">
                <line x1="0" y1="10" x2="0" y2="-40" stroke="#ffb703" stroke-width="4"></line>
                <polygon points="0,-52 -6,-40 6,-40" fill="#ffb703"></polygon>
              </g>
              <text x="0" y="22" text-anchor="middle" fill="#e7f6f2" font-size="11">BOW</text>
            </svg>
          </div>
          <div class="badges">
            <button class="ghost" id="mode" type="button">Assisted</button>
            <button class="ghost" id="quality" type="button">Performance</button>
            <div class="badge" id="link">Keyboard</div>
            <div class="muted" id="fps">-- fps</div>
          </div>
        </div>
        <div class="mid"><div class="hint" id="hint"></div></div>
        <div class="bottom">
          <div class="panel sheet">
            <div>Sheeted in <span class="muted">right trigger in · left trigger out</span></div>
            <div class="bar"><i id="sheetfill"></i><em class="mark" id="sheetmark"></em></div>
            <div class="state-word" id="sheetword">Luffing</div>
          </div>
          <div class="panel heel">
            <div>Heel</div>
            <div class="bar"><i id="heelfill"></i></div>
            <div class="state-word" id="heelword">Flat</div>
          </div>
        </div>
        <div class="legend">Left stick steers the bow · A hike · B training aids · D-pad camera · View reset · Menu debrief · X quality</div>
      </div>
      <div class="debrief hidden" id="debrief">
        <div class="card">
          <div>
            <h2>Session</h2>
            <canvas id="track" width="640" height="480"></canvas>
          </div>
          <div>
            <div class="stats" id="stats"></div>
            <p class="note" id="debriefnote"></p>
          </div>
        </div>
      </div>
    `;
    this.root = parent;
    this.speed = parent.querySelector('#speed')!;
    this.heading = parent.querySelector('#hdg')!;
    this.windText = parent.querySelector('#windtext')!;
    this.dial = parent.querySelector('#dial')!;
    this.arrow = parent.querySelector('#awarrow')!;
    this.trueMark = parent.querySelector('#truewind')!;
    this.modeBtn = parent.querySelector('#mode')!;
    this.qualityBtn = parent.querySelector('#quality')!;
    this.fps = parent.querySelector('#fps')!;
    this.hint = parent.querySelector('#hint')!;
    this.sheetFill = parent.querySelector('#sheetfill')!;
    this.sheetMark = parent.querySelector('#sheetmark')!;
    this.sheetWord = parent.querySelector('#sheetword')!;
    this.heelFill = parent.querySelector('#heelfill')!;
    this.heelWord = parent.querySelector('#heelword')!;
    this.link = parent.querySelector('#link')!;
    this.debrief = parent.querySelector('#debrief')!;
    this.trackCanvas = parent.querySelector('#track')!;
    this.stats = parent.querySelector('#stats')!;
    this.modeBtn.addEventListener('click', () => this.onToggleMode());
    this.qualityBtn.addEventListener('click', () => this.onToggleQuality());
  }

  get canvas(): HTMLCanvasElement {
    return this.root.querySelector('#view')!;
  }

  setPaused(paused: boolean): void {
    this.debrief.classList.toggle('hidden', !paused);
  }

  setFps(fps: number): void {
    this.fps.textContent = `${Math.round(fps)} fps`;
  }

  render(sim: Simulation, hint: string, urgent: boolean, quality: string): void {
    const s = sim.snapshot;
    const kn = Math.max(0, s.vFwd) * KT;
    this.speed.textContent = kn.toFixed(1);
    const hdg = ((s.heading * RAD) % 360 + 360) % 360;
    this.heading.textContent = `${kn.toFixed(1)} kn · heading ${hdg.toFixed(0).padStart(3, '0')}`;
    const awa = s.awa * RAD;
    this.windText.textContent = `AWA ${awa.toFixed(0)}° · ${(s.aws * KT).toFixed(0)} kn`;
    this.arrow.setAttribute('transform', `rotate(${-awa})`);
    this.trueMark.setAttribute('transform', `rotate(${-s.twa * RAD})`);
    this.dial.style.display = 'block';
    this.modeBtn.textContent = sim.assisted ? 'Assisted' : 'Full manual';
    this.modeBtn.classList.toggle('on', sim.assisted);
    this.qualityBtn.textContent = quality === 'quality' ? 'Quality' : 'Performance';
    this.link.textContent = s.gust > 1.12 ? 'Gust' : 'Steady';
    const sheetPct = s.sheet * 100;
    this.sheetFill.style.width = `${sheetPct}%`;
    this.sheetMark.style.left = sim.assisted ? `${s.suggestedSheet * 100}%` : '-10px';
    this.sheetMark.style.display = sim.assisted ? 'block' : 'none';
    const word = s.inIrons ? 'In irons' : s.sail === 'aback' ? 'Aback' : s.sail[0].toUpperCase() + s.sail.slice(1);
    const braking = s.rudderStalled && Math.abs(s.rudder) > 0.55;
    this.sheetWord.textContent = word + (s.planing ? ' · planing' : '') + (braking ? ' · rudder braking' : '');
    this.sheetWord.className = `state-word ${s.inIrons ? 'luffing' : s.sail}`;
    const heelDeg = s.heel * RAD;
    const heelPct = Math.max(0, Math.min(100, 50 + heelDeg));
    this.heelFill.style.width = `${heelPct}%`;
    this.heelWord.textContent = s.capsized
      ? 'Capsized — righting'
      : `${heelDeg.toFixed(0)}° ${Math.abs(heelDeg) < 3 ? 'flat' : heelDeg > 0 ? 'starboard down' : 'port down'}`;
    this.hint.textContent = hint;
    this.hint.classList.toggle('urgent', urgent);
    this.hint.style.visibility = hint ? 'visible' : 'hidden';
  }

  drawDebrief(sim: Simulation): void {
    const ctx = this.trackCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.trackCanvas.width;
    const h = this.trackCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#082833';
    ctx.fillRect(0, 0, w, h);
    const pts = sim.track.filter((p) => Number.isFinite(p.x));
    const bounds = boundsOf(pts, sim.x, sim.y);
    const mapX = (x: number) => ((x - bounds.minX) / bounds.span) * (w - 40) + 20;
    const mapY = (y: number) => h - 20 - ((y - bounds.minY) / bounds.span) * (h - 40);
    ctx.strokeStyle = 'rgba(255,224,138,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 36);
    ctx.lineTo(40 + Math.cos(sim.snapshot.windFrom + Math.PI) * 28, 36 + Math.sin(sim.snapshot.windFrom + Math.PI) * 28);
    ctx.stroke();
    ctx.fillStyle = '#ffe08a';
    ctx.font = '14px Segoe UI, sans-serif';
    ctx.fillText('wind', 48, 28);
    ctx.strokeStyle = '#9ef0b0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let drawing = false;
    for (const p of sim.track) {
      if (!Number.isFinite(p.x)) {
        drawing = false;
        continue;
      }
      const x = mapX(p.x);
      const y = mapY(p.y);
      if (!drawing) {
        ctx.moveTo(x, y);
        drawing = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (const m of sim.marks) {
      const x = mapX(m.x);
      const y = mapY(m.y);
      ctx.fillStyle = m.type === 'tack' ? '#ffb703' : '#8ee3ef';
      ctx.beginPath();
      if (m.type === 'tack') {
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x + 6, y + 5);
        ctx.lineTo(x - 6, y + 5);
      } else {
        ctx.rect(x - 4, y - 4, 8, 8);
      }
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mapX(sim.x), mapY(sim.y), 5, 0, Math.PI * 2);
    ctx.fill();

    const kn = (v: number) => `${(v * KT).toFixed(1)} kn`;
    const rows = [
      [kn(sim.maxSpeed), 'Max speed'],
      [kn(sim.bestVmgUp), 'Best VMG upwind'],
      [kn(sim.bestVmgDown), 'Best VMG downwind'],
      [`${sim.timeLuffing.toFixed(0)} s`, 'Time luffing'],
      [`${sim.timeStalled.toFixed(0)} s`, 'Time stalled'],
      [`${sim.capsizeCount}`, 'Capsizes'],
      [`${sim.marks.filter((m: ManeuverMark) => m.type === 'tack').length}`, 'Tacks'],
      [`${sim.marks.filter((m: ManeuverMark) => m.type === 'gybe').length}`, 'Gybes'],
    ];
    this.stats.innerHTML = rows
      .map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`)
      .join('');
    const note = this.root.querySelector('#debriefnote')!;
    note.textContent = sim.assisted
      ? 'Assisted: the amber mark on the sheet bar is a trim suggestion, and the red wedge is an approximate no-go guide. The boat can still sail wherever the forces allow. D-pad left/right or G changes graphics quality.'
      : 'Full manual: no sheet coach and no no-go wedge. Capsize and stall are less forgiving. Menu resumes.';
  }
}

function boundsOf(pts: TrackPoint[], x: number, y: number): { minX: number; minY: number; span: number } {
  let minX = x;
  let maxX = x;
  let minY = y;
  let maxY = y;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(30, maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { minX: cx - span / 2, minY: cy - span / 2, span };
}

export function hintFor(sim: Simulation): { text: string; urgent: boolean } {
  const s = sim.snapshot;
  if (sim.time > 600 && !s.capsized && !s.inIrons) return { text: '', urgent: false };
  if (s.capsized) {
    return { text: 'Capsized. The boat will right itself in a few seconds. Ease the sheet, and do not stay hiked out in a lull.', urgent: true };
  }
  if (s.inIrons) {
    return { text: 'In irons — you are drifting backwards. Push the stick the other way. Reverse rudder will push the bow off the wind, then sheet in.', urgent: true };
  }
  if (s.sail === 'stalled' && s.speed > 0.5) {
    return { text: 'The sail is stalled — sheeted too tight. Ease with the left trigger until the telltales stream aft.', urgent: true };
  }
  if (Math.abs(s.heel) > 0.35 && s.hike < 0.35 && !s.capsized) {
    return { text: 'Hold A to hike out. Past about 15° of heel you slow down and the boat wants to round up.', urgent: true };
  }
  if (s.sheet < 0.22 && s.sail === 'luffing' && s.speed < 1.2) {
    return { text: 'Pull the right trigger to sheet in until the sail fills and the telltales stream back.', urgent: false };
  }
  if (Math.abs(s.twa) < 0.7 && s.vFwd < 0.8) {
    return { text: 'You are pointing too close to the wind. Steer the bow away until the boat picks up speed.', urgent: false };
  }
  const tacks = sim.marks.filter((m: ManeuverMark) => m.type === 'tack').length;
  if (tacks === 0 && s.speed > 1.2 && sim.time < 600) {
    return { text: 'You are sailing. Try a tack: ease your hike as the sail luffs, and steer smoothly through the wind.', urgent: false };
  }
  if (sim.time < 30) {
    return { text: 'Wind streams across the water and the masthead vane points into the apparent wind. Menu opens the debrief.', urgent: false };
  }
  return { text: '', urgent: false };
}
