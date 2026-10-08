# Async Hold’em

No-limit Texas Hold’em for a group chat. The host creates a table and drops the link in the chat; friends buy in with free chips and play at their own pace. You only open the app when it’s your turn.

- **Asynchronous by design.** Every turn has a long timer (5 minutes to 12 hours, picked by the host). Miss it and the table checks or folds for you; miss two in a row and you’re sat out until you come back.
- **Live when people are around.** Every open table gets updates over a WebSocket the moment anyone acts, with animated bets, deals and showdowns.
- **One link does everything.** The invite link unfurls in chats with a preview card; after you act, a “Nudge” button shares a “you’re up” link with its own preview.
- **Every surface.** Phones, Galaxy Fold cover and open screens, tablets and desktops all draw the same table, scaled to fit.

## Quick start

Needs Node 20+ and pnpm 10.

```sh
pnpm install
pnpm dev
```

`pnpm dev` builds the web app and serves it from the Worker at http://localhost:8787.

Open http://localhost:8787, host a table, and open the invite link in a second browser profile (or a private window) to join. To try the table without anyone else, open http://localhost:8787/demo: it runs the real rules engine in the page against five bots.

For UI work with hot reload, run the Worker (the API, on port 8787) in one terminal:

```sh
pnpm --filter @holdem/server dev
```

and Vite (the app, on port 5173, proxying `/api` and `/og` to 8787) in another:

```sh
pnpm --filter @holdem/web dev
```

## Scripts

| Command                                        | What it does                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                    | Unit tests for every package (engine, server, web)                                                                     |
| `pnpm --filter @holdem/engine test:exhaustive` | Scores all 133,784,560 seven-card hands against the published category counts (a few minutes)                          |
| `pnpm e2e`                                     | End-to-end tests: builds the app, starts `wrangler dev` with short timers, and plays real tables with several browsers |
| `pnpm typecheck`                               | TypeScript across the workspace and the e2e suite                                                                      |
| `pnpm lint` / `pnpm format`                    | ESLint / Prettier                                                                                                      |
| `pnpm build`                                   | Production build of the web app (`apps/web/dist`)                                                                      |

The e2e suite uses Playwright’s Chromium. If it isn’t installed, run `pnpm exec playwright install chromium` once.

## Repo layout

| Path                   | What                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine`      | The rules: a pure, deterministic state machine for no-limit Hold’em plus the async rules (timers, undo, pre-actions, sit-out, rebuys). Also the per-seat view and the wire types. No I/O. |
| `apps/server`          | A Cloudflare Worker with one Durable Object per table: SQLite storage, alarms for every deadline, hibernating WebSockets, seat tokens, rate limits and link-preview images.               |
| `apps/web`             | The React app: every screen from the designs, five table layouts, the animation queue and the clients that talk to a table.                                                               |
| `e2e`                  | Playwright tests that run the whole stack locally.                                                                                                                                        |
| `design`               | The interactive design prototypes the app was built from, and their checks.                                                                                                               |
| `docs/architecture.md` | How the pieces fit together, and why.                                                                                                                                                     |

## How a move travels

1. You tap **Call**. The app posts `{ clientId, command }` to `/api/tables/:slug/commands` with your seat token.
2. The table’s Durable Object checks the token, drops duplicates by `clientId`, settles anything that fell due, and runs the command through the engine. A rejected move comes back as a 409 with a reason (`not_your_turn`, say).
3. An accepted move is appended to the table’s command log and the snapshot is replaced, in one SQLite transaction. The move sits in a 5-second undo window; the Durable Object’s alarm commits it when the window closes.
4. Every connected socket gets its **own** view of the table: your hole cards and pending move are never sent to anyone else.
5. The app plays the update through its display queue: chips land, slide into the pot, the next card deals.

More in [docs/architecture.md](docs/architecture.md).

## Deploying

```sh
pnpm build
cd apps/server && npx wrangler deploy
```

This needs a Cloudflare account with Durable Objects (SQLite-backed, available on the free plan). `wrangler.toml` binds the `TABLES` namespace and serves `apps/web/dist` as static assets; `/api/*`, `/t/*` and `/og/*` go to the Worker first. Tables nobody touches for 30 days delete themselves.

Optional Worker variables, used by the e2e tests to make time pass quickly:

| Variable                 | Default | Meaning                                                |
| ------------------------ | ------- | ------------------------------------------------------ |
| `UNDO_MS`                | `5000`  | The undo window after each move                        |
| `HAND_PAUSE_MS`          | `8000`  | How long a finished hand stays up before the next deal |
| `TURN_TIMER_OVERRIDE_MS` | unset   | Replaces every table’s turn timer (testing only)       |

## Decisions made while building

These were open in the build plan; the recommended option was taken in each case.

- **Folding when you could check asks first** (“Checking is free. Fold anyway?”).
- **The turn timer is fixed per table**, chosen by the host at creation.
- **Nudges are links in v1.** After you act, a “Nudge Theo” button shares a “you’re up” link with its own preview card. Push notifications are shown as “Later” on the waiting screen.
- **Tables seat up to 6.** The five layouts were designed around five opponents.
- **Min-raise copy** reads “At least the last raise”, which is the real no-limit rule.

## Design checks

Every table surface is generated from `Main.dc.html`; only the layout id, title and preview size differ. To regenerate and check them all:

```sh
bash design/tools/sync.sh
```

To check a single non-table screen:

```sh
node design/tools/check.js design/screens/Join.dc.html
```

`check.js` verifies tag balance, that every `{{hole}}` resolves, and (with `--table`) plays scripted hands: call-down to showdown, undo, all-in hold, pre-actions, folds, busts and stack carry-over between hands.
