import type { LegalActions } from '@holdem/engine';
import { useEffect, useRef, useState } from 'react';
import { Chip, Icon, Sheet } from '../components/ui';
import { breakdown } from '../lib/chips';
import { money } from '../lib/format';

const HOLD_MS = 850;

export interface RaiseSheetProps {
  left: number;
  width: number;
  legal: LegalActions;
  currentBet: number;
  potTotal: number;
  bigBlind: number;
  onConfirm: (to: number) => void;
  onClose: () => void;
}

export function raisePresets(legal: LegalActions, currentBet: number, potTotal: number) {
  const toCall = legal.callAmount;
  const clamp = (v: number) => Math.max(legal.minTo, Math.min(legal.maxTo, Math.round(v)));
  return [
    { label: 'Min', amt: legal.minTo },
    { label: '½ Pot', amt: clamp(currentBet + (potTotal + toCall) / 2) },
    { label: 'Pot', amt: clamp(currentBet + potTotal + toCall) },
    { label: 'All-in', amt: legal.maxTo },
  ];
}

export function RaiseSheet({
  left,
  width,
  legal,
  currentBet,
  potTotal,
  bigBlind,
  onConfirm,
  onClose,
}: RaiseSheetProps) {
  const [to, setTo] = useState(legal.minTo);
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBet = currentBet === 0;
  const allIn = to >= legal.maxTo;
  const step = Math.max(1, bigBlind);

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );

  const holdStart = () => {
    if (holding) return;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      setHolding(false);
      onConfirm(legal.maxTo);
    }, HOLD_MS);
  };
  const holdEnd = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
  };

  return (
    <Sheet label={isBet ? 'Bet' : 'Raise'} onClose={onClose} left={left} width={width} gap={16}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="caps">{isBet ? 'Bet' : 'Raise to'}</span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
          of {money(legal.maxTo)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          className="btn neu-sm"
          aria-label={`Lower by ${money(step)}`}
          disabled={to <= legal.minTo}
          onClick={() => setTo((v) => Math.max(legal.minTo, v - step))}
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="minus" width={2.6} />
        </button>
        <span
          className="mono"
          aria-live="polite"
          style={{ fontSize: 46, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}
        >
          {money(to)}
        </span>
        <button
          className="btn neu-sm"
          aria-label={`Raise by ${money(step)}`}
          disabled={to >= legal.maxTo}
          onClick={() => setTo((v) => Math.min(legal.maxTo, v + step))}
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="plus" width={2.6} />
        </button>
      </div>
      <div
        aria-hidden="true"
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 14 }}
      >
        {breakdown(to).map(({ d, n }, ti) => (
          <div
            key={d.v}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 7,
              opacity: n ? 1 : 0.45,
              transition: 'opacity 200ms ease',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: 46,
                height: 60,
                display: 'flex',
                flexDirection: 'column-reverse',
                alignItems: 'center',
              }}
            >
              <div
                className="inset"
                style={{ position: 'absolute', left: 0, bottom: -4, width: 46, height: 14, borderRadius: 7 }}
              />
              {Array.from({ length: Math.min(n, 12) }, (_, k) => (
                <div key={k} className="twchip" style={{ animationDelay: `${ti * 50 + k * 45}ms` }}>
                  <Chip d={d} width={40} />
                </div>
              ))}
            </div>
            <span className="mono" style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>
              {n ? `${n}×$${d.v}` : `$${d.v}`}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="raise-amt" className="caps">
          Amount
        </label>
        <input
          id="raise-amt"
          type="range"
          min={legal.minTo}
          max={legal.maxTo}
          step={1}
          value={to}
          aria-valuetext={money(to)}
          onChange={(e) => setTo(Number(e.target.value))}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {raisePresets(legal, currentBet, potTotal).map((x) => (
          <button
            key={x.label}
            className={x.amt === to ? 'btn inset' : 'btn neu-sm'}
            onClick={() => setTo(x.amt)}
            style={{
              height: 52,
              borderRadius: 16,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800 }}>{x.label}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
              {money(x.amt)}
            </span>
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.7fr', gap: 12 }}>
        <button
          className="btn neu"
          onClick={onClose}
          style={{ height: 56, borderRadius: 18, fontSize: 16, fontWeight: 800 }}
        >
          Cancel
        </button>
        {!allIn ? (
          <button
            className="btn accentBtn"
            onClick={() => onConfirm(to)}
            style={{ height: 56, borderRadius: 18, fontSize: 16, fontWeight: 800 }}
          >
            {isBet ? `Bet ${money(to)}` : `Raise to ${money(to)}`}
          </button>
        ) : (
          <button
            className="btn accentBtn hold"
            aria-label={`Press and hold to go all in for ${money(legal.maxTo)}`}
            onPointerDown={holdStart}
            onPointerUp={holdEnd}
            onPointerLeave={holdEnd}
            onPointerCancel={holdEnd}
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                e.preventDefault();
                holdStart();
              }
            }}
            onKeyUp={holdEnd}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              position: 'relative',
              overflow: 'hidden',
              height: 56,
              borderRadius: 18,
              fontSize: 16,
              fontWeight: 800,
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: holding ? '100%' : '0%',
                background: 'rgba(0,0,0,.2)',
                transition: holding ? `width ${HOLD_MS}ms linear` : 'width 180ms ease',
              }}
            />
            <span style={{ position: 'relative' }}>
              {holding ? 'Keep holding…' : `Hold for all-in ${money(legal.maxTo)}`}
            </span>
          </button>
        )}
      </div>
    </Sheet>
  );
}
