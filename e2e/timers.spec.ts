import { expect, test } from '@playwright/test';
import { TURN_MS } from './playwright.config';
import { goToTable, hostTable, joinTable, newPlayer, startGame, whoseTurn } from './helpers';

test('missed turns auto-act, then sit you out; coming back deals you in', async ({ browser, baseURL }) => {
  test.setTimeout(TURN_MS * 4 + 60_000);
  const a = await newPlayer(browser, baseURL!, 'Ana');
  const b = await newPlayer(browser, baseURL!, 'Ben');
  const c = await newPlayer(browser, baseURL!, 'Cyd');
  const url = await hostTable(a.page, { name: 'Ana' });
  await joinTable(b.page, url, 'Ben');
  await joinTable(c.page, url, 'Cyd');
  await startGame(a.page, 3);
  await goToTable(b.page);
  await goToTable(c.page);
  // Cyd walks away. Everyone else keeps playing; Cyd's timer runs out every time.
  await c.page.close();
  const active = [a, b];
  const deadline = Date.now() + TURN_MS * 4;
  let satOut = false;
  while (Date.now() < deadline && !satOut) {
    const p = await whoseTurn(active, TURN_MS + 10_000).catch(() => null);
    if (p) {
      const call = p.page.getByRole('button', { name: /^(Check|Call \$\d+)$/ });
      if (await call.isVisible()) await call.click();
    }
    satOut = await a.page
      .getByRole('group', { name: /^Cyd, .*Away/ })
      .isVisible()
      .catch(() => false);
  }
  expect(satOut).toBe(true);
  // The activity log shows the timer acted for Cyd.
  await a.page.getByRole('button', { name: 'While you were away' }).click();
  await expect(a.page.getByRole('log').getByText('Timer').first()).toBeVisible();
  await a.page.getByRole('button', { name: 'Back to the table' }).click();

  // Cyd comes back: the seat was kept warm.
  const back = await c.context.newPage();
  await back.goto(url);
  await expect(back.getByRole('heading', { name: 'We kept your seat warm.' })).toBeVisible();
  await expect(back.getByText(/timer ran out twice/)).toBeVisible();
  await back.getByRole('button', { name: 'I’m back · deal me in' }).click();
  await expect(back.getByText('You’re in from the next hand.')).toBeVisible();
  await back.getByRole('button', { name: 'Watch the table' }).click();
  await expect(back.locator('[data-layout]')).toBeVisible();
  for (const p of [a, b, c]) await p.context.close();
});
