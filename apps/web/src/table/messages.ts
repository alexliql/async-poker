import type { LogEntry, TableView } from '@holdem/engine';
import type { TableUpdate } from '../client/types';
import { money } from '../lib/format';
import { currentHandEntries, nameOf } from './derive';

const PAST = {
  fold: 'folded',
  check: 'checked',
  call: 'called',
  bet: 'bet',
  raise: 'raised',
  allin: 'went all in',
} as const;

/** What it says when it becomes your turn: the move you're facing. */
export function turnMessage(view: TableView): string {
  const you = view.you;
  if (!you) return 'Your move.';
  const entries = currentHandEntries(view);
  const streetStart = entries.findLastIndex((e) => e.k === 'board');
  const aggressive = entries
    .slice(streetStart + 1)
    .filter((e): e is Extract<LogEntry, { k: 'act' }> => e.k === 'act' && e.seat !== you.seat)
    .findLast((e) => e.verb === 'bet' || e.verb === 'raised to' || e.verb === 'went all in');
  if (you.toCall > 0 && aggressive) {
    const who = nameOf(view, aggressive.seat);
    const what =
      aggressive.verb === 'went all in'
        ? 'went all in'
        : `${aggressive.verb} ${money(aggressive.amount ?? 0)}`;
    return `${who} ${what}. Your move.`;
  }
  if (you.toCall > 0) return `${money(you.toCall)} to call. Your move.`;
  if (view.hand?.street === 'preflop') return 'Your option. Your move.';
  return 'Checked to you. Your move.';
}

/** A short line for the toast when something worth saying happens, or null. */
export function toastFor(prev: TableView | null, u: TableUpdate): string | null {
  const view = u.view;
  const me = view.you?.seat ?? -1;
  const entries = u.entries;

  if (!u.jump) {
    const results = entries.filter((e): e is Extract<LogEntry, { k: 'result' }> => e.k === 'result');
    if (results.length) {
      const mine = results.find((r) => r.seat === me);
      const top = results.reduce((a, b) => (b.amount > a.amount ? b : a));
      if (results.length > 1 && results.every((r) => r.label === top.label) && top.label) {
        return mine ? `Split pot. You get ${money(mine.amount)}.` : `Split pot with ${top.label}.`;
      }
      if (mine && mine === top)
        return mine.label ? `${mine.label}. You win ${money(mine.amount)}.` : 'Everyone folded. Pot’s yours.';
      return top.label
        ? `${nameOf(view, top.seat)} wins with ${top.label}.`
        : `${nameOf(view, top.seat)} takes the pot.`;
    }
  }

  const you = view.you;
  const pending = you?.pending;
  if (pending?.auto && !prev?.you?.pending) {
    return `Auto-${PAST[pending.action]}. Undo if you changed your mind.`;
  }
  if (you?.legal && !prev?.you?.legal && (!u.jump || !prev)) {
    if (prev?.you?.pre === 'check' && you.toCall > 0) return `Auto-check skipped. ${turnMessage(view)}`;
    return turnMessage(view);
  }
  if (u.jump) return null;

  for (const e of entries) {
    if (e.k === 'host' && e.seat === me) return 'You’re the host now.';
    if (e.k === 'seat' && e.seat !== me) {
      const who = nameOf(view, e.seat);
      if (e.verb === 'joined') return `${who} joined the table.`;
      if (e.verb === 'rebought') return `${who} busted and rebought. Be safe, buddy.`;
      if (e.verb === 'left') return `${who} left the table.`;
    }
  }
  return null;
}
