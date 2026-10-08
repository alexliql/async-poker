import { BLIND_OPTIONS, MAX_SEATS, MIN_SEATS, STACK_OPTIONS, TURN_TIMERS } from '@holdem/engine';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../client/api';
import { NameFields } from '../components/NameFields';
import { CardPair, Field, Icon, Segmented } from '../components/ui';
import { getProfile, setProfile, setSeat } from '../lib/storage';

export interface CreatePrefill {
  tableName?: string;
  smallBlind?: number;
  buyIn?: number;
  turnTimerMs?: number;
  maxSeats?: number;
}

function defaultTableName(): string {
  return `${new Date().toLocaleDateString('en-US', { weekday: 'long' })} Night`;
}

export function Create() {
  const navigate = useNavigate();
  const prefill = (useLocation().state ?? {}) as CreatePrefill;
  const profile = getProfile();
  const [tableName, setTableName] = useState(prefill.tableName ?? defaultTableName());
  const [name, setName] = useState(profile?.name ?? '');
  const [color, setColor] = useState(profile?.color ?? 'sage');
  const [phrase, setPhrase] = useState(profile?.phrase ?? '');
  const [sb, setSb] = useState<number>(prefill.smallBlind ?? 1);
  const [buyIn, setBuyIn] = useState<number>(prefill.buyIn ?? 200);
  const [timer, setTimer] = useState<number>(prefill.turnTimerMs ?? TURN_TIMERS[4].ms);
  const [seats, setSeats] = useState(prefill.maxSeats ?? MAX_SEATS);
  const [hintV, setHintV] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Host a table · Async Hold’em';
  }, []);

  const blinds = BLIND_OPTIONS.find((b) => b.sb === sb) ?? BLIND_OPTIONS[0];
  const missing = !tableName.trim() ? 'Name your table' : !name.trim() ? 'Add your name' : null;
  const tooShort = buyIn < blinds.bb * 10;

  const create = async () => {
    if (missing || busy || tooShort) return;
    setBusy(true);
    setError(null);
    try {
      const grant = await api.createTable({
        tableName: tableName.trim(),
        name: name.trim(),
        color,
        phrase: phrase.trim(),
        smallBlind: blinds.sb,
        bigBlind: blinds.bb,
        buyIn,
        turnTimerMs: timer,
        maxSeats: seats,
      });
      setSeat(grant.slug, { seat: grant.seat, token: grant.token });
      setProfile({ name: name.trim(), color, phrase: phrase.trim() });
      navigate(`/t/${grant.slug}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t create the table. Try again.');
      setBusy(false);
    }
  };

  const hint = TURN_TIMERS.find((t) => t.ms === timer)?.hint ?? '';

  return (
    <main className="screen">
      <form
        className="screen-col"
        style={{ gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <CardPair />
        <h1 className="h1">Host a table</h1>

        <Field id="table-name" label="Table name">
          <input
            id="table-name"
            className="field inset"
            type="text"
            maxLength={24}
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            style={{ height: 54, padding: '0 18px', borderRadius: 18, fontSize: 17, fontWeight: 700 }}
          />
        </Field>

        <NameFields
          idPrefix="host"
          nameLabel="You’ll sit as"
          name={name}
          onName={setName}
          namePlaceholder="Your name"
          color={color}
          onColor={setColor}
          phrase={phrase}
          onPhrase={setPhrase}
          phrasePlaceholder={`${name.trim() || 'Mia'} never bluffs. Mostly.`}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <span className="caps">Blinds</span>
            <Segmented
              label="Blinds"
              fontSize={13}
              options={BLIND_OPTIONS.map((b) => ({ value: b.sb, label: b.label }))}
              value={sb}
              onChange={setSb}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <span className="caps">Starting stack</span>
            <Segmented
              label="Starting stack"
              fontSize={13}
              options={STACK_OPTIONS.map((v) => ({ value: v as number, label: `$${v}` }))}
              value={buyIn}
              onChange={setBuyIn}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="caps">Turn timer</span>
          <Segmented
            label="Turn timer"
            options={TURN_TIMERS.map((t) => ({ value: t.ms as number, label: t.label, long: t.long }))}
            value={timer}
            onChange={(v) => {
              if (v !== timer) setHintV((n) => n + 1);
              setTimer(v);
            }}
          />
          <span key={hintV} className="swap" style={{ fontSize: 13, color: 'var(--muted)' }}>
            {tooShort
              ? `A $${buyIn} stack is too short for $${blinds.sb}/$${blinds.bb} blinds. Pick a bigger stack.`
              : hint}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="caps">Seats</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Up to {MAX_SEATS} at one table</span>
          </div>
          <div
            className="inset"
            style={{
              height: 50,
              borderRadius: 25,
              padding: '0 5px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <button
              type="button"
              className="btn neu-sm"
              aria-label="Fewer seats"
              disabled={seats <= MIN_SEATS}
              onClick={() => setSeats((n) => Math.max(MIN_SEATS, n - 1))}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="minus" size={16} width={2.5} />
            </button>
            <span
              className="mono"
              aria-live="polite"
              aria-label={`${seats} seats`}
              style={{ width: 34, textAlign: 'center', fontSize: 19, fontWeight: 700 }}
            >
              {seats}
            </span>
            <button
              type="button"
              className="btn neu-sm"
              aria-label="More seats"
              disabled={seats >= MAX_SEATS}
              onClick={() => setSeats((n) => Math.min(MAX_SEATS, n + 1))}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="plus" size={16} width={2.5} />
            </button>
          </div>
        </div>

        <div className="spacer" />
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {missing || tooShort ? (
          <button type="button" className="btn neu cta" disabled>
            {missing ?? 'Pick a bigger stack'}
          </button>
        ) : (
          <button type="submit" className="btn accentBtn cta" disabled={busy}>
            {busy ? 'Setting the table…' : 'Create table'}
            {!busy && <Icon name="arrow" width={2.5} />}
          </button>
        )}
        <Link
          to="/demo"
          className="btn ghost"
          style={{
            alignSelf: 'center',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--muted)',
            padding: '6px 10px',
          }}
        >
          Or practice against bots
        </Link>
      </form>
    </main>
  );
}
