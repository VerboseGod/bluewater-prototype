import type { CoopReport, CoopView } from './session';

/** Join card, the split helm/crew panels, and the per-role debrief. */
export class CoopOverlay {
  private join: HTMLElement;
  private split: HTMLElement;
  private report: HTMLElement;
  private banner: HTMLElement;
  private helmLine: HTMLElement;
  private crewLine: HTMLElement;
  private helmRudder: HTMLElement;
  private helmWeight: HTMLElement;
  private sheet: HTMLElement;
  private vang: HTMLElement;
  private crewWeight: HTMLElement;
  private stats: HTMLElement;
  private helmNote: HTMLElement;
  private crewNote: HTMLElement;
  onJoin: () => void = () => undefined;
  onAi: () => void = () => undefined;

  constructor(parent: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'coop hidden';
    root.innerHTML = `
      <div class="coop-join" id="coop-join">
        <p class="coop-kicker">Local couch co-op</p>
        <h1>Co-op crew</h1>
        <p class="coop-lede">Helm steers, hikes, and calls the tack. Crew trims the main, works the vang, and hikes.</p>
        <p class="coop-big">Press A on a second controller</p>
        <p class="coop-keys">One keyboard: helm is WASD, crew is IJKL. U joins as crew. Enter sails with an AI crew.</p>
        <div class="coop-actions">
          <button type="button" id="coop-join-key">Join on this keyboard</button>
          <button type="button" id="coop-ai">Sail with AI crew</button>
        </div>
      </div>
      <div class="coop-banner hidden" id="coop-banner"></div>
      <div class="coop-split hidden" id="coop-split">
        <section class="coop-panel">
          <h2>Helm</h2>
          <div class="coop-row">Tiller <b id="coop-rudder-word"></b></div>
          <div class="bar"><i id="coop-rudder"></i></div>
          <div class="coop-row">Weight</div>
          <div class="bar"><i id="coop-helm-weight"></i></div>
          <p id="coop-helm-line"></p>
          <p class="coop-keys">Stick steers · A hikes · B sits in · RB ready about</p>
        </section>
        <section class="coop-panel">
          <h2>Crew</h2>
          <div class="coop-row">Mainsheet</div>
          <div class="bar"><i id="coop-sheet"></i><em class="mark" id="coop-sheet-mark"></em></div>
          <div class="coop-row">Vang</div>
          <div class="bar"><i id="coop-vang"></i></div>
          <div class="coop-row">Trapeze</div>
          <div class="bar"><i id="coop-crew-weight"></i></div>
          <p id="coop-crew-line"></p>
          <p class="coop-keys">Triggers sheet · A trapeze · B in · Y ready · X vang</p>
        </section>
      </div>
      <div class="coop-report hidden" id="coop-report">
        <h2>Co-op debrief</h2>
        <div class="stats" id="coop-stats"></div>
        <div class="coop-role"><h3>Helm</h3><p id="coop-helm-note"></p></div>
        <div class="coop-role"><h3>Crew</h3><p id="coop-crew-note"></p></div>
      </div>
    `;
    parent.appendChild(root);
    this.join = root.querySelector('#coop-join')!;
    this.split = root.querySelector('#coop-split')!;
    this.report = root.querySelector('#coop-report')!;
    this.banner = root.querySelector('#coop-banner')!;
    this.helmLine = root.querySelector('#coop-helm-line')!;
    this.crewLine = root.querySelector('#coop-crew-line')!;
    this.helmRudder = root.querySelector('#coop-rudder')!;
    this.helmWeight = root.querySelector('#coop-helm-weight')!;
    this.sheet = root.querySelector('#coop-sheet')!;
    this.vang = root.querySelector('#coop-vang')!;
    this.crewWeight = root.querySelector('#coop-crew-weight')!;
    this.stats = root.querySelector('#coop-stats')!;
    this.helmNote = root.querySelector('#coop-helm-note')!;
    this.crewNote = root.querySelector('#coop-crew-note')!;
    root.querySelector<HTMLButtonElement>('#coop-join-key')!.addEventListener('click', () => this.onJoin());
    root.querySelector<HTMLButtonElement>('#coop-ai')!.addEventListener('click', () => this.onAi());
    this.root = root;
  }

  readonly root: HTMLElement;

  hide(): void {
    this.root.classList.add('hidden');
  }

  showJoin(): void {
    this.root.classList.remove('hidden');
    this.join.classList.remove('hidden');
    this.split.classList.add('hidden');
    this.banner.classList.add('hidden');
    this.report.classList.add('hidden');
  }

  showSail(view: CoopView): void {
    this.root.classList.remove('hidden');
    this.join.classList.add('hidden');
    this.report.classList.add('hidden');
    this.split.classList.remove('hidden');
    this.banner.classList.remove('hidden');
    this.banner.textContent = view.banner;
    this.helmLine.textContent = view.helmLine;
    this.crewLine.textContent = view.crewLine;
    const rudderPct = Math.max(0, Math.min(100, (view.rudder + 1) * 50));
    this.helmRudder.style.width = `${rudderPct}%`;
    this.helmWeight.style.width = `${alongPct(view.helmAlong)}%`;
    this.sheet.style.width = `${Math.round(view.sheet * 100)}%`;
    const mark = this.root.querySelector<HTMLElement>('#coop-sheet-mark')!;
    mark.style.left = `${Math.round(view.suggested * 100)}%`;
    this.vang.style.width = `${Math.round(view.vang * 100)}%`;
    this.crewWeight.style.width = `${alongPct(view.crewAlong)}%`;
  }

  showReport(report: CoopReport): void {
    this.root.classList.remove('hidden');
    this.join.classList.add('hidden');
    this.split.classList.add('hidden');
    this.banner.classList.add('hidden');
    this.report.classList.remove('hidden');
    const time = report.time;
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    this.stats.innerHTML = `
      <div class="stat"><b>${mins}:${secs.toString().padStart(2, '0')}</b><span>Time</span></div>
      <div class="stat"><b>${report.tacks}</b><span>Tacks</span></div>
      <div class="stat"><b>${report.tackQuality.toFixed(2)}</b><span>Tack quality</span></div>
      <div class="stat"><b>${Math.round(report.sync * 100)}</b><span>Crew sync</span></div>
    `;
    this.helmNote.textContent = report.helm;
    this.crewNote.textContent = report.crew;
  }
}

function alongPct(along: number): number {
  return Math.max(0, Math.min(100, ((along + 0.45) / 1.5) * 100));
}
