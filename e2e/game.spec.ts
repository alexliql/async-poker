import { expect, test } from '@playwright/test';
import { UNDO_MS } from './playwright.config';
import {
  type Player,
  checkOrCall,
  goToTable,
  handNo,
  hostTable,
  joinTable,
  newPlayer,
  startGame,
  whoseTurn,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test('three friends: invite, join, deal, play a hand to showdown, next hand deals itself', async ({
  browser,
  baseURL,
}) => {
  const mia = await newPlayer(browser, baseURL!, 'Mia');
  const jay = await newPlayer(browser, baseURL!, 'Jay', 'Pixel 7');
  const kai = await newPlayer(browser, baseURL!, 'Kai', 'Galaxy S9+');

  const url = await hostTable(mia.page, {
    table: 'Friday Night',
    name: 'Mia',
    phrase: 'Mia never bluffs. Mostly.',
  });
  await expect(mia.page.getByTestId('invite-link')).toContainText(new URL(url).pathname);
  await expect(mia.page.getByRole('button', { name: 'Need at least 2 players' })).toBeDisabled();

  await joinTable(jay.page, url, 'Jay', 'Jay sends his regards.');
  await expect(jay.page.getByText('You’re in, Jay.')).toBeVisible();
  await expect(jay.page.getByText(/Waiting for Mia, the host/)).toBeVisible();

  // The guest list updates live in the host's lobby.
  await expect(mia.page.getByText('Jay', { exact: true })).toBeVisible();

  await joinTable(kai.page, url, 'Kai', 'Read ’em and weep.');
  await expect(mia.page.getByText('Kai', { exact: true })).toBeVisible();
  await expect(jay.page.getByText('3 of 6')).toBeVisible();

  await startGame(mia.page, 3);
  for (const g of [jay, kai]) {
    await expect(g.page.getByText('Mia started the game. You’re dealt in.')).toBeVisible();
    await goToTable(g.page);
  }
  const players: Player[] = [mia, jay, kai];
  for (const p of players) {
    await expect(p.page.getByText('Hand #1 · $1/$2')).toBeVisible();
    await expect(p.page.getByRole('status', { name: 'Pot $3' })).toBeVisible();
    await expect(
      p.page.getByRole('img', { name: /^Your cards: [2-9TJQKA][shdc] [2-9TJQKA][shdc]$/ }),
    ).toBeVisible();
  }

  // Everyone calls or checks to the river; the board grows for everyone at once.
  for (let moves = 0; moves < 20; moves++) {
    if (await mia.page.getByText(/Next hand in \d+s/).isVisible()) break;
    const p = await whoseTurn(players, 4_000).catch(() => null);
    if (!p) continue;
    expect(await handNo(p.page)).toBe(1);
    await checkOrCall(p);
  }

  // Showdown: the full board, every live hand turned over, the same for everyone.
  for (const p of players) {
    await expect(p.page.getByText(/Next hand in \d+s/)).toBeVisible();
    await expect(p.page.getByRole('img', { name: /^Board: (\S\S ){4}\S\S$/ })).toBeVisible();
    await expect(p.page.getByLabel(/^Shows /)).toHaveCount(2);
  }
  const boards = await Promise.all(
    players.map((p) => p.page.getByRole('img', { name: /^Board: / }).getAttribute('aria-label')),
  );
  expect(new Set(boards).size).toBe(1);

  // The next hand deals itself after the pause, with the button moved on.
  for (const p of players) await expect(p.page.getByText('Hand #2 · $1/$2')).toBeVisible({ timeout: 20_000 });
  const stacks = await Promise.all(
    players.map(async (p) =>
      Number((await p.page.getByLabel(/^Your stack \$/).getAttribute('aria-label'))!.replace(/\D/g, '')),
    ),
  );
  // chips are conserved: three stacks plus the posted blinds
  expect(stacks.reduce((a, b) => a + b, 0) + 3).toBe(600);
  for (const p of players) await p.context.close();
});

test('undo takes a move back inside the window; it commits after it', async ({ browser, baseURL }) => {
  const a = await newPlayer(browser, baseURL!, 'Ana');
  const b = await newPlayer(browser, baseURL!, 'Ben');
  const url = await hostTable(a.page, { name: 'Ana' });
  await joinTable(b.page, url, 'Ben');
  await startGame(a.page, 2);
  await goToTable(b.page);

  const p = await whoseTurn([a, b]);
  await p.page.getByRole('button', { name: 'Call $1' }).click();
  await expect(p.page.getByText('Called $1 · sending')).toBeVisible();
  await p.page.getByRole('button', { name: 'Undo' }).click();
  await expect(p.page.getByRole('button', { name: 'Call $1' })).toBeVisible();
  // The other player never saw the undone move.
  const other = p === a ? b : a;
  await expect(other.page.getByText(/Waiting on/)).toBeVisible();

  await p.page.getByRole('button', { name: 'Call $1' }).click();
  await p.page.waitForTimeout(UNDO_MS + 800);
  await expect(p.page.getByRole('button', { name: 'Undo' })).toBeHidden();
  await expect(other.page.getByRole('button', { name: 'Check' })).toBeVisible();
  await a.context.close();
  await b.context.close();
});

test('a pre-selected "call any" fires when the turn comes round', async ({ browser, baseURL }) => {
  const a = await newPlayer(browser, baseURL!, 'Ana');
  const b = await newPlayer(browser, baseURL!, 'Ben');
  const c = await newPlayer(browser, baseURL!, 'Cyd');
  const url = await hostTable(a.page, { name: 'Ana' });
  await joinTable(b.page, url, 'Ben');
  await joinTable(c.page, url, 'Cyd');
  await startGame(a.page, 3);
  await goToTable(b.page);
  await goToTable(c.page);
  const all = [a, b, c];
  const first = await whoseTurn(all);
  const waiting = all.filter((p) => p !== first);
  // One waiting player pre-selects "Call any"
  const pre = waiting[0]!;
  await pre.page.getByRole('button', { name: /Call any/ }).click();
  await expect(pre.page.getByRole('button', { name: /Call any/ })).toHaveAttribute('aria-pressed', 'true');
  // First to act raises
  await first.page.getByRole('button', { name: 'Raise' }).click();
  await first.page.getByRole('button', { name: /^Raise to \$4$/ }).click();
  await expect(first.page.getByText('Raised to $4 · sending')).toBeVisible();
  // When the turn reaches the pre-selector, the call is placed for them, with undo.
  await expect(
    pre.page.getByText(/^Auto-called\. Undo if you changed your mind\.$|Called \$\d+ · sending/).first(),
  ).toBeVisible({ timeout: 20_000 });
  for (const p of all) await p.context.close();
});

test('the host ends the game: everyone sees standings that add up to zero', async ({ browser, baseURL }) => {
  const a = await newPlayer(browser, baseURL!, 'Ana', 'Desktop Chrome');
  await a.page.setViewportSize({ width: 1440, height: 900 });
  const b = await newPlayer(browser, baseURL!, 'Ben');
  const url = await hostTable(a.page, { name: 'Ana', table: 'Last Call' });
  await joinTable(b.page, url, 'Ben');
  await startGame(a.page, 2);
  await goToTable(b.page);
  // Desktop gets both rails
  await expect(a.page.locator('[data-layout="desktop"]')).toBeVisible();
  await expect(a.page.getByText('Chip denominations')).toBeVisible();
  await expect(a.page.getByRole('log', { name: 'Table activity' })).toBeVisible();

  const p = await whoseTurn([a, b]);
  await p.page.getByRole('button', { name: 'Fold', exact: true }).click();
  await expect(p.page.getByText('Folded · sending')).toBeVisible();

  await a.page.getByRole('button', { name: 'Table info and chip values' }).click();
  await a.page.getByRole('button', { name: 'End the game' }).click();
  await expect(a.page.getByText('End the game for everyone?')).toBeVisible();
  await a.page.getByRole('button', { name: 'End the game' }).last().click();
  for (const pl of [a, b]) {
    await expect(pl.page.getByRole('heading', { name: 'Good game.' })).toBeVisible();
    const rows = pl.page.getByRole('list', { name: 'Final standings' }).locator('li');
    await expect(rows).toHaveCount(2);
  }
  const nets = await a.page
    .getByRole('list', { name: 'Final standings' })
    .locator('li .mono')
    .allTextContents();
  const total = nets
    .filter((t) => /\$/.test(t))
    .map((t) => (t.includes('−') ? -1 : 1) * Number(t.replace(/[^0-9]/g, '')))
    .reduce((s, n) => s + n, 0);
  expect(total).toBe(0);
  // Late arrivals can't join a finished game.
  const c = await newPlayer(browser, baseURL!, 'Cyd');
  await c.page.goto(url);
  await expect(c.page.getByRole('heading', { name: 'This game is over.' })).toBeVisible();
  for (const pl of [a, b, c]) await pl.context.close();
});
