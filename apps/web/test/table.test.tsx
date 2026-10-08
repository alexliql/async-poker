import type { ClientCommand, TableView } from '@holdem/engine';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClientSnapshot, SendResult, TableClient, TableUpdate } from '../src/client/types';
import { Ended } from '../src/screens/Ended';
import { RaiseSheet, raisePresets } from '../src/table/RaiseSheet';
import { Table } from '../src/table/Table';
import { TestTable } from './helpers';

beforeAll(() => {
  // jsdom lacks these
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as never;
  globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 16)) as never;
  globalThis.cancelAnimationFrame ??= ((id: number) => clearTimeout(id)) as never;
});
afterEach(cleanup);

class FakeClient implements TableClient {
  readonly slug = 'abcdef';
  sent: ClientCommand[] = [];
  constructor(
    private view: TableView,
    private t: TestTable,
  ) {}
  subscribe() {
    return () => undefined;
  }
  getSnapshot(): ClientSnapshot {
    return { status: 'ready', seq: 1, view: this.view, lastSeenAt: null, connection: 'live', error: null };
  }
  onUpdate(_l: (u: TableUpdate) => void) {
    return () => undefined;
  }
  async send(cmd: ClientCommand): Promise<SendResult> {
    this.sent.push(cmd);
    return { ok: true, seq: 2 };
  }
  now() {
    return this.t.now;
  }
  refresh() {}
  close() {}
}

function renderTable(t: TestTable, seat: number, layout: 'phone' | 'desktop' = 'phone') {
  const view = t.view(seat);
  const client = new FakeClient(view, t);
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Table
        client={client}
        frame={{ seq: 1, view, entries: [], live: false, collecting: false }}
        snapshot={client.getSnapshot()}
        layout={layout}
        fromNudge={false}
        onRebuy={() => undefined}
        onLeft={() => undefined}
      />
    </MemoryRouter>,
  );
  return client;
}

describe('the table', () => {
  it('offers fold, call and raise on your turn, and sends the call', async () => {
    const t = new TestTable(3);
    t.do({ type: 'start' }, 0);
    const client = renderTable(t, t.toAct);
    expect(screen.getByRole('button', { name: 'Fold' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Raise' })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Call $2' })));
    expect(client.sent).toEqual([{ type: 'act', action: 'call' }]);
    expect(screen.getByText(/Called \$2 · sending/)).toBeTruthy();
  });

  it('asks before folding when checking is free', async () => {
    const t = new TestTable(2);
    t.do({ type: 'start' }, 0);
    t.do({ type: 'act', action: 'call' }, t.toAct); // button completes, big blind may check
    const client = renderTable(t, t.toAct);
    fireEvent.click(screen.getByRole('button', { name: 'Fold' }));
    expect(screen.getByText('Checking is free. Fold anyway?')).toBeTruthy();
    expect(client.sent).toEqual([]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Fold' })));
    expect(client.sent).toEqual([{ type: 'act', action: 'fold' }]);
  });

  it('shows pre-actions while waiting, and every seat', () => {
    const t = new TestTable(6);
    t.do({ type: 'start' }, 0);
    const waiting = (t.toAct + 2) % 6;
    renderTable(t, waiting);
    expect(screen.getByRole('group', { name: 'Pre-select your next move' })).toBeTruthy();
    expect(document.querySelectorAll('[data-seat]')).toHaveLength(5);
    expect(screen.getByText(/Waiting on/)).toBeTruthy();
  });

  it('opens the raise sheet with legal limits', () => {
    const t = new TestTable(3);
    t.do({ type: 'start' }, 0);
    renderTable(t, t.toAct, 'desktop');
    fireEvent.click(screen.getByRole('button', { name: 'Raise' }));
    const slider = screen.getByLabelText('Amount') as HTMLInputElement;
    expect(slider.min).toBe('4');
    expect(slider.max).toBe('200');
    expect(screen.getByRole('button', { name: /Raise to \$4/ })).toBeTruthy();
  });

  it('opens the rankings from your hand name', () => {
    const t = new TestTable(3);
    t.do({ type: 'start' }, 0);
    renderTable(t, 1);
    fireEvent.click(screen.getByRole('button', { name: /Show hand rankings/ }));
    expect(screen.getByRole('dialog', { name: 'Hand rankings' })).toBeTruthy();
  });
});

describe('raise sheet', () => {
  it('computes presets inside the limits', () => {
    const legal = {
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 4,
      canBet: false,
      canRaise: true,
      minTo: 10,
      maxTo: 120,
    };
    const p = raisePresets(legal, 6, 9);
    expect(p.map((x) => x.amt)).toEqual([10, 13, 19, 120]);
  });
  it('asks you to hold for an all-in', () => {
    vi.useFakeTimers();
    const legal = {
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 4,
      canBet: false,
      canRaise: true,
      minTo: 10,
      maxTo: 12,
    };
    const onConfirm = vi.fn();
    render(
      <RaiseSheet
        left={0}
        width={390}
        legal={legal}
        currentBet={6}
        potTotal={9}
        bigBlind={2}
        onConfirm={onConfirm}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Raise by/ }));
    const hold = screen.getByRole('button', { name: /hold to go all in/ });
    fireEvent.pointerDown(hold);
    act(() => void vi.advanceTimersByTime(400));
    fireEvent.pointerUp(hold);
    act(() => void vi.advanceTimersByTime(1000));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.pointerDown(hold);
    act(() => void vi.advanceTimersByTime(900));
    expect(onConfirm).toHaveBeenCalledWith(12);
    vi.useRealTimers();
  });
});

describe('the end', () => {
  it('shows standings that add up to zero', () => {
    const t = new TestTable(3);
    t.do({ type: 'start' }, 0);
    t.do({ type: 'act', action: 'raise', amount: 10 }, t.toAct);
    t.do({ type: 'act', action: 'fold' }, t.toAct);
    t.do({ type: 'act', action: 'fold' }, t.toAct);
    t.do({ type: 'endGame' }, 0);
    const v = t.view(0);
    expect(v.standings!.reduce((s, p) => s + p.net, 0)).toBe(0);
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Ended view={v} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Good game.')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Final standings' }).querySelectorAll('li')).toHaveLength(3);
  });
});
