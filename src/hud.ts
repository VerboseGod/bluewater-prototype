import { BUOY, CLEAT, SOLIDS } from '../core/dock/layout';
import type { DockReport } from '../core/dock/score';
import { drawHarbourChart } from './harbour/chart';
import { ASSUMPTIONS, BATHY_CREDIT, OSM_CREDIT } from '../core/harbour/credits';
import type { HarbourReport } from '../core/harbour/session';
import type { HarbourWorld } from '../core/harbour/world';
import { KT, RAD } from '../core/sim/math';
import { sailorStation, windwardSign, type ManeuverMark, type Simulation, type TrackPoint } from '../core/sim/sim';

const HINT_HOLD = 3600;
const HINT_FADE = 1100;
const HINT_URGENT_HOLD = 5200;
const STRIP_HOLD = 4000;
const STRIP_FADE = 800;

/** 1 while the prompt is up, then a fade, then 0. Empty text stays hidden. */
export function hintOpacity(ageMs: number, urgent: boolean, text: string): number {
  if (!text) return 0;
  const hold = urgent ? HINT_URGENT_HOLD : HINT_HOLD;
  if (ageMs <= hold) return 1;
  if (ageMs >= hold + HINT_FADE) return 0;
  return 1 - (ageMs - hold) / HINT_FADE;
}

/** The phase banner stays up for about four seconds, then fades. */
export function stripOpacity(ageMs: number, text: string): number {
  if (!text) return 0;
  if (ageMs <= STRIP_HOLD) return 1;
  if (ageMs >= STRIP_HOLD + STRIP_FADE) return 0;
  return 1 - (ageMs - STRIP_HOLD) / STRIP_FADE;
}

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
  private pauseBtn: HTMLButtonElement;
  private fps: HTMLElement;
  private hint: HTMLElement;
  private sheetFill: HTMLElement;
  private sheetMark: HTMLElement;
  private sheetWord: HTMLElement;
  private heelFill: HTMLElement;
  private heelWord: HTMLElement;
  private sailorFill: HTMLElement;
  private sailorWord: HTMLElement;
  private link: HTMLElement;
  private debrief: HTMLElement;
  private trackCanvas: HTMLCanvasElement;
  private stats: HTMLElement;
  private legend: HTMLElement;
  private strip: HTMLElement;
  private stripText = '';
  private stripAt = 0;
  private title: HTMLElement;
  private scenarioBtn: HTMLButtonElement;
  private scenarioMenu: HTMLButtonElement;
  private scenario: 'open' | 'dock' | 'harbour' | 'learn' | 'coop' = 'open';
  private sources: HTMLElement;
  private placesBtn: HTMLButtonElement;
  private placesPop: HTMLElement;
  private timeLabel: HTMLElement;
  private hintText = '';
  private hintAt = 0;
  onToggleMode: () => void = () => undefined;
  onToggleQuality: () => void = () => undefined;
  onTogglePause: () => void = () => undefined;
  onToggleDock: () => void = () => undefined;
  onToggleHarbour: () => void = () => undefined;
  onPlace: (place: 'open' | 'dock' | 'harbour' | 'learn' | 'coop') => void = () => undefined;
  onTime: (mode: 'day' | 'golden' | 'dusk') => void = () => undefined;

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
            <button class="ghost" id="quality" type="button">Low</button>
            <button class="ghost" id="pause" type="button">Debrief</button>
            <div class="places">
              <button class="ghost" id="places-btn" type="button">Places</button>
              <div class="places-pop hidden" id="places-pop">
                <button type="button" data-place="open">Open water</button>
                <button type="button" data-place="dock">Docking practice</button>
                <button type="button" data-place="harbour">Herzliya</button>
                <button type="button" data-place="learn">Learn to sail</button>
                <button type="button" data-place="coop">Co-op crew</button>
                <button type="button" data-time="day">Day</button>
                <button type="button" data-time="golden">Golden hour</button>
                <button type="button" data-time="dusk">Dusk</button>
                <button type="button" id="sources-btn">Sources</button>
              </div>
            </div>
            <div class="badge" id="link">Keyboard</div>
            <div class="muted" id="fps">-- fps</div>
          </div>
        </div>
        <div class="mid"><div class="stack"><div class="dockstrip hidden" id="dockstrip"></div><div class="hint" id="hint"></div></div></div>
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
            <div>Sailor <span class="muted">A out · B in</span></div>
            <div class="bar"><i id="sailorfill"></i></div>
            <div class="state-word" id="sailorword">Windward rail</div>
          </div>
        </div>
        <div class="legend" id="legend">Stick steers the bow · triggers sheet · A out/hike · B in/across · Y assisted · H docking · V cinematic · View reset · Menu debrief · X low/high</div>
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
            <button class="ghost" id="scenario-menu" type="button">Docking practice</button>
          </div>
        </div>
      </div>
      <div class="debrief hidden" id="sources">
        <div class="card sources-card">
          <div>
            <h2>Sources</h2>
            <p class="note">${OSM_CREDIT}</p>
            <p class="note">${BATHY_CREDIT}</p>
            <p class="note">Assumptions, not charted data:</p>
            <ul class="note">${ASSUMPTIONS.map((line) => `<li>${line}</li>`).join('')}</ul>
            <button class="ghost" id="sources-close" type="button">Close</button>
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
    this.pauseBtn = parent.querySelector('#pause')!;
    this.fps = parent.querySelector('#fps')!;
    this.hint = parent.querySelector('#hint')!;
    this.sheetFill = parent.querySelector('#sheetfill')!;
    this.sheetMark = parent.querySelector('#sheetmark')!;
    this.sheetWord = parent.querySelector('#sheetword')!;
    this.heelFill = parent.querySelector('#heelfill')!;
    this.heelWord = parent.querySelector('#heelword')!;
    this.sailorFill = parent.querySelector('#sailorfill')!;
    this.sailorWord = parent.querySelector('#sailorword')!;
    this.link = parent.querySelector('#link')!;
    this.debrief = parent.querySelector('#debrief')!;
    this.trackCanvas = parent.querySelector('#track')!;
    this.stats = parent.querySelector('#stats')!;
    this.legend = parent.querySelector('#legend')!;
    this.strip = parent.querySelector('#dockstrip')!;
    this.title = parent.querySelector('h2')!;
    this.scenarioBtn = parent.querySelector('#scenario-menu')!;
    this.scenarioMenu = this.scenarioBtn;
    this.placesBtn = parent.querySelector('#places-btn')!;
    this.placesPop = parent.querySelector('#places-pop')!;
    this.timeLabel = this.placesBtn;
    this.sources = parent.querySelector('#sources')!;
    const sourcesBtn = parent.querySelector<HTMLButtonElement>('#sources-btn')!;
    const sourcesClose = parent.querySelector<HTMLButtonElement>('#sources-close')!;
    this.modeBtn.addEventListener('click', () => this.onToggleMode());
    this.qualityBtn.addEventListener('click', () => this.onToggleQuality());
    this.pauseBtn.addEventListener('click', () => this.onTogglePause());
    this.scenarioMenu.addEventListener('click', () => {
      this.onPlace(this.scenario === 'open' ? 'harbour' : 'open');
    });
    this.placesBtn.addEventListener('click', () => this.placesPop.classList.toggle('hidden'));
    this.placesPop.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const place = target.dataset.place as 'open' | 'dock' | 'harbour' | 'learn' | 'coop' | undefined;
      const time = target.dataset.time as 'day' | 'golden' | 'dusk' | undefined;
      if (place) this.onPlace(place);
      if (time) this.onTime(time);
      if (place || time) this.placesPop.classList.add('hidden');
    });
    sourcesBtn.addEventListener('click', () => {
      this.placesPop.classList.add('hidden');
      this.sources.classList.remove('hidden');
    });
    sourcesClose.addEventListener('click', () => this.sources.classList.add('hidden'));
  }

  setLink(text: string): void {
    this.link.textContent = text;
  }

  setTime(mode: 'day' | 'golden' | 'dusk'): void {
    this.timeLabel.dataset.light = mode;
  }

  get canvas(): HTMLCanvasElement {
    return this.root.querySelector('#view')!;
  }

  setPaused(paused: boolean): void {
    this.debrief.classList.add('hidden');
    this.pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  }

  setScenario(mode: 'open' | 'dock' | 'harbour' | 'learn' | 'coop'): void {
    this.scenario = mode;
    const leave = mode === 'open' ? 'Herzliya' : 'Open water';
    this.scenarioBtn.textContent = leave;
    this.scenarioMenu.textContent = leave;
    this.placesBtn.textContent =
      mode === 'coop' ? 'Co-op' : mode === 'learn' ? 'Learn' : mode === 'harbour' ? 'Herzliya' : mode === 'dock' ? 'Docking' : 'Places';
    if (mode !== 'open') this.link.textContent = 'Keyboard';
    this.legend.textContent =
      mode === 'dock'
        ? 'A out · B in · Y assisted · F anchor · M line · Z wind · View reset · Menu debrief · X graphics'
        : mode === 'harbour'
          ? 'Steer · sheet · Q paddle · Z wind · M line · Places for light · Menu chart · X graphics'
          : mode === 'learn'
            ? 'Stick steers · triggers sheet · A hikes · B crosses · D-pad and A choose a lesson · Menu leaves it'
            : mode === 'coop'
              ? 'Helm stick and A · crew triggers and A · RB ready about · Y ready · two pads, one boat'
              : 'Stick steers · triggers sheet · A out · B in · Y assisted · Places · V cinematic · Menu debrief · X graphics';
    if (mode === 'open') this.strip.classList.add('hidden');
  }

  private stripSticky = false;

  setStrip(text: string | null, kind: 'info' | 'good' | 'bad' = 'info', sticky = false): void {
    if ((this.scenario !== 'dock' && this.scenario !== 'harbour' && this.scenario !== 'learn') || !text) {
      this.strip.classList.add('hidden');
      this.stripText = '';
      return;
    }
    this.stripSticky = sticky;
    if (text !== this.stripText) {
      this.stripText = text;
      this.stripAt = performance.now();
    }
    this.strip.classList.remove('hidden', 'good', 'bad');
    if (kind !== 'info') this.strip.classList.add(kind);
    this.strip.textContent = text;
    this.fadeStrip();
  }

  pulse(which: 'sheet' | 'heel' | 'sailor'): void {
    const el = which === 'sheet' ? this.sheetFill : which === 'heel' ? this.heelFill : this.sailorFill;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  setFps(fps: number): void {
    this.fps.textContent = fps > 0 ? `${Math.round(fps)} fps` : '';
  }

  render(sim: Simulation, hint: string, urgent: boolean, quality: string): void {
    const s = sim.snapshot;
    const kn = Math.max(0, s.vFwd) * KT;
    this.speed.textContent = kn.toFixed(1);
    const hdg = ((s.heading * RAD) % 360 + 360) % 360;
    this.heading.textContent = `${kn.toFixed(1)} kn · heading ${hdg.toFixed(0).padStart(3, '0')}`;
    const awa = s.awa * RAD;
    this.windText.textContent = `AWA ${awa.toFixed(0)}° · ${(s.aws * KT).toFixed(1)} kn`;
    this.arrow.setAttribute('transform', `rotate(${-awa})`);
    this.trueMark.setAttribute('transform', `rotate(${-s.twa * RAD})`);
    this.dial.style.display = 'block';
    this.modeBtn.textContent = sim.assisted ? 'Assisted' : 'Full manual';
    this.modeBtn.classList.toggle('on', sim.assisted);
    this.qualityBtn.textContent = quality === 'high' ? 'High' : 'Low';
    if (this.scenario === 'open') this.link.textContent = s.gust > 1.12 ? 'Gust' : 'Steady';
    const sheetPct = s.sheet * 100;
      this.sheetFill.style.width = `${sheetPct}%`;
    this.sheetMark.style.left = sim.assisted ? `${s.suggestedSheet * 100}%` : '-10px';
    this.sheetMark.style.display = sim.assisted ? 'block' : 'none';
    const waiting = s.speed < 0.35 && s.sail === 'stalled' && !s.inIrons;
    const word = s.inIrons ? 'In irons' : waiting ? 'Waiting' : s.sail === 'aback' ? 'Aback' : s.sail[0].toUpperCase() + s.sail.slice(1);
    const braking = s.rudderStalled && Math.abs(s.rudder) > 0.55;
    this.sheetWord.textContent = word + (s.planing ? ' · planing' : '') + (braking ? ' · rudder braking' : '');
    this.sheetWord.className = `state-word ${waiting ? '' : s.inIrons ? 'luffing' : s.sail}`;
    const heelDeg = s.heel * RAD;
    const heelPct = Math.max(0, Math.min(100, 50 + heelDeg));
    this.heelFill.style.width = `${heelPct}%`;
    this.heelWord.textContent = s.capsized
      ? 'Capsized — righting'
      : `${heelDeg.toFixed(0)}° ${Math.abs(heelDeg) < 3 ? 'flat' : heelDeg > 0 ? 'starboard down' : 'port down'}`;
    const windward = windwardSign(s.awa, s.twa);
    const station = sailorStation(s.crew, windward);
    const stationWord =
      station === 'hiked' ? 'Hiked out' : station === 'rail' ? 'Windward rail' : station === 'in' ? 'Sitting in' : 'To leeward';
    this.sailorWord.textContent = stationWord;
    this.sailorWord.className = `state-word ${station === 'leeward' ? 'luffing' : 'trimmed'}`;
    const along = s.crew * windward;
    const sailorPct = Math.max(0, Math.min(100, ((along + 0.45) / 1.5) * 100));
    this.sailorFill.style.width = `${sailorPct}%`;
    if (hint !== this.hintText) {
      this.hintText = hint;
      this.hintAt = performance.now();
    }
    const opacity = hintOpacity(performance.now() - this.hintAt, urgent, hint);
    this.hint.textContent = hint;
    this.hint.classList.toggle('urgent', urgent);
    this.hint.style.opacity = opacity.toFixed(3);
    this.hint.style.visibility = opacity > 0.02 ? 'visible' : 'hidden';
    this.fadeStrip();
  }

  private fadeStrip(): void {
    if (this.strip.classList.contains('hidden')) return;
    if (this.stripSticky) {
      this.strip.style.opacity = '1';
      this.strip.style.visibility = 'visible';
      return;
    }
    const opacity = stripOpacity(performance.now() - this.stripAt, this.stripText);
    this.strip.style.opacity = opacity.toFixed(3);
    this.strip.style.visibility = opacity > 0.02 ? 'visible' : 'hidden';
  }

  drawDebrief(sim: Simulation): void {
    this.title.textContent = 'Session';
    const ctx = this.trackCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.trackCanvas.width;
    const h = this.trackCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0c2430';
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
      ? 'Assisted: the amber mark on the sheet bar is a trim suggestion, and the red arc is an approximate no-go guide. In a tack or gybe it tells you when to change sides. The boat can still sail wherever the forces allow. X or G switches Low and High graphics. H, or LB, opens docking practice.'
      : 'Full manual: no sheet coach, no no-go arc, and no side-change prompt. You still have to cross the boat. Capsize and stall are less forgiving. Menu resumes. H, or LB, opens docking practice.';
  }

  drawDockDebrief(sim: Simulation, report: DockReport): void {
    this.title.textContent = 'Docking attempt';
    const ctx = this.trackCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.trackCanvas.width;
    const h = this.trackCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#082833';
    ctx.fillRect(0, 0, w, h);
    const extra: TrackPoint[] = [
      ...SOLIDS.flatMap((b) => [
        { x: b.minX, y: b.minY, t: 0 },
        { x: b.maxX, y: b.maxY, t: 0 },
      ]),
      { x: CLEAT.x, y: CLEAT.y, t: 0 },
      { x: BUOY.x, y: BUOY.y, t: 0 },
    ];
    const pts = sim.track.filter((p) => Number.isFinite(p.x)).concat(extra);
    const bounds = boundsOf(pts, sim.x, sim.y);
    const mapX = (x: number) => ((x - bounds.minX) / bounds.span) * (w - 40) + 20;
    const mapY = (y: number) => h - 20 - ((y - bounds.minY) / bounds.span) * (h - 40);
    ctx.fillStyle = 'rgba(94, 109, 118, 0.85)';
    for (const b of SOLIDS) {
      const x = mapX(b.minX);
      const y = mapY(b.maxY);
      ctx.fillRect(x, y, mapX(b.maxX) - x, mapY(b.minY) - y);
    }
    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.arc(mapX(CLEAT.x), mapY(CLEAT.y), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d24b3e';
    ctx.beginPath();
    ctx.arc(mapX(BUOY.x), mapY(BUOY.y), 5, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mapX(sim.x), mapY(sim.y), 5, 0, Math.PI * 2);
    ctx.fill();

    const kn = report.approachKn == null ? '—' : `${report.approachKn.toFixed(1)} kn`;
    const impact = report.impactMs < 0.05 ? 'none' : `${report.impactMs.toFixed(2)} m/s ${report.impactClass}`;
    const dist = report.distAtStop == null ? '—' : `${report.distAtStop.toFixed(1)} m`;
    const angle = report.angleAtStopDeg == null ? '—' : `${report.angleAtStopDeg.toFixed(0)}°`;
    const time = report.timeSec == null ? `${report.elapsed.toFixed(0)} s` : `${report.timeSec.toFixed(0)} s`;
    const scope = report.scope == null ? '—' : `${report.scope.toFixed(1)}:1`;
    const held = !report.anchorDown ? 'not dropped' : report.anchorHeld ? 'held' : 'dragged';
    const rows = [
      [kn, 'Approach speed'],
      [impact, 'Impact'],
      [dist, 'Distance at stop'],
      [angle, 'Angle at stop'],
      [time, 'Time'],
      [scope, 'Anchor scope'],
      [held, 'Anchor'],
      [report.moored ? 'yes' : 'no', 'Mooring line'],
    ];
    this.stats.innerHTML = rows
      .map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`)
      .join('');
    const note = this.root.querySelector('#debriefnote')!;
    note.textContent = report.tip;
  }

  drawHarbourDebrief(sim: Simulation, report: HarbourReport, world: HarbourWorld): void {
    this.title.textContent = 'Herzliya';
    const ctx = this.trackCanvas.getContext('2d');
    if (!ctx) return;
    drawHarbourChart(ctx, this.trackCanvas.width, this.trackCanvas.height, world, sim.track, { x: sim.x, y: sim.y }, report);
    const dock = report.dock;
    const rows = [
      [`${report.timeSec.toFixed(0)} s`, 'Time'],
      [report.phase, 'Phase'],
      [`${report.groundings}`, 'Groundings'],
      [`${report.shadowMoments}`, 'Wind-shadow moments'],
      [`${report.shadowSeconds.toFixed(0)} s`, 'Time in the lee'],
      [dock.approachKn == null ? '—' : `${dock.approachKn.toFixed(1)} kn`, 'Docking approach'],
      [dock.moored ? 'made fast' : 'not fast', 'Visitor pontoon'],
      [dock.impactClass === 'none' ? 'none' : `${dock.impactMs.toFixed(2)} m/s`, 'Dock impact'],
    ];
    this.stats.innerHTML = rows.map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('');
    const note = this.root.querySelector('#debriefnote')!;
    note.textContent = `${dock.tip} The chart is coastline and depth from the checked-in extracts, not a navigational chart. The yellow dots are practice marks.`;
  }
}

function sideChangeDue(s: { assisted: boolean; awa: number; twa: number; crew: number; vFwd: number; boom: number }): boolean {
  if (!s.assisted) return false;
  const windward = windwardSign(s.awa, s.twa);
  const onWindward = s.crew * windward > 0.2;
  const tacking = Math.abs(s.twa) < 0.45 && s.vFwd > 0.45;
  const gybing = Math.abs(s.twa) > 2.9 && Math.abs(s.boom) > 0.3 && s.vFwd > 0.4;
  return (tacking || gybing) && !onWindward;
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
  if (sim.assisted && sideChangeDue(s)) {
    return {
      text: 'Change sides now. B moves you in across the boat, then A hikes you out. Too early heels the boat onto the new leeward and slows you; too late and you heel and stall.',
      urgent: true,
    };
  }
  if (s.planing && s.aoa < 0.14) {
    return { text: 'Planing — the apparent wind has come forward. Sheet in, or the sail luffs and the boat drops off the plane.', urgent: true };
  }
  if (s.sail === 'stalled' && s.speed > 0.5) {
    return { text: 'The sail is stalled — sheeted too tight. Ease with the left trigger until the telltales stream aft.', urgent: true };
  }
  const hiked = s.crew * windwardSign(s.awa, s.twa) > 0.6;
  if (Math.abs(s.heel) > 0.32 && !hiked && !s.capsized && Math.abs(s.twa) < 1.3) {
    return { text: 'Gust or a puff will round you up. Hold A to hike, ease the sheet, or feather up until the sail luffs.', urgent: true };
  }
  if (s.sheet < 0.22 && s.sail === 'luffing' && s.speed < 1.2) {
    return { text: 'Pull the right trigger to sheet in until the sail fills and the telltales stream back.', urgent: false };
  }
  if (Math.abs(s.twa) < 0.7 && s.vFwd < 0.8) {
    return { text: 'You are pointing too close to the wind. Steer the bow away until the boat picks up speed.', urgent: false };
  }
  const tacks = sim.marks.filter((m: ManeuverMark) => m.type === 'tack').length;
  if (tacks === 0 && s.speed > 1.2 && sim.time < 600) {
    return { text: 'You are sailing. Try a tack: ease the sheet, steer smoothly, and cross the boat as the sail luffs. A hikes out, B moves you in.', urgent: false };
  }
  if (sim.time < 30) {
    return { text: 'Wind streams across the water and the masthead vane points into the apparent wind. Menu opens the debrief.', urgent: false };
  }
  return { text: '', urgent: false };
}
