import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../client/hooks';
import type { Frame } from './queue';

export type ResultStage = 'none' | 'reveal' | 'award' | 'done';

export const STAGE_MS = { revealShowdown: 1_300, revealFold: 350, award: 560, bubble: 3_000 } as const;

/**
 * A finished hand plays out in three beats: cards turn over (reveal), the pot slides to the
 * winner (award), then the table settles (done). A hand that was already over when we arrived
 * goes straight to done.
 */
export function useResultStage(frame: Frame | null): ResultStage {
  const hand = frame?.view.hand;
  const result = hand && hand.street === 'over' ? hand.result : null;
  const key = result && hand ? hand.no : null;
  const live = frame?.live ?? false;
  const showdown = !!result && Object.keys(result.shown).length > 0;
  const [st, setSt] = useState<{ key: number | null; stage: ResultStage }>({ key: null, stage: 'none' });

  useEffect(() => {
    if (key === null) return;
    if (!live) {
      setSt({ key, stage: 'done' });
      return;
    }
    const reveal = showdown ? STAGE_MS.revealShowdown : STAGE_MS.revealFold;
    setSt({ key, stage: 'reveal' });
    const t1 = setTimeout(() => setSt({ key, stage: 'award' }), reveal);
    const t2 = setTimeout(() => setSt({ key, stage: 'done' }), reveal + STAGE_MS.award);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // live and showdown are read when the hand first ends; later frames don't restart it
  }, [key]);

  if (key === null) return 'none';
  if (st.key === key) return st.stage;
  return live ? 'reveal' : 'done';
}

/** Eases a number toward its target, for counters that roll instead of jumping. */
export function useTween(target: number): number {
  const [value, setValue] = useState(target);
  const ref = useRef(value);
  ref.current = value;
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    const step = () => {
      const d = ref.current;
      const n = d + (target - d) * 0.18;
      const next = Math.abs(target - n) < 0.5 ? target : n;
      ref.current = next;
      setValue(next);
      if (next !== target) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}
