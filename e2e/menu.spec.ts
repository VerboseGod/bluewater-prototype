import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __BLUEWATER__?: {
      getState: () => { scenario?: string; x: number; y: number; learn?: { phase: string } | null };
    };
    __pad?: { buttons: { pressed: boolean; value: number }[]; axes: number[] };
  }
}

test('the boat stays still on the main menu', async ({ page }) => {
  await page.addInitScript(() => {
    const button = (value = 0) => ({ pressed: value > 0.5, value, touched: value > 0 });
    const pad = {
      id: 'Xbox Series Controller (STANDARD GAMEPAD)',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0.8, 0, 0, 0],
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
  await expect(page.locator('#main-menu')).toBeVisible();
  const before = await page.evaluate(() => {
    const state = window.__BLUEWATER__!.getState();
    return { x: state.x, y: state.y };
  });
  await page.waitForTimeout(3000);
  await expect(page.locator('#main-menu')).toBeVisible();
  const after = await page.evaluate(() => {
    const state = window.__BLUEWATER__!.getState();
    return { x: state.x, y: state.y };
  });
  expect(after).toEqual(before);
});

test('controller drives the main menu, the pause menu, and a lesson', async ({ page }) => {
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
      axes: [0, 0, 0, 0],
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

  const down = async (index: number) => {
    await page.evaluate((button) => {
      const pad = window.__pad!;
      pad.buttons[button].value = 1;
      pad.buttons[button].pressed = true;
    }, index);
  };
  const up = async (index: number) => {
    await page.evaluate((button) => {
      const pad = window.__pad!;
      pad.buttons[button].value = 0;
      pad.buttons[button].pressed = false;
    }, index);
    await page.waitForTimeout(50);
  };

  await page.goto('/bluewater-prototype/');
  await page.waitForFunction(() => window.__BLUEWATER__?.getState());
  const menu = page.locator('#main-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.ux-row.focus')).toHaveAttribute('data-label', 'Free Sail');

  await down(13);
  await expect(menu.locator('.ux-row.focus')).toHaveAttribute('data-label', 'Learn');
  await up(13);

  await down(0);
  await expect(page.locator('#learn-menu')).toBeVisible();
  await up(0);
  await expect(page.locator('#learn-list .learn-row.focus')).toContainText('Wind and no-go zone');

  await down(13);
  await expect(page.locator('#learn-list .learn-row.focus')).toContainText('Stopping');
  await up(13);

  await down(12);
  await expect(page.locator('#learn-list .learn-row.focus')).toContainText('Wind and no-go zone');
  await up(12);

  await down(0);
  await expect(page.locator('#coach-line')).toBeVisible();
  await up(0);
  await expect(page.locator('#coach-line')).toContainText(/wind|Steer/i);

  await down(9);
  const pause = page.locator('#pause-menu');
  await expect(pause).toBeVisible();
  await up(9);
  await expect(pause.locator('.ux-row.focus')).toHaveAttribute('data-label', 'Resume');

  await down(13);
  await expect(pause.locator('.ux-row.focus')).toHaveAttribute('data-label', 'Controls');
  await up(13);

  await down(0);
  await expect(page.locator('#controls-screen')).toBeVisible();
  await up(0);
  await expect(page.locator('#pad-diagram')).toContainText('Steer');

  await down(1);
  await expect(pause).toBeVisible();
  await up(1);

  await down(1);
  await expect(page.locator('#coach-line')).toBeVisible();
  await up(1);

  expect(errors, errors.join('\n')).toEqual([]);
});
