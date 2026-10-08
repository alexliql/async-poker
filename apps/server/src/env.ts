import { type CoreSettings, DEFAULT_SETTINGS } from './core';

export interface Env {
  TABLES: DurableObjectNamespace;
  ASSETS: Fetcher;
  /** Optional overrides, used by local end-to-end tests to make time pass quickly. */
  UNDO_MS?: string;
  HAND_PAUSE_MS?: string;
  TURN_TIMER_OVERRIDE_MS?: string;
}

function intVar(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function settingsFromEnv(env: Env): CoreSettings {
  const override = env.TURN_TIMER_OVERRIDE_MS ? intVar(env.TURN_TIMER_OVERRIDE_MS, 0) : 0;
  return {
    undoMs: intVar(env.UNDO_MS, DEFAULT_SETTINGS.undoMs),
    handPauseMs: intVar(env.HAND_PAUSE_MS, DEFAULT_SETTINGS.handPauseMs),
    turnTimerOverrideMs: override >= 1000 ? override : null,
  };
}
