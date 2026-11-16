import { POINT_LABEL, type PointOfSail, type TackRecord } from './model';
import type { LearnView } from './director';
import { coachHtml, starText } from './text';

const BANDS: { id: PointOfSail; from: number; to: number; color: string }[] = [
  { id: 'no-go', from: -35, to: 35, color: '#ff6b6b' },
  { id: 'close-hauled', from: 35, to: 62, color: '#ffb703' },
  { id: 'close-hauled', from: -62, to: -35, color: '#ffb703' },
  { id: 'close-reach', from: 62, to: 78, color: '#ffe08a' },
  { id: 'close-reach', from: -78, to: -62, color: '#ffe08a' },
  { id: 'beam-reach', from: 78, to: 112, color: '#7fd8e4' },
  { id: 'beam-reach', from: -112, to: -78, color: '#7fd8e4' },
  { id: 'broad-reach', from: 112, to: 150, color: '#9ef0b0' },
  { id: 'broad-reach', from: -150, to: -112, color: '#9ef0b0' },
  { id: 'run', from: 150, to: 180, color: '#d7c4ff' },
  { id: 'run', from: -180, to: -150, color: '#d7c4ff' },
];

/**
 * Lesson select, the coach line, and the debrief. Built for a 1080p TV:
 * one instruction at a time, large type, D-pad focus.
 */
export class LearnOverlay {
  readonly root: HTMLElement;
  private menu: HTMLElement;
  private list: HTMLElement;
  private coach: HTMLElement;
  private kicker: HTMLElement;
  private goal: HTMLElement;
  private line: HTMLElement;
  private wheel: HTMLElement;
  private pointName: HTMLElement;
  private debrief: HTMLElement;
  private stars: HTMLElement;
  private note: HTMLElement;
  private tacks: HTMLElement;
  private canvas: HTMLCanvasElement;
  private menuKey = '';
  onConfirm: () => void = () => undefined;
  onBack: () => void = () => undefined;
  onPick: (index: number) => void = () => undefined;

  constructor(parent: HTMLElement) {
    const host = document.createElement('div');
    host.id = 'learn';
    host.className = 'learn hidden';
    host.innerHTML = `
      <section class="learn-menu" id="learn-menu">
        <h1>Learn to sail</h1>
        <p class="learn-lede">Six short lessons. Left stick steers the bow. Right trigger sheets in.</p>
        <div id="learn-list"></div>
        <p class="learn-keys"><span class="glyph a">A</span> start <span class="glyph b">B</span> back <span class="glyph dpad">D-pad</span> move</p>
      </section>
      <section class="coach hidden" id="coach">
        <div class="coach-kicker" id="coach-kicker"></div>
        <p class="coach-goal" id="coach-goal"></p>
        <p class="coach-line" id="coach-line"></p>
        <div class="wheel-wrap hidden" id="pos-wheel">
          <svg viewBox="-120 -120 240 240" aria-hidden="true"></svg>
          <div class="point-name" id="point-name"></div>
        </div>
        <p class="learn-keys">Menu: lessons · View: restart this lesson</p>
      </section>
      <section class="learn-debrief hidden" id="learn-debrief">
        <div>
          <h2 id="learn-title">Lesson</h2>
          <canvas id="learn-track" width="640" height="420"></canvas>
        </div>
        <div>
          <div class="learn-stars" id="learn-stars"></div>
          <p class="learn-note" id="learn-note"></p>
          <div class="tack-list" id="tack-list"></div>
          <p class="learn-keys"><span class="glyph a">A</span> next <span class="glyph b">B</span> lessons</p>
        </div>
      </section>
    `;
    parent.appendChild(host);
    this.root = host;
    this.menu = host.querySelector('#learn-menu')!;
    this.list = host.querySelector('#learn-list')!;
    this.coach = host.querySelector('#coach')!;
    this.kicker = host.querySelector('#coach-kicker')!;
    this.goal = host.querySelector('#coach-goal')!;
    this.line = host.querySelector('#coach-line')!;
    this.wheel = host.querySelector('#pos-wheel')!;
    this.pointName = host.querySelector('#point-name')!;
    this.debrief = host.querySelector('#learn-debrief')!;
    this.stars = host.querySelector('#learn-stars')!;
    this.note = host.querySelector('#learn-note')!;
    this.tacks = host.querySelector('#tack-list')!;
    this.canvas = host.querySelector('#learn-track')!;
    this.list.addEventListener('click', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (!row) return;
      this.onPick(Number(row.dataset.index));
    });
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  show(view: LearnView): void {
    this.root.classList.remove('hidden');
    const menu = view.phase === 'menu';
    const sailing = view.phase === 'sail';
    const done = view.phase === 'debrief';
    this.menu.classList.toggle('hidden', !menu);
    this.coach.classList.toggle('hidden', !sailing);
    this.debrief.classList.toggle('hidden', !done);
    if (menu) this.paintMenu(view);
    if (sailing) this.paintCoach(view);
    if (done) this.paintDebrief(view);
  }

  private paintMenu(view: LearnView): void {
    const key = `${view.cursor}:${view.titles.map((lesson) => lesson.stars).join(',')}`;
    if (key === this.menuKey) return;
    this.menuKey = key;
    this.list.innerHTML = view.titles
      .map((lesson, index) => {
        const on = index === view.cursor ? ' focus' : '';
        return `<button type="button" class="learn-row${on}" data-index="${index}" data-lesson="${index + 1}">
          <b>${index + 1}. ${lesson.title}</b>
          <span>${lesson.blurb}</span>
          <em>${lesson.stars ? starText(lesson.stars) : ''}</em>
        </button>`;
      })
      .join('');
  }

  private paintCoach(view: LearnView): void {
    this.kicker.textContent = `Lesson ${view.lesson} of ${view.lessonCount} · ${view.title}`;
    this.goal.textContent = view.goal;
    this.line.classList.toggle('urgent', view.urgent);
    this.line.innerHTML = coachHtml(view.say);
    this.wheel.classList.toggle('hidden', !view.showWheel);
    if (view.showWheel && view.point) {
      this.pointName.textContent = POINT_LABEL[view.point];
      const svg = this.wheel.querySelector('svg');
      if (svg) svg.innerHTML = wheelSvg(view.point, (view.twa * 180) / Math.PI);
    }
  }

  private paintDebrief(view: LearnView): void {
    const title = this.root.querySelector('#learn-title');
    if (title) title.textContent = view.title;
    this.stars.textContent = starText(view.stars);
    this.note.textContent = view.debrief;
    this.tacks.innerHTML = tackHtml(view.tacks);
    const replay = view.ribbon.length > 1 ? Math.floor(performance.now() / 90) % view.ribbon.length : 0;
    drawRibbon(this.canvas, view.ribbon, view.tacks, replay);
  }
}

function tackHtml(tacks: TackRecord[]): string {
  if (tacks.length === 0) return '';
  return tacks
    .map((tack, index) => {
      const kept = Math.round(tack.kept * 100);
      return `<div class="tack-row"><b>Tack ${index + 1}</b><span>kept ${kept}% · score ${tack.quality.toFixed(2)}</span><em>${starText(tack.stars)}</em></div>`;
    })
    .join('');
}

function polar(degFromUp: number, r: number): [number, number] {
  const rad = (degFromUp * Math.PI) / 180;
  return [Math.sin(rad) * r, -Math.cos(rad) * r];
}

function sector(from: number, to: number, r: number): string {
  const [x0, y0] = polar(from, r);
  const [x1, y1] = polar(to, r);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

function wheelSvg(point: PointOfSail, twaDeg: number): string {
  const arcs = BANDS.map((band) => {
    const on = band.id === point ? 14 : 8;
    const opacity = band.id === point ? 1 : 0.45;
    return `<path d="${sector(band.from, band.to, 78)}" fill="none" stroke="${band.color}" stroke-width="${on}" stroke-linecap="butt" opacity="${opacity}"></path>`;
  }).join('');
  const [nx, ny] = polar(twaDeg, 96);
  return `${arcs}
    <circle cx="0" cy="0" r="6" fill="#f3f7f8"></circle>
    <line x1="0" y1="0" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#ffe08a" stroke-width="4"></line>
    <text x="0" y="-100" text-anchor="middle" fill="#f3f7f8" font-size="16">BOW</text>`;
}

function drawRibbon(
  canvas: HTMLCanvasElement,
  pts: { x: number; y: number }[],
  tacks: TackRecord[],
  replay: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0c2430';
  ctx.fillRect(0, 0, w, h);
  if (pts.length === 0) return;
  let minX = pts[0].x;
  let maxX = pts[0].x;
  let minY = pts[0].y;
  let maxY = pts[0].y;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  for (const t of tacks) {
    minX = Math.min(minX, t.x);
    maxX = Math.max(maxX, t.x);
    minY = Math.min(minY, t.y);
    maxY = Math.max(maxY, t.y);
  }
  const span = Math.max(30, maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const mapX = (x: number) => ((x - (cx - span / 2)) / span) * (w - 48) + 24;
  const mapY = (y: number) => h - 24 - ((y - (cy - span / 2)) / span) * (h - 48);
  ctx.strokeStyle = '#ffe08a';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = mapX(p.x);
    const y = mapY(p.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  for (const t of tacks) {
    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.arc(mapX(t.x), mapY(t.y), 8, 0, Math.PI * 2);
    ctx.fill();
  }
  const dot = pts[Math.min(pts.length - 1, replay)];
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(mapX(dot.x), mapY(dot.y), 7, 0, Math.PI * 2);
  ctx.fill();
}
