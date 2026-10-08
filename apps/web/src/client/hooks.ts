import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DisplayQueue, type Frame } from '../table/queue';
import type { ClientSnapshot, TableClient, TableUpdate } from './types';
import { EMPTY_SNAPSHOT } from './types';

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const noop = () => () => undefined;

export function useSnapshot(client: TableClient | null): ClientSnapshot {
  return useSyncExternalStore(client ? (l) => client.subscribe(l) : noop, () =>
    client ? client.getSnapshot() : EMPTY_SNAPSHOT,
  );
}

/** The frame the table should draw, paced by the display queue. */
export function useFrame(client: TableClient | null): Frame | null {
  const [frame, setFrame] = useState<Frame | null>(null);
  useEffect(() => {
    if (!client) return;
    const queue = new DisplayQueue(setFrame, {
      reducedMotion: prefersReducedMotion,
      hidden: () => document.visibilityState === 'hidden',
    });
    const snap = client.getSnapshot();
    if (snap.view) queue.push({ seq: snap.seq, view: snap.view, entries: [], jump: true });
    const off = client.onUpdate((u) => queue.push(u));
    const onVis = () => {
      if (document.visibilityState === 'visible') queue.flush();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      off();
      document.removeEventListener('visibilitychange', onVis);
      queue.dispose();
    };
  }, [client]);
  return frame;
}

/** Every update as it arrives (for toasts and nudges), without pacing. */
export function useUpdates(client: TableClient | null, fn: (u: TableUpdate) => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!client) return;
    return client.onUpdate((u) => ref.current(u));
  }, [client]);
}

/** Server time, refreshed every `everyMs`. */
export function useNow(client: TableClient | null, everyMs = 1_000): number {
  const read = () => (client ? client.now() : Date.now());
  const [now, setNow] = useState(read);
  useEffect(() => {
    setNow(read());
    const id = setInterval(() => setNow(read()), everyMs);
    return () => clearInterval(id);
  }, [client, everyMs]);
  return now;
}

/** Window size, following the visual viewport where there is one. */
export function useViewport(): { w: number; h: number } {
  const read = () => ({
    w: window.innerWidth,
    h: window.innerHeight,
  });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return vp;
}
