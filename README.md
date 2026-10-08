# Async Hold'em

No-limit Texas Hold'em for a group chat. The host creates a table and drops the link in the chat; friends join with free chips and play at their own pace. You only open the app when it's your turn.

## Repo layout

| Path | What |
| --- | --- |
| `design/screens/` | Interactive design prototypes, one `.dc.html` per screen, plus `canvas.json` (the board layout) |
| `design/src/` | Sources for the screens built from the shared base CSS (`Rebuy`, `SatOut`, `Ended`, link previews) |
| `design/tools/` | Prototype checks: tag balance, template holes, and scripted table play-throughs |
| `docs/` | Build plan and architecture notes |

## Design checks

```sh
# every table surface is generated from Main.dc.html; only the layout id, title and preview size differ
bash design/tools/sync.sh

# a single non-table screen
node design/tools/check.js design/screens/Join.dc.html
```

`check.js` verifies tag balance, that every `{{hole}}` resolves, and (with `--table`) plays scripted hands: call-down to showdown, undo, all-in hold, pre-actions, folds, busts and stack carry-over between hands.
