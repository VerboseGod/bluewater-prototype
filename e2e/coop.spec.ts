import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __BLUEWATER__?: {
      getState: () => {
        scenario?: string;
        time: number;
        coop?: { phase: string; call: string; tacks: number; joined: boolean } | null;
      };
      scriptPads: (memory: unknown, now: number) => {
        helmAxes: number[];
        helmButtons: number[];
        crewAxes: number[];
        crewButtons: number[];
        memory: unknown;
      };
    };
    __pads?: { axes: number[]; buttons: { value: number; pressed: boolean }[] }[];
    __midTack?: boolean;
  }
}

test('co-op drill: two virtual pads sail the beat, with no page errors', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.addInitScript(() => {
    const button = (value = 0) => ({ pressed: value > 0.5, value, touched: value > 0 });
    const make = (index: number) => ({
      id: 'Xbox Series Controller (STANDARD GAMEPAD)',
      index,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0] as number[],
      buttons: Array.from({ length: 16 }, () => button(0)),
      timestamp: 0,
      vibrationActuator: { playEffect: async () => 'complete' as const },
    });
    const pads = [make(0), make(1)];
    (window as unknown as { __pads: typeof pads }).__pads = pads;
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => {
        for (const pad of pads) pad.timestamp = performance.now();
        return pads;
      },
    });
  });

  await page.goto('/bluewater-prototype/?scenario=coop&quality=high');
  await page.waitForFunction(() => window.__BLUEWATER__?.getState()?.scenario === 'coop');
  await expect(page.locator('#coop-join')).toBeVisible();
  await page.screenshot({ path: 'test-results/coop-join.png' });

  await page.evaluate(() => {
    let memory: unknown = null;
    const apply = () => {
      const state = window.__BLUEWATER__!.getState();
      const out = window.__BLUEWATER__!.scriptPads(memory, state.time);
      memory = out.memory;
      const pads = window.__pads!;
      pads[0].axes = out.helmAxes.slice();
      pads[1].axes = out.crewAxes.slice();
      for (let i = 0; i < 16; i++) {
        const helm = out.helmButtons[i] ?? 0;
        const crew = out.crewButtons[i] ?? 0;
        pads[0].buttons[i].value = helm;
        pads[0].buttons[i].pressed = helm > 0.5;
        pads[1].buttons[i].value = crew;
        pads[1].buttons[i].pressed = crew > 0.5;
      }
      const call = state.coop?.call;
      if (call === 'window' || call === 'turning') window.__midTack = true;
      if (state.coop?.phase !== 'done') requestAnimationFrame(apply);
    };
    requestAnimationFrame(apply);
  });

  await page.waitForFunction(() => window.__midTack === true, undefined, { timeout: 30_000 });
  await page.screenshot({ path: 'test-results/coop-tack.png' });

  await page.waitForFunction(
    () => window.__BLUEWATER__?.getState()?.coop?.phase === 'done',
    undefined,
    { timeout: 120_000 },
  );
  const done = await page.evaluate(() => window.__BLUEWATER__!.getState().coop);
  expect(done?.tacks).toBeGreaterThanOrEqual(3);
  expect(done?.phase).toBe('done');
  await expect(page.locator('#coop-report')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
