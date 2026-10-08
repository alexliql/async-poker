# Architecture

Three packages, one direction of dependency: `apps/web` and `apps/server` both depend on `packages/engine`, and on nothing of each other’s except the wire types the engine exports.

```
 phone / tablet / desktop                     Cloudflare
┌──────────────────────────┐   HTTPS     ┌────────────────────────────────────────────┐
│ React app (apps/web)      │──────────▶ │ Worker (apps/server/src/index.ts)           │
│  RemoteTableClient        │  commands  │  routes, rate limits, link previews         │
│  DisplayQueue → Table     │            │        │ idFromName(slug)                    │
│                           │◀────────── │        ▼                                    │
│                           │ WebSocket  │ TableObject (one Durable Object per table)  │
└──────────────────────────┘ per-seat    │  TableCore → engine.apply → SQLite          │
                              views      │  alarm = the next deadline                  │
                                         └────────────────────────────────────────────┘
```

## The engine (`packages/engine`)

`apply(state, command, actor, { now, randomInt })` is the only way a table changes. It is pure: it clones the state, returns the new state plus log entries, or a rejection with a code. Time and randomness come in through the context, so the same commands replay to the same table.

- **No-limit rules.** Blinds, heads-up button-posts-small-blind, action order per street, minimum raise equal to the last full raise, short all-ins that don’t reopen betting, uncalled-bet refunds, side pots by all-in level, odd chips to the first winner left of the button.
- **Async rules.** Each turn has `deadlineAt`. A `tick` command (sent by the server’s alarm, and run before every other command) settles whatever fell due: undo windows close, timers check or fold for absent players, the next hand deals after a pause. Two timer-driven moves in a row sit a player out; blinds skip them until they come back.
- **Views.** `viewFor(state, seat)` is the only thing that leaves the server. It never includes the deck, other players’ hole cards, or other players’ pending moves and pre-actions.

Tests: scenario tests for every rule above; a property test that plays 150 random games of up to 300 moves each, checking after every move that no chip is created or lost, no card is duplicated, the player to act can act, and no view leaks a hidden card; and the evaluator, checked against the published category counts for all 2,598,960 five-card hands (and, with `test:exhaustive`, all 133,784,560 seven-card hands).

## The server (`apps/server`)

`TableCore` holds everything a table does, independent of Cloudflare, so it is unit-tested with an in-memory store and a fake clock. `TableObject` wraps it with HTTP routes, hibernating WebSockets and the alarm.

- **Ordering.** A Durable Object handles one request at a time, and every state change happens synchronously after the last `await`, so commands never interleave. Each accepted command gets the next sequence number.
- **Storage.** Each command is appended to a `commands` table (with the random draws it used, so the log replays exactly) and the snapshot is replaced in the same transaction.
- **Deadlines.** After every change the alarm is set to the earliest deadline. The alarm handler catches errors and always reschedules, because a missed deadline would freeze the table.
- **Auth.** Joining returns a 256-bit seat token; only its SHA-256 hash is stored. A one-time device code (10 minutes) moves a seat to another device.
- **Idempotency.** Commands carry a `clientId`; a retried request returns the original result instead of acting twice.
- **Link previews.** `/t/:slug` serves the app shell with Open Graph tags filled in; `/og/:slug/invite.png` and `/og/:slug/turn.png` render the preview cards as SVG and rasterize them with resvg.

## The web app (`apps/web`)

- **Clients.** `RemoteTableClient` fetches the first view, then listens on a WebSocket. It reconnects with backoff, catches up from a fresh view on every reconnect and when the tab comes back, and fetches a view itself if a command’s update doesn’t arrive over the socket. `LocalTableClient` runs the engine in the page against bots, for `/demo` and for tests.
- **Display queue.** Updates arrive as whole views. `DisplayQueue` plays them one at a time so each move gets its moment: the moves that closed a street appear first, then the bets slide into the pot, then the cards deal. A backlog plays three times faster, and a catch-up jumps straight to the latest state.
- **Layouts.** The table is drawn at one of five design sizes (phone 390×844, Fold cover 344×972, Fold open 720×840, tablet 1180×820, desktop 1440×900) and scaled to fit the safe area. `?layout=desktop` forces a surface.
- **Screens.** `TableRoute` picks the screen from the view: Join (not seated), Lobby (host) or Waiting (guest) before the deal, the table while playing, Rebuy when you’re out of chips, Sat out when the timer sat you out, and the final standings when the host ends the game.
