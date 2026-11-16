import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __BLUEWATER__?: {
      getState: () => {
        scenario?: string;
        learn?: { completed: number[]; phase: string } | null;
      };
    };
  }
}

test('learn mode: autopilot finishes the wind and beam-reach lessons', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/bluewater-prototype/?scenario=learn&pilot=1');
  await page.waitForFunction(() => window.__BLUEWATER__?.getState()?.scenario === 'learn');
  await expect(page.locator('#coach-line')).toBeVisible();

  await page.waitForFunction(
    () => {
      const learn = window.__BLUEWATER__?.getState()?.learn;
      return !!learn && learn.completed.includes(1) && learn.completed.includes(2);
    },
    undefined,
    { timeout: 70_000 },
  );

  const done = await page.evaluate(() => window.__BLUEWATER__!.getState().learn);
  expect(done?.completed).toEqual(expect.arrayContaining([1, 2]));
  expect(errors, errors.join('\n')).toEqual([]);
});
