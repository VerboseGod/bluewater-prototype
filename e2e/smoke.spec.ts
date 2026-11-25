import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __BLUEWATER__?: {
      getState: () => { vFwd: number; x: number; heading: number; y?: number };
    };
  }
}

test('beam reach then a tack, with no console errors', async ({ page }) => {
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

  await page.goto('/bluewater-prototype/');
  await page.waitForFunction(() => window.__BLUEWATER__?.getState());

  const setButton = async (index: number, value: number) => {
    await page.evaluate(
      ({ index, value }) => {
        const pad = (window as unknown as { __pad: { buttons: { value: number; pressed: boolean }[] } }).__pad;
        pad.buttons[index].value = value;
        pad.buttons[index].pressed = value > 0.5;
      },
      { index, value },
    );
  };
  const setAxis = async (index: number, value: number) => {
    await page.evaluate(
      ({ index, value }) => {
        (window as unknown as { __pad: { axes: number[] } }).__pad.axes[index] = value;
      },
      { index, value },
    );
  };

  await expect(page.locator('#main-menu')).toBeVisible();
  await setButton(0, 1);
  await page.waitForTimeout(200);
  await setButton(0, 0);
  await expect(page.locator('#main-menu')).toBeHidden();

  await setButton(7, 1);
  await page.waitForTimeout(340);
  await setButton(7, 0);
  await setButton(0, 0.2);

  await page.waitForFunction(
    () => {
      const s = window.__BLUEWATER__?.getState();
      if (!s) return false;
      const dist = Math.hypot(s.x, (s as { y: number }).y);
      return s.vFwd > 1 && dist > 6;
    },
    undefined,
    { timeout: 30_000 },
  );

  const reach = await page.evaluate(() => window.__BLUEWATER__!.getState());
  expect(reach.vFwd).toBeGreaterThan(1);
  expect(Math.hypot(reach.x, (reach as { y: number }).y)).toBeGreaterThan(6);
  await page.screenshot({ path: 'test-results/beam-reach.png' });

  await setAxis(0, -0.42);
  await page.waitForTimeout(8000);
  await setAxis(0, 0);
  await page.waitForTimeout(600);
  const tacked = await page.evaluate(() => window.__BLUEWATER__!.getState());
  expect(Math.abs(tacked.heading - reach.heading)).toBeGreaterThan(0.5);
  await page.screenshot({ path: 'test-results/tack.png' });

  expect(errors, errors.join('\n')).toEqual([]);
});
