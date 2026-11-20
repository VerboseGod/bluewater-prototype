import type { InputState } from '../input';
import { PAD } from '../input/standard';
import type { Settings } from './settings';
import { GLYPH_LETTER, type GlyphId, type Prompt } from './prompts';
import type { BoatReadout } from './status';

export type Screen = 'main' | 'play' | 'pause' | 'settings' | 'controls' | 'remap';
export type Place = 'open' | 'dock' | 'harbour' | 'learn' | 'coop';

export interface ShellHooks {
  onPlace: (place: Place) => void;
  onResume: () => void;
  onRestart: () => void;
  onMain: () => void;
  onChange: (settings: Settings) => void;
}

const MAIN = [
  ['open', 'Free Sail'],
  ['learn', 'Learn'],
  ['dock', 'Docking'],
  ['harbour', 'Harbour'],
  ['coop', 'Co-op'],
  ['controls', 'Controls'],
  ['settings', 'Settings'],
] as const;

const PAUSE = ['Resume', 'Controls', 'Restart', 'Settings', 'Main menu'] as const;

const BUTTON_NAME = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'Up', 'Down', 'Left', 'Right'];

/**
 * Title, pause, settings, controls, prompts, and the state line.
 * Every screen starts with one focused row. A selects, B goes back.
 */
export class Shell {
  screen: Screen = 'play';
  private index = 0;
  private settings: Settings;
  private remapKey: keyof Settings['remap'] | null = null;
  private hooks: ShellHooks;
  private host: HTMLElement;
  private main: HTMLElement;
  private pause: HTMLElement;
  private settingsEl: HTMLElement;
  private controls: HTMLElement;
  private remapEl: HTMLElement;
  private prompts: HTMLElement;
  private status: HTMLElement;
  private toastEl: HTMLElement;
  private toastAt = 0;
  private toastText = '';
  private intro: HTMLElement;
  private hint: HTMLElement;
  private diagram: HTMLElement;
  private mode: Place = 'open';
  private stack: Screen[] = [];
  private pausedFrom: Screen = 'play';
  private mainKey = '';
  private pauseKey = '';
  private settingsKey = '';

  constructor(parent: HTMLElement, settings: Settings, hooks: ShellHooks) {
    this.settings = settings;
    this.hooks = hooks;
    const host = document.createElement('div');
    host.id = 'shell';
    host.innerHTML = `
      <div id="gamepad-hint" class="banner hidden">Press Menu, then Use game controllers in Edge. The controller is moving a cursor instead of the boat.</div>
      <div id="boat-status" class="boat-status"></div>
      <div id="action-toast" class="action-toast" hidden></div>
      <div id="intro-card" class="intro hidden"></div>
      <div id="prompt-bar" class="prompt-bar"></div>
      <section id="main-menu" class="sheet-menu hidden" data-screen="main">
        <p class="kicker">Project Bluewater</p>
        <h1>Go sailing</h1>
        <p class="lede">One dinghy. Left stick steers. The sail trims itself until you want the sheet.</p>
        <div id="main-list"></div>
      </section>
      <section id="pause-menu" class="sheet-menu hidden" data-screen="pause">
        <p class="kicker">Paused</p>
        <h1>Pause</h1>
        <div id="pause-list"></div>
      </section>
      <section id="settings-menu" class="sheet-menu hidden" data-screen="settings">
        <p class="kicker">Settings</p>
        <h1>Settings</h1>
        <div id="settings-list"></div>
      </section>
      <section id="controls-screen" class="sheet-menu hidden" data-screen="controls">
        <p class="kicker">Controls</p>
        <h1>This controller</h1>
        <div id="pad-diagram"></div>
        <div id="controls-list"></div>
      </section>
      <section id="remap-screen" class="sheet-menu hidden" data-screen="remap">
        <p class="kicker">Remap</p>
        <h1 id="remap-title">Press a button</h1>
        <p class="lede">View and Menu stay where they are. B cancels.</p>
      </section>
    `;
    parent.appendChild(host);
    this.host = host;
    this.main = host.querySelector('#main-menu')!;
    this.pause = host.querySelector('#pause-menu')!;
    this.settingsEl = host.querySelector('#settings-menu')!;
    this.controls = host.querySelector('#controls-screen')!;
    this.remapEl = host.querySelector('#remap-screen')!;
    this.prompts = host.querySelector('#prompt-bar')!;
    this.status = host.querySelector('#boat-status')!;
    this.toastEl = host.querySelector('#action-toast')!;
    this.intro = host.querySelector('#intro-card')!;
    this.hint = host.querySelector('#gamepad-hint')!;
    this.diagram = host.querySelector('#pad-diagram')!;
    this.applyText();
    parent.addEventListener('click', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-shell-index]');
      if (!row || row.closest('section')?.classList.contains('hidden')) return;
      this.index = Number(row.dataset.shellIndex);
      this.activate();
    });
  }

  get modal(): boolean {
    return this.screen === 'pause' || this.screen === 'settings' || this.screen === 'controls' || this.screen === 'remap';
  }

  openMain(): void {
    this.stack = [];
    this.screen = 'main';
    this.index = 0;
    this.paint();
  }

  openPause(): void {
    if (this.screen !== 'pause') this.pausedFrom = this.screen;
    this.screen = 'pause';
    this.index = 0;
    this.paint();
  }

  closeToPlay(): void {
    this.stack = [];
    this.screen = 'play';
    this.remapKey = null;
    this.paint();
  }

  setMode(mode: Place): void {
    this.mode = mode;
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.applyText();
    if (this.screen === 'settings') this.paint();
  }

  /** Move, select, and back. Returns whether the sim should keep stepping. */
  pump(input: InputState): 'modal' | 'menu' | 'play' {
    if (this.screen === 'remap') {
      this.hearRemap(input);
      return 'modal';
    }
    if (input.controlsPressed) {
      if (this.screen === 'controls') this.back();
      else this.openControls();
      return this.gate();
    }
    if (input.pausePressed && this.screen !== 'settings' && this.screen !== 'controls') {
      if (this.screen === 'pause') this.resume();
      else this.openPause();
      return this.gate();
    }
    if (this.screen === 'play') return 'play';
    if (input.menuUp) this.move(-1);
    if (input.menuDown) this.move(1);
    if (input.confirmPressed || input.menuConfirm) this.activate();
    if (input.backPressed || input.menuBack) this.back();
    this.paint();
    return this.gate();
  }

  private gate(): 'modal' | 'menu' | 'play' {
    if (this.modal) return 'modal';
    if (this.screen === 'main') return 'menu';
    return 'play';
  }

  setStatus(readout: BoatReadout, show: boolean): void {
    this.status.classList.toggle('hidden', !show);
    if (!show) return;
    this.status.innerHTML = `<b>${escapeHtml(readout.point)}</b><span>${escapeHtml(readout.sail)}</span><em>${escapeHtml(readout.line)}</em>`;
  }

  setPrompts(prompts: Prompt[]): void {
    this.prompts.innerHTML = prompts
      .map((prompt) => `<span class="prompt"><i class="glyph ${prompt.glyph}">${GLYPH_LETTER[prompt.glyph]}</i> ${escapeHtml(prompt.label)}</span>`)
      .join('');
  }

  toast(text: string): void {
    if (!text || text === this.toastText && performance.now() - this.toastAt < 400) return;
    this.toastText = text;
    this.toastAt = performance.now();
    this.toastEl.hidden = false;
    this.toastEl.textContent = text;
  }

  fadeToast(now: number): void {
    if (this.toastEl.hidden) return;
    if (now - this.toastAt > 1400) this.toastEl.hidden = true;
  }

  setIntro(step: { n: number; title: string; body: string } | null): void {
    this.intro.classList.toggle('hidden', !step);
    if (!step) return;
    this.intro.innerHTML = `<p class="kicker">Step ${step.n} of 3</p><h2>${escapeHtml(step.title)}</h2><p>${escapeHtml(step.body)}</p><p class="keys"><i class="glyph b">B</i> skip</p>`;
  }

  setGamepadHint(show: boolean): void {
    this.hint.classList.toggle('hidden', !show);
  }

  private move(dir: -1 | 1): void {
    const n = this.count();
    if (n <= 0) return;
    this.index = (this.index + dir + n) % n;
  }

  private count(): number {
    if (this.screen === 'main') return MAIN.length;
    if (this.screen === 'pause') return PAUSE.length;
    if (this.screen === 'settings') return 9;
    if (this.screen === 'controls') return 1;
    return 0;
  }

  private activate(): void {
    if (this.screen === 'main') {
      const item = MAIN[this.index];
      if (!item) return;
      if (item[0] === 'controls') this.openControls();
      else if (item[0] === 'settings') this.openSettings();
      else {
        this.closeToPlay();
        this.hooks.onPlace(item[0]);
      }
      return;
    }
    if (this.screen === 'pause') {
      const item = PAUSE[this.index];
      if (item === 'Resume') this.resume();
      else if (item === 'Controls') this.openControls();
      else if (item === 'Restart') {
        this.closeToPlay();
        this.hooks.onRestart();
      } else if (item === 'Settings') this.openSettings();
      else {
        this.hooks.onMain();
        this.openMain();
      }
      return;
    }
    if (this.screen === 'settings') this.activateSetting();
    else if (this.screen === 'controls') this.back();
  }

  private activateSetting(): void {
    const next = { ...this.settings, remap: { ...this.settings.remap } };
    if (this.index === 0) next.assist = next.assist === 'assisted' ? 'manual' : 'assisted';
    else if (this.index === 1) next.invert = !next.invert;
    else if (this.index === 2) next.rumble = !next.rumble;
    else if (this.index === 3) next.text = next.text === 'large' ? 'normal' : 'large';
    else if (this.index === 4) return this.beginRemap('sheetIn');
    else if (this.index === 5) return this.beginRemap('sheetOut');
    else if (this.index === 6) return this.beginRemap('hike');
    else if (this.index === 7) return this.beginRemap('moveIn');
    else {
      this.back();
      return;
    }
    this.settings = next;
    this.applyText();
    this.hooks.onChange(next);
    this.paint();
  }

  private beginRemap(key: keyof Settings['remap']): void {
    this.stack.push(this.screen);
    this.remapKey = key;
    this.screen = 'remap';
    this.paint();
  }

  private hearRemap(input: InputState): void {
    if (input.backPressed || input.menuBack) {
      this.finishRemap(null);
      return;
    }
    const button = input.changedButton;
    if (button == null || !this.remapKey) return;
    if (button === PAD.VIEW || button === PAD.MENU || button === PAD.B) return;
    const next = { ...this.settings, remap: { ...this.settings.remap, [this.remapKey]: button } };
    this.finishRemap(next);
  }

  private finishRemap(next: Settings | null): void {
    this.remapKey = null;
    this.stack.pop();
    this.screen = 'settings';
    this.index = 4;
    if (next) {
      this.settings = next;
      this.hooks.onChange(next);
    }
    this.settingsKey = '';
    this.paint();
  }

  private resume(): void {
    if (this.pausedFrom === 'main') {
      this.openMain();
      return;
    }
    this.closeToPlay();
    this.hooks.onResume();
  }

  private openSettings(): void {
    if (this.screen !== 'settings') this.stack.push(this.screen);
    this.screen = 'settings';
    this.index = 0;
    this.paint();
  }

  private openControls(): void {
    if (this.screen !== 'controls') this.stack.push(this.screen);
    this.screen = 'controls';
    this.index = 0;
    this.diagram.innerHTML = diagramHtml(this.mode);
    this.paint();
  }

  private back(): void {
    if (this.screen === 'main') return;
    if (this.screen === 'pause') {
      this.resume();
      return;
    }
    this.remapKey = null;
    const prev = this.stack.pop() ?? 'play';
    if (prev === 'play') {
      this.closeToPlay();
      this.hooks.onResume();
      return;
    }
    this.screen = prev;
    this.index = 0;
    this.paint();
  }

  private applyText(): void {
    document.documentElement.dataset.text = this.settings.text;
  }

  private paint(): void {
    const show = (el: HTMLElement, on: boolean) => el.classList.toggle('hidden', !on);
    show(this.main, this.screen === 'main');
    show(this.pause, this.screen === 'pause');
    show(this.settingsEl, this.screen === 'settings');
    show(this.controls, this.screen === 'controls');
    show(this.remapEl, this.screen === 'remap');
    this.host.classList.toggle('menu-open', this.screen !== 'play');
    if (this.screen === 'main') this.paintRows('main-list', MAIN.map((item) => item[1]), 'mainKey');
    if (this.screen === 'pause') this.paintRows('pause-list', [...PAUSE], 'pauseKey');
    if (this.screen === 'settings') this.paintSettings();
    if (this.screen === 'controls') this.paintRows('controls-list', ['Back'], 'controls');
    if (this.screen === 'remap' && this.remapKey) {
      const title = this.host.querySelector('#remap-title');
      const names: Record<string, string> = { sheetIn: 'Trim in', sheetOut: 'Ease sheet', hike: 'Hike', moveIn: 'Move in' };
      if (title) title.textContent = `Press a button for ${names[this.remapKey] ?? 'that'}`;
    }
    const focused = this.host.querySelector<HTMLElement>('.ux-row.focus');
    focused?.scrollIntoView({ block: 'nearest' });
  }

  private paintRows(id: string, labels: string[], keyName: 'mainKey' | 'pauseKey' | 'controls'): void {
    const key = `${this.index}:${labels.join('|')}`;
    if (keyName === 'mainKey' && key === this.mainKey) return;
    if (keyName === 'pauseKey' && key === this.pauseKey) return;
    if (keyName === 'mainKey') this.mainKey = key;
    if (keyName === 'pauseKey') this.pauseKey = key;
    const list = this.host.querySelector(`#${id}`);
    if (!list) return;
    list.innerHTML = labels
      .map((label, index) => {
        const on = index === this.index ? ' focus' : '';
        return `<button type="button" class="ux-row${on}" data-shell-index="${index}" data-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
      })
      .join('');
  }

  private paintSettings(): void {
    const s = this.settings;
    const rows = [
      `Assist · ${s.assist === 'assisted' ? 'Assisted' : 'Manual trim'}`,
      `Invert steering · ${s.invert ? 'On' : 'Off'}`,
      `Rumble · ${s.rumble ? 'On' : 'Off'}`,
      `Text size · ${s.text === 'large' ? 'Large' : 'Normal'}`,
      `Remap trim in · ${BUTTON_NAME[s.remap.sheetIn] ?? 'RT'}`,
      `Remap ease · ${BUTTON_NAME[s.remap.sheetOut] ?? 'LT'}`,
      `Remap hike · ${BUTTON_NAME[s.remap.hike] ?? 'A'}`,
      `Remap move in · ${BUTTON_NAME[s.remap.moveIn] ?? 'B'}`,
      'Back',
    ];
    const key = `${this.index}:${rows.join('|')}`;
    if (key === this.settingsKey) return;
    this.settingsKey = key;
    const list = this.host.querySelector('#settings-list');
    if (!list) return;
    list.innerHTML = rows
      .map((label, index) => {
        const on = index === this.index ? ' focus' : '';
        return `<button type="button" class="ux-row${on}" data-shell-index="${index}">${escapeHtml(label)}</button>`;
      })
      .join('');
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (ch) => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'));
}

export function diagramHtml(mode: Place): string {
  const lines = diagramLines(mode);
  const row = (glyph: string, text: string) =>
    `<li><i class="glyph ${glyph}">${GLYPH_LETTER[glyph as GlyphId]}</i><span>${escapeHtml(text)}</span></li>`;
  return `
    <ul class="diagram-list">
      ${row('ls', lines.ls)}
      ${row('rs', lines.rs)}
      ${row('lt', lines.lt)}
      ${row('rt', lines.rt)}
      ${row('lb', lines.lb)}
      ${row('rb', lines.rb)}
      ${row('a', lines.a)}
      ${row('b', lines.b)}
      ${row('x', lines.x)}
      ${row('y', lines.y)}
      ${row('view', lines.view)}
      ${row('menu', lines.menu)}
      ${row('dpad', lines.dpad)}
    </ul>
    <p class="lede">${escapeHtml(lines.notes[0] ?? '')}</p>
  `;
}

function diagramLines(mode: Place): {
  lt: string; rt: string; lb: string; rb: string; ls: string; rs: string;
  a: string; b: string; x: string; y: string; view: string; menu: string; dpad: string;
  notes: string[];
} {
  const common = {
    view: 'Controls',
    menu: 'Pause',
    y: 'Assist',
    x: 'Graphics',
    rs: 'Look',
  };
  if (mode === 'coop') {
    return {
      ...common,
      lt: 'Crew eases',
      rt: 'Crew trims in',
      lb: '—',
      rb: 'Helm calls the tack',
      ls: 'Helm steers',
      a: 'Hike out',
      b: 'Move in',
      y: 'Crew ready',
      x: 'Crew vang',
      dpad: 'Camera',
      notes: ['Two pads, one boat. The second pad is the crew.', 'Y on the crew pad means ready. Y on the helm pad still toggles assist.'],
    };
  }
  if (mode === 'dock') {
    return {
      ...common,
      lt: 'Ease sheet',
      rt: 'Trim in',
      lb: 'Cycle wind',
      rb: 'Mooring line',
      ls: 'Steer',
      a: 'Hike out',
      b: 'Move in',
      rs: 'Anchor',
      dpad: 'Up and down pay scope. Left paddles. Right is the cockpit.',
      notes: ['Come in on a reach, sail eased, at walking pace.', 'If you are too fast, bear away and go round. Never fend off with hands or feet.'],
    };
  }
  if (mode === 'harbour') {
    return {
      ...common,
      lt: 'Ease sheet',
      rt: 'Trim in',
      lb: 'Cycle wind',
      rb: 'Mooring line',
      ls: 'Steer. Click toggles a light tide.',
      a: 'Hike out',
      b: 'Move in',
      rs: 'Anchor',
      dpad: 'Hold left to paddle off the berth.',
      notes: ['Slow speed inside the marina.', 'Hold D-pad left to paddle. A tap used to pretend the left side of the pad paddled, and nothing happened.'],
    };
  }
  if (mode === 'learn') {
    return {
      ...common,
      lt: 'Ease sheet',
      rt: 'Trim in',
      lb: '—',
      rb: 'Mooring line, on the return',
      ls: 'Steer',
      a: 'Select a lesson. While sailing, hike. Tap tacks when assisted.',
      b: 'Back, or move in while sailing',
      dpad: 'Move through the lessons',
      notes: ['A selects in the list. B goes back.', 'Menu opens pause. It used to dump you out of the lesson.'],
    };
  }
  return {
    ...common,
    lt: 'Ease sheet',
    rt: 'Trim in',
    lb: '—',
    rb: '—',
    ls: 'Steer the bow',
    a: 'Tap to tack when assisted. Hold to hike.',
    b: 'Move in',
      dpad: 'Chase, top, cockpit, cinema',
    notes: [
      'Assisted trims the sail for you. Manual trim is in Settings, or it unlocks after the intro.',
      'D-pad left used to select chase, the same as D-pad up. It is the cinematic camera now.',
      'View used to reset the boat with no picture of the controls. Restart is in the pause menu.',
    ],
  };
}
