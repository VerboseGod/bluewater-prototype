import { describe, expect, it } from 'vitest';
import { boatReadout } from '../src/ui/status';
import { promptsFor } from '../src/ui/prompts';
import { freshWatch, watchGamepad, enableGamepadEmulation } from '../src/ui/watch';
import { loadSettings, saveSettings, type Kv } from '../src/ui/settings';
import { PAD } from '../src/input/standard';

class Memory implements Kv {
  map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const play = {
  screen: 'play' as const,
  mode: 'open' as const,
  assisted: true,
  heeling: false,
  afterTack: false,
  tacking: false,
  intro: false,
};

describe('boat readout', () => {
  it('says what the boat is doing in plain words', () => {
    const reach = boatReadout({ twa: Math.PI / 2, sail: 'trimmed', inIrons: false, capsized: false, heel: 0.02, speedKn: 4.2 });
    expect(reach.point).toBe('Beam reach');
    expect(reach.sail).toBe('Sail drawing');
    expect(reach.line).toContain('4.2 kn');
    const luff = boatReadout({ twa: Math.PI / 2, sail: 'luffing', inIrons: false, capsized: false, heel: 0, speedKn: 1 });
    expect(luff.sail).toBe('Sail luffing, trim in');
    const stalled = boatReadout({ twa: 1.2, sail: 'stalled', inIrons: false, capsized: false, heel: 0.4, speedKn: 3 });
    expect(stalled.sail).toBe('Over-trimmed, ease out');
    expect(stalled.line).toContain('Hike out');
    const irons = boatReadout({ twa: 0.2, sail: 'luffing', inIrons: true, capsized: false, heel: 0, speedKn: 0.2 });
    expect(irons.point).toBe('In irons, no drive');
    const close = boatReadout({ twa: 50 * Math.PI / 180, sail: 'trimmed', inIrons: false, capsized: false, heel: 0, speedKn: 4 });
    expect(close.point).toBe('Close hauled');
  });

  it('names the cause when the boat is capsized or aground', () => {
    const over = boatReadout({ twa: 1, sail: 'stalled', inIrons: false, capsized: true, heel: 1.2, speedKn: 0.4 });
    expect(over.point).toBe('Capsized');
    expect(over.sail).toContain('stay with the boat');
    const mud = boatReadout({ twa: 1, sail: 'trimmed', inIrons: false, capsized: false, heel: 0, speedKn: 0.5, grounded: true });
    expect(mud.point).toBe('Aground');
    expect(mud.sail).toContain('deep water');
  });
});

describe('prompts', () => {
  it('shows only the assisted actions, then replaces the tack prompt', () => {
    const sailing = promptsFor(play).map((prompt) => `${prompt.glyph}:${prompt.label}`);
    expect(sailing).toContain('ls:Steer');
    expect(sailing).toContain('a:Tack');
    expect(sailing).not.toContain('rt:Trim in');
    const after = promptsFor({ ...play, afterTack: true }).map((prompt) => prompt.label);
    expect(after).toContain('Straighten the tiller');
    expect(after).not.toContain('Tack');
    const tacking = promptsFor({ ...play, tacking: true }).map((prompt) => prompt.label);
    expect(tacking).toContain('Tack: turn the bow through the wind');
    expect(tacking).not.toContain('Through the wind');
    const manual = promptsFor({ ...play, assisted: false }).map((prompt) => prompt.label);
    expect(manual).toContain('Trim in');
    expect(manual).toContain('Ease sheet');
  });

  it('uses the same A and B in menus', () => {
    const main = promptsFor({ ...play, screen: 'main' }).map((prompt) => prompt.label);
    expect(main).toEqual(expect.arrayContaining(['Move', 'Select']));
    const pause = promptsFor({ ...play, screen: 'pause' }).map((prompt) => prompt.label);
    expect(pause).toContain('Select');
    expect(pause).toContain('Back');
  });
});

describe('xbox edge hint', () => {
  it('sets the emulation flag only when the browser has it', () => {
    const plain = {};
    expect(enableGamepadEmulation(plain)).toBe(false);
    const edge = { gamepadInputEmulation: 'mouse' };
    expect(enableGamepadEmulation(edge)).toBe(true);
    expect(edge.gamepadInputEmulation).toBe('gamepad');
  });

  it('shows the hint only when a connected pad never delivers events', () => {
    let state = freshWatch();
    state = watchGamepad(state, { connected: true, timestamp: 5, active: false }, 1);
    expect(state.show).toBe(false);
    state = watchGamepad(state, { connected: true, timestamp: 5, active: false }, 3);
    expect(state.show).toBe(true);
    state = watchGamepad(state, { connected: true, timestamp: 9, active: false }, 0.1);
    expect(state.show).toBe(false);
    state = watchGamepad(state, null, 4);
    expect(state.show).toBe(false);
  });
});

describe('settings', () => {
  it('remembers assist, rumble, text size, and a remap', () => {
    const store = new Memory();
    saveSettings({
      assist: 'manual',
      invert: true,
      rumble: false,
      text: 'large',
      remap: { sheetIn: PAD.A, sheetOut: PAD.B, hike: PAD.X, moveIn: PAD.Y },
      introDone: true,
    }, store);
    const loaded = loadSettings(store);
    expect(loaded.assist).toBe('manual');
    expect(loaded.invert).toBe(true);
    expect(loaded.rumble).toBe(false);
    expect(loaded.text).toBe('large');
    expect(loaded.remap.sheetIn).toBe(PAD.A);
    expect(loaded.introDone).toBe(true);
    expect(loadSettings(new Memory()).assist).toBe('assisted');
  });
});
