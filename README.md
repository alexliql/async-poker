# Async Hold’em

Asynchronous no-limit Texas Hold’em for a group chat: a TypeScript monorepo with a rules engine, a Cloudflare Worker backend and a React web app.

## Layout

| Path                   | What                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `packages/engine`      | Rules engine: pure, deterministic no-limit Hold’em plus the async rules, per-seat views and wire types |
| `apps/server`          | Cloudflare Worker with one Durable Object per table: storage, timers, WebSockets, link previews        |
| `apps/web`             | React app: every screen, five table layouts, live updates, a practice table at `/demo`                 |
| `e2e`                  | Playwright tests that play real tables against the local Worker                                        |
| `design`               | The interactive design prototypes the app was built from                                               |
| `docs/architecture.md` | How the pieces fit together                                                                            |

## Development

Needs Node 20+ and pnpm 10.

```sh
pnpm install
pnpm dev
```

`pnpm dev` builds the app and serves it with the Worker at http://localhost:8787.

## Scripts

| Command          | What it does                                                          |
| ---------------- | --------------------------------------------------------------------- |
| `pnpm test`      | Unit tests for every package                                          |
| `pnpm e2e`       | End-to-end tests (needs `pnpm exec playwright install chromium` once) |
| `pnpm typecheck` | TypeScript across the workspace                                       |
| `pnpm lint`      | ESLint                                                                |
| `pnpm format`    | Prettier                                                              |
| `pnpm build`     | Production build of the web app                                       |
