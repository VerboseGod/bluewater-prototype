import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMAP,
  PAD,
  edgesOf,
  freshRepeat,
  interpretPad,
  risingEdge,
  stickMenu,
  type PadSample,
} from '../src/input/standard';

function sample(partial: Partial<PadSample> = {}): PadSample {
  return { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), ...partial };
}

function hold(index: number, value = 1): number[] {
  const buttons = Array(16).fill(0);
  buttons[index] = value;
  return buttons;
}

describe('rising edges', () => {
  it('fires once when a button goes down and not while it is held', () => {
    expect(risingEdge(false, true)).toBe(true);
    expect(risingEdge(true, true)).toBe(false);
    expect(risingEdge(true, false)).toBe(false);
    const first = edgesOf(Array(16).fill(false), hold(PAD.A).map((value) => value > 0.5));
    const second = edgesOf(first.map(() => true), hold(PAD.A).map((value) => value > 0.5));
    expect(first[PAD.A]).toBe(true);
    expect(second[PAD.A]).toBe(false);
  });
});

describe('standard gamepad actions', () => {
  const opts = { layout: 'sail' as const, invert: false, remap: DEFAULT_REMAP, repeat: freshRepeat(), dt: 1 / 60 };

  it('keeps the sheet and the hike as levels, and edges the face buttons', () => {
    const pressed = interpretPad(sample({ buttons: hold(PAD.RT, 0.8) }), Array(16).fill(false), opts);
    expect(pressed.sheetIn).toBeCloseTo(0.8);
    expect(pressed.confirmPressed).toBe(false);
    const again = interpretPad(sample({ buttons: hold(PAD.RT, 0.8) }), pressed.nextPrev, { ...opts, repeat: pressed.nextRepeat });
    expect(again.sheetIn).toBeCloseTo(0.8);
    expect(again.confirmPressed).toBe(false);

    const hike = interpretPad(sample({ buttons: hold(PAD.A) }), Array(16).fill(false), opts);
    expect(hike.hike).toBe(1);
    expect(hike.confirmPressed).toBe(true);
    const held = interpretPad(sample({ buttons: hold(PAD.A) }), hike.nextPrev, { ...opts, repeat: hike.nextRepeat });
    expect(held.hike).toBe(1);
    expect(held.confirmPressed).toBe(false);
  });

  it('maps View to the diagram and Menu to pause, and does not reset on View', () => {
    const view = interpretPad(sample({ buttons: hold(PAD.VIEW) }), Array(16).fill(false), opts);
    expect(view.controlsPressed).toBe(true);
    expect(view.pausePressed).toBe(false);
    const menu = interpretPad(sample({ buttons: hold(PAD.MENU) }), Array(16).fill(false), opts);
    expect(menu.pausePressed).toBe(true);
    expect(menu.controlsPressed).toBe(false);
  });

  it('gives D-pad left its own camera instead of a second chase', () => {
    const left = interpretPad(sample({ buttons: hold(PAD.LEFT) }), Array(16).fill(false), opts);
    const up = interpretPad(sample({ buttons: hold(PAD.UP) }), Array(16).fill(false), opts);
    expect(left.camera).toBe('cinema');
    expect(up.camera).toBe('chase');
    expect(left.paddle).toBe(false);
  });

  it('cycles the wind on LB in the dock and paddles on a held D-pad left', () => {
    const dock = { ...opts, layout: 'dock' as const };
    const lb = interpretPad(sample({ buttons: hold(PAD.LB) }), Array(16).fill(false), dock);
    expect(lb.windPressed).toBe(true);
    const again = interpretPad(sample({ buttons: hold(PAD.LB) }), lb.nextPrev, { ...dock, repeat: lb.nextRepeat });
    expect(again.windPressed).toBe(false);
    const paddle = interpretPad(sample({ buttons: hold(PAD.LEFT) }), Array(16).fill(false), dock);
    expect(paddle.paddle).toBe(true);
    expect(paddle.camera).toBeNull();
    const held = interpretPad(sample({ buttons: hold(PAD.LEFT) }), paddle.nextPrev, { ...dock, repeat: paddle.nextRepeat });
    expect(held.paddle).toBe(true);
  });

  it('does not hike when A confirms a menu', () => {
    const menu = { ...opts, layout: 'menu' as const };
    const select = interpretPad(sample({ buttons: hold(PAD.A) }), Array(16).fill(false), menu);
    expect(select.menuConfirm).toBe(true);
    expect(select.confirmPressed).toBe(true);
    expect(select.hike).toBe(0);
    expect(select.sheetIn).toBe(0);
  });

  it('follows a saved remap for the sheet', () => {
    const remap = { ...DEFAULT_REMAP, sheetIn: PAD.RB, sheetOut: PAD.LB };
    const eased = interpretPad(sample({ buttons: hold(PAD.LB, 0.7) }), Array(16).fill(false), { ...opts, remap });
    expect(eased.sheetOut).toBeCloseTo(0.7);
    expect(eased.sheetIn).toBe(0);
    expect(eased.windPressed).toBe(false);
  });

  it('inverts the left stick without touching the triggers', () => {
    const plain = interpretPad(sample({ axes: [0.5, 0, 0, 0] }), Array(16).fill(false), opts);
    const flipped = interpretPad(sample({ axes: [0.5, 0, 0, 0] }), Array(16).fill(false), { ...opts, invert: true });
    expect(plain.rudder).toBeCloseTo(0.5);
    expect(flipped.rudder).toBeCloseTo(-0.5);
  });
});

describe('stick menus', () => {
  it('steps once, then repeats while the stick is held', () => {
    const first = stickMenu(0.8, freshRepeat(), 1 / 60);
    expect(first.down).toBe(true);
    const held = stickMenu(0.8, first.next, 0.05);
    expect(held.down).toBe(false);
    const later = stickMenu(0.8, { dir: 1, held: 0.2 }, 0.05);
    expect(later.down).toBe(true);
    const up = stickMenu(-0.8, freshRepeat(), 1 / 60);
    expect(up.up).toBe(true);
  });
});
