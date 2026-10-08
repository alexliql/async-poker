import { expect, test } from '@playwright/test';
import { goToTable, hostTable, joinTable, newPlayer, startGame, whoseTurn } from './helpers';

test('a reload mid-hand comes back to the same hand and the same cards', async ({ browser, baseURL }) => {
  const a = await newPlayer(browser, baseURL!, 'Ana');
  const b = await newPlayer(browser, baseURL!, 'Ben');
  const url = await hostTable(a.page, { name: 'Ana' });
  await joinTable(b.page, url, 'Ben');
  await startGame(a.page, 2);
  await goToTable(b.page);
  const cards = await b.page.getByRole('img', { name: /^Your cards/ }).getAttribute('aria-label');
  await b.page.reload();
  await expect(b.page.getByRole('img', { name: /^Your cards/ })).toHaveAttribute('aria-label', cards!);
  await expect(b.page.getByText('Hand #1 · $1/$2')).toBeVisible();
  await a.context.close();
  await b.context.close();
});

test('going offline shows it, and coming back catches up on what was missed', async ({
  browser,
  baseURL,
}) => {
  const a = await newPlayer(browser, baseURL!, 'Ana');
  const b = await newPlayer(browser, baseURL!, 'Ben');
  const url = await hostTable(a.page, { name: 'Ana' });
  await joinTable(b.page, url, 'Ben');
  await startGame(a.page, 2);
  await goToTable(b.page);
  const actor = await whoseTurn([a, b]);
  const watcher = actor === a ? b : a;
  await watcher.context.setOffline(true);
  await expect(watcher.page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
  await actor.page.getByRole('button', { name: 'Call $1' }).click();
  await expect(actor.page.getByText('Called $1 · sending')).toBeHidden({ timeout: 10_000 });
  await watcher.context.setOffline(false);
  await expect(watcher.page.getByRole('status').filter({ hasText: /Offline|Reconnecting/ })).toBeHidden({
    timeout: 20_000,
  });
  // The missed call is there: it's now the watcher's option to check.
  await expect(watcher.page.getByRole('button', { name: 'Check' })).toBeVisible();
  await a.context.close();
  await b.context.close();
});

test('table links unfurl in chats with a title, description and image', async ({
  browser,
  baseURL,
  request,
}) => {
  const a = await newPlayer(browser, baseURL!, 'Ana');
  const url = await hostTable(a.page, { name: 'Ana', table: 'Poker Club' });
  const slug = new URL(url).pathname.split('/').pop()!;
  const html = await (await request.get(`/t/${slug}`)).text();
  expect(html).toContain('<meta property="og:title" content="Poker Club Hold’em">');
  expect(html).toMatch(
    /og:description" content="Ana invited you · 1 seated · 5 open · \$1\/\$2 blinds · \$200 free buy-in/,
  );
  const img = /og:image" content="([^"]+)"/.exec(html)![1]!;
  const png = await request.get(new URL(img).pathname + new URL(img).search);
  expect(png.headers()['content-type']).toBe('image/png');
  const body = await png.body();
  expect(body.subarray(1, 4).toString()).toBe('PNG');
  expect(body.readUInt32BE(16)).toBe(1200);
  expect(body.readUInt32BE(20)).toBe(630);
  await a.context.close();
});

test('a one-time link opens your seat on another device', async ({ browser, baseURL }) => {
  const a = await newPlayer(browser, baseURL!, 'Ana');
  const b = await newPlayer(browser, baseURL!, 'Ben');
  const url = await hostTable(a.page, { name: 'Ana' });
  await joinTable(b.page, url, 'Ben');
  await startGame(a.page, 2);
  await a.page.getByRole('button', { name: 'Table info and chip values' }).click();
  await a.page.getByRole('button', { name: 'Other device' }).click();
  const box = a.page.getByRole('dialog', { name: 'Open on another device' }).locator('.inset.mono');
  await expect(box).toContainText('/device/');
  const link = (await box.textContent())!.trim();

  const laptop = await newPlayer(browser, baseURL!, 'Ana laptop', 'Desktop Chrome');
  await laptop.page.goto(link);
  await expect(laptop.page.locator('[data-layout]')).toBeVisible();
  await expect(laptop.page.getByText('Hand #1 · $1/$2')).toBeVisible();
  const mine = await a.page.getByRole('img', { name: /^Your cards/ }).getAttribute('aria-label');
  await expect(laptop.page.getByRole('img', { name: /^Your cards/ })).toHaveAttribute('aria-label', mine!);
  // The link works once.
  const thief = await newPlayer(browser, baseURL!, 'Thief');
  await thief.page.goto(link);
  await expect(thief.page.getByText('That link didn’t work.')).toBeVisible();
  for (const p of [a, b, laptop, thief]) await p.context.close();
});

test('the host can remove a guest from the lobby', async ({ browser, baseURL }) => {
  const a = await newPlayer(browser, baseURL!, 'Ana');
  const b = await newPlayer(browser, baseURL!, 'Ben');
  const url = await hostTable(a.page, { name: 'Ana' });
  await joinTable(b.page, url, 'Ben');
  await expect(b.page.getByText('You’re in, Ben.')).toBeVisible();
  await a.page.getByRole('button', { name: 'Remove Ben' }).click();
  await expect(b.page.getByText('You’re not at this table anymore.')).toBeVisible();
  await expect(a.page.getByRole('button', { name: 'Need at least 2 players' })).toBeVisible();
  // Ben can buy back in.
  await b.page.getByRole('button', { name: 'Rejoin' }).click();
  await expect(b.page.getByText('You’re invited')).toBeVisible();
  await a.context.close();
  await b.context.close();
});

test('names and colors are unique at a table', async ({ browser, baseURL }) => {
  const a = await newPlayer(browser, baseURL!, 'Ana');
  const b = await newPlayer(browser, baseURL!, 'Ben');
  const url = await hostTable(a.page, { name: 'Ana' });
  await b.page.goto(url);
  await b.page.getByLabel('Your name').fill('ana');
  await b.page.getByRole('button', { name: /Buy in for free/ }).click();
  await expect(b.page.getByRole('alert')).toHaveText('Someone here already has that name');
  // Ana's color is offered but disabled.
  await b.page.getByRole('button', { name: /Your color/ }).click();
  await expect(b.page.getByRole('radio', { name: /taken by Ana/ })).toBeDisabled();
  await a.context.close();
  await b.context.close();
});
