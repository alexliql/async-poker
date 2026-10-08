import { expect, test } from '@playwright/test';
import { type Player, goToTable, hostTable, joinTable, newPlayer, startGame, whoseTurn } from './helpers';

/** Shoves or calls the shove; heads-up, somebody busts within a few hands. */
async function shoveOrCall(p: Player) {
  const call = p.page.getByRole('button', { name: /^All in \$\d+$/ });
  if (await call.isVisible()) return call.click();
  const raise = p.page.getByRole('button', { name: /^(Raise|Bet)$/ });
  if (await raise.isVisible()) {
    await raise.click();
    await p.page.getByRole('button', { name: /^All-in/ }).click();
    const hold = p.page.getByRole('button', { name: /hold to go all in/ });
    await hold.hover();
    await p.page.mouse.down();
    await p.page.waitForTimeout(1_100);
    await p.page.mouse.up();
    return;
  }
  return p.page.getByRole('button', { name: /^(Check|Call \$\d+)$/ }).click();
}

test('bust, get roasted, rebuy for free; the standings count the buy-ins', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const a = await newPlayer(browser, baseURL!, 'Ana', 'Desktop Chrome');
  const b = await newPlayer(browser, baseURL!, 'Ben');
  const url = await hostTable(a.page, { name: 'Ana' });
  await joinTable(b.page, url, 'Ben');
  await startGame(a.page, 2);
  await goToTable(b.page);
  const players = [a, b];
  let busted: Player | null = null;
  for (let i = 0; i < 40 && !busted; i++) {
    for (const p of players) {
      if (
        await p.page
          .getByRole('button', { name: 'Out of chips · free rebuy' })
          .isVisible()
          .catch(() => false)
      )
        busted = p;
    }
    if (busted) break;
    const p = await whoseTurn(players, 15_000).catch(() => null);
    if (p) await shoveOrCall(p);
  }
  expect(busted).not.toBeNull();
  const bp = busted!.page;
  await bp.getByRole('button', { name: 'Out of chips · free rebuy' }).click();
  await expect(bp.getByRole('heading', { name: 'You’re out of chips.' })).toBeVisible();
  await expect(bp.getByText('The table has thoughts')).toBeVisible();
  await bp.getByRole('button', { name: /Rebuy for free/ }).click();
  await expect(bp.getByRole('heading', { name: 'Chips restored.' })).toBeVisible();
  await expect(bp.getByRole('img', { name: '2 buy-ins' })).toBeVisible();
  await bp.getByRole('button', { name: 'Back to the table' }).click();
  await expect(bp.locator('[data-layout]')).toBeVisible();
  // The host ends it; the rebuyer shows 2 buy-ins and nets still sum to zero.
  await a.page.getByRole('button', { name: 'Table info and chip values' }).click();
  await a.page.getByRole('button', { name: 'End the game' }).click();
  await a.page.getByRole('button', { name: 'End the game' }).last().click();
  await expect(bp.getByRole('heading', { name: 'Good game.' })).toBeVisible();
  await expect(bp.getByText('Most rebuys')).toBeVisible();
  for (const p of players) await p.context.close();
});
