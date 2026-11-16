import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __BLUEWATER__?: {
      getState: () => {
        scenario?: string;
        x: number;
        y: number;
        vFwd: number;
        speed: number;
        heading: number;
      };
    };
  }
}

test('dock scenario: a mocked pad approaches and stops, with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.addInitScript(() => {
    const button = (value = 0) => ({ pressed: value > 0.5, value, touched: value > 0 });
    const pad = {
      id: 'Xbox Series Controller (STANDARD GAMEPAD)',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0] as number[],
      buttons: Array.from({ length: 16 }, () => button(0)),
      timestamp: 0,
      vibrationActuator: { playEffect: async () => 'complete' as const },
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => {
        pad.timestamp = performance.now();
        return [pad];
      },
    });
  });

  await page.goto('/bluewater-prototype/?scenario=dock');
  await page.waitForFunction(() => window.__BLUEWATER__?.getState()?.scenario === 'dock');

  const start = await page.evaluate(() => window.__BLUEWATER__!.getState());
  await page.waitForFunction(
    (x0) => {
      const s = window.__BLUEWATER__?.getState();
      return !!s && s.x > x0 + 1.2;
    },
    start.x,
    { timeout: 20_000 },
  );

  await page.evaluate(() => {
    const pad = (window as unknown as { __pad: { buttons: { value: number; pressed: boolean }[] } }).__pad;
    pad.buttons[6].value = 1;
    pad.buttons[6].pressed = true;
  });

  await page.waitForFunction(
    () => {
      const s = window.__BLUEWATER__?.getState();
      if (!s) return false;
      return s.speed < 0.7;
    },
    undefined,
    { timeout: 20_000 },
  );

  const stopped = await page.evaluate(() => window.__BLUEWATER__!.getState());
  expect(stopped.scenario).toBe('dock');
  expect(stopped.x).toBeGreaterThan(start.x + 1);
  expect(Math.abs(stopped.vFwd)).toBeLessThan(0.8);
  await page.screenshot({ path: 'test-results/dock-stop.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
