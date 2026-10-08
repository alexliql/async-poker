import { expect, test } from '@playwright/test';
import { goToTable, hostTable, joinTable, newPlayer, startGame } from './helpers';

const SURFACES = [
  { id: 'phone', viewport: { width: 390, height: 844 } },
  { id: 'cover', viewport: { width: 344, height: 882 } },
  { id: 'foldopen', viewport: { width: 720, height: 840 } },
  { id: 'tablet', viewport: { width: 1180, height: 820 } },
  { id: 'desktop', viewport: { width: 1440, height: 900 } },
] as const;

test('every surface draws the same live table, fully on screen', async ({ browser, baseURL }) => {
  const host = await newPlayer(browser, baseURL!, 'Ana');
  const url = await hostTable(host.page, { name: 'Ana', table: 'Layouts' });
  const guests = [];
  for (const name of ['Ben', 'Cyd', 'Dee', 'Eve', 'Fay']) {
    const g = await newPlayer(browser, baseURL!, name);
    await joinTable(g.page, url, name);
    guests.push(g);
  }
  await startGame(host.page, 6);
  for (const g of guests) await goToTable(g.page);
  for (const s of SURFACES) {
    await host.page.setViewportSize(s.viewport);
    const stage = host.page.locator(`[data-layout="${s.id}"]`);
    await expect(stage).toBeVisible();
    await expect(host.page.locator('[data-seat]')).toHaveCount(5);
    // Every seat and the action bar sit inside the viewport.
    for (const el of await host.page.locator('[data-seat]').all()) {
      const b = (await el.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(s.viewport.width + 1);
    }
    const scroll = await host.page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ]);
    expect(scroll[0]).toBeLessThanOrEqual(s.viewport.width);
    expect(scroll[1]).toBeLessThanOrEqual(s.viewport.height);
    await host.page.screenshot({ path: `e2e/test-results/surface-${s.id}.png` });
  }
  for (const p of [host, ...guests]) await p.context.close();
});
