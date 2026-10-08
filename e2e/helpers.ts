import { type Browser, type BrowserContext, type Page, devices, expect } from '@playwright/test';

export interface Player {
  name: string;
  page: Page;
  context: BrowserContext;
}

export async function newPlayer(
  browser: Browser,
  baseURL: string,
  name: string,
  device = 'iPhone 13',
): Promise<Player> {
  const { defaultBrowserType: _ignored, ...d } = devices[device]!;
  const context = await browser.newContext({ ...d, baseURL });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`[${name}] page error:`, e.message));
  return { name, context, page };
}

/** The host fills in the Create screen and lands in the lobby. Returns the table URL. */
export async function hostTable(
  page: Page,
  opts: { table?: string; name: string; phrase?: string; timer?: string } = { name: 'Mia' },
): Promise<string> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Host a table' })).toBeVisible();
  if (opts.table) await page.getByLabel('Table name').fill(opts.table);
  await page.getByLabel('You’ll sit as').fill(opts.name);
  if (opts.phrase) await page.getByLabel('Catchphrase').fill(opts.phrase);
  if (opts.timer) await page.getByRole('button', { name: opts.timer }).click();
  await page.getByRole('button', { name: 'Create table' }).click();
  await expect(page.getByText('Lobby · you’re hosting')).toBeVisible();
  await expect(page).toHaveURL(/\/t\/[a-z2-9]{6}$/);
  return page.url();
}

/** A guest opens the invite, buys in and takes a seat. */
export async function joinTable(page: Page, url: string, name: string, phrase = ''): Promise<void> {
  await page.goto(url);
  await expect(page.getByText('You’re invited')).toBeVisible();
  await page.getByLabel('Your name').fill(name);
  if (phrase) await page.getByLabel('Catchphrase').fill(phrase);
  await page.getByRole('button', { name: /Buy in for free/ }).click();
  await expect(page.getByText(/in free chips/)).toBeVisible();
  await page.getByRole('button', { name: 'Take your seat' }).click();
}

export async function startGame(host: Page, players: number): Promise<void> {
  await host.getByRole('button', { name: `Deal the first hand · ${players} players` }).click();
  await expect(
    host
      .getByRole('button', { name: 'Fold', exact: true })
      .or(host.getByRole('group', { name: 'Pre-select your next move' }))
      .first(),
  ).toBeVisible();
}

export async function goToTable(guest: Page): Promise<void> {
  await guest.getByRole('button', { name: 'Go to the table' }).click();
  await expect(guest.locator('[data-layout]')).toBeVisible();
}

/** Whose turn it is: the one page showing the action buttons. */
export async function whoseTurn(players: Player[], timeout = 20_000): Promise<Player> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const p of players) {
      if (
        await p.page
          .getByRole('button', { name: 'Fold', exact: true })
          .isVisible()
          .catch(() => false)
      )
        return p;
    }
    await players[0]!.page.waitForTimeout(150);
  }
  throw new Error('Nobody got a turn');
}

/** Checks if free, else calls. Waits for the move to go through the undo window. */
export async function checkOrCall(p: Player): Promise<string> {
  const btn = p.page.getByRole('button', { name: /^(Check|Call \$\d+|All in \$\d+)$/ });
  const label = (await btn.textContent())!.trim();
  await btn.click();
  await expect(p.page.getByText(/· sending/)).toBeVisible();
  await expect(p.page.getByText(/· sending/)).toBeHidden({ timeout: 10_000 });
  return label;
}

export async function handNo(page: Page): Promise<number> {
  const text = await page
    .getByText(/^Hand #\d+/)
    .first()
    .textContent();
  return Number(/#(\d+)/.exec(text ?? '')![1]);
}

export async function potText(page: Page): Promise<string | null> {
  const pot = page.getByRole('status', { name: /^Pot \$/ });
  return (await pot.isVisible().catch(() => false)) ? await pot.getAttribute('aria-label') : null;
}
