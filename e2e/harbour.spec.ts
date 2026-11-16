import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __BLUEWATER__?: {
      getState: () => { scenario?: string; harbour?: { phase: string } | null };
    };
  }
}

test('herzliya harbour scenario loads with no page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/bluewater-prototype/?scenario=harbour');
  await page.waitForFunction(() => window.__BLUEWATER__?.getState?.().scenario === 'harbour');
  const state = await page.evaluate(() => window.__BLUEWATER__!.getState());
  expect(state.scenario).toBe('harbour');
  expect(state.harbour?.phase).toBe('berth');
  await page.waitForTimeout(1500);
  expect(errors, errors.join('\n')).toEqual([]);
});
