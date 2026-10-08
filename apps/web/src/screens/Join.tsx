import { PALETTE, type TablePreview } from '@holdem/engine';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../client/api';
import { NameFields } from '../components/NameFields';
import { SeatGrid } from '../components/SeatGrid';
import { CardPair, Icon } from '../components/ui';
import { money, timerLabel } from '../lib/format';
import { JOIN_QUIPS, pick } from '../lib/quips';
import { getProfile, setProfile, setSeat } from '../lib/storage';

export function tableTitle(name: string): string {
  return /hold.?em/i.test(name) ? name : `${name}\nHold’em`;
}

export function Join({
  preview,
  onSeated,
  onRefresh,
}: {
  preview: TablePreview;
  onSeated: () => void;
  onRefresh: () => void;
}) {
  const profile = getProfile();
  const taken = useMemo(() => new Map(preview.seats.map((s) => [s.color, s.name])), [preview.seats]);
  const firstFree = PALETTE.find((c) => !taken.has(c.id))?.id ?? 'teal';
  const [name, setName] = useState(profile?.name ?? '');
  const [color, setColor] = useState(profile && !taken.has(profile.color) ? profile.color : firstFree);
  const [phrase, setPhrase] = useState(profile?.phrase ?? '');
  const [busy, setBusy] = useState(false);
  const [quip, setQuip] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${preview.name} · Async Hold’em`;
  }, [preview.name]);

  // Someone else may grab your color while you type.
  useEffect(() => {
    if (!quip && taken.has(color)) setColor(firstFree);
  }, [taken, color, firstFree, quip]);

  const trimmed = name.trim();
  const host = preview.seats.find((s) => s.isHost);

  const buy = async () => {
    if (!trimmed || busy || quip) return;
    setBusy(true);
    setError(null);
    try {
      const grant = await api.join(preview.slug, { name: trimmed, color, phrase: phrase.trim() });
      setSeat(preview.slug, { seat: grant.seat, token: grant.token });
      setProfile({ name: trimmed, color, phrase: phrase.trim() });
      setQuip(pick(JOIN_QUIPS));
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'color_taken' || err.code === 'table_full')) onRefresh();
      setError(err instanceof ApiError ? err.message : 'Couldn’t join. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const people = [
    ...preview.seats.map((s) => ({ key: s.seat, name: s.name, color: s.color })),
    ...(trimmed ? [{ key: 'you', name: trimmed, color, bold: true, pop: true }] : []),
  ];

  return (
    <main className="screen">
      <form
        className="screen-col"
        style={{ paddingTop: 28 }}
        onSubmit={(e) => {
          e.preventDefault();
          void buy();
        }}
      >
        <CardPair />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="caps">You’re invited</span>
          <h1 className="h1" style={{ fontSize: 46, whiteSpace: 'pre-line' }}>
            {tableTitle(preview.name)}
          </h1>
          <div className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>
            Hosted by {host?.name ?? preview.hostName} · Blinds {money(preview.smallBlind)}/
            {money(preview.bigBlind)} · {timerLabel(preview.turnTimerMs)} turns
          </div>
        </div>
        <SeatGrid people={people} max={preview.maxSeats} />
        {!quip && (
          <NameFields
            idPrefix="join"
            nameLabel="Your name"
            name={name}
            onName={setName}
            namePlaceholder="What should the table call you?"
            color={color}
            onColor={setColor}
            phrase={phrase}
            onPhrase={setPhrase}
            phrasePlaceholder="Read ’em and weep."
            taken={taken}
          />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {quip && (
            <div
              className="neu popUp"
              role="status"
              style={{
                borderRadius: 24,
                padding: '22px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                className="wobble"
                style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15 }}
              >
                “{quip}”
              </div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                +{money(preview.buyIn)} in free chips
              </div>
            </div>
          )}
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {quip ? (
          <button type="button" className="btn accentBtn cta popUp" onClick={onSeated} autoFocus>
            Take your seat
            <Icon name="arrow" width={2.5} />
          </button>
        ) : (
          <button type="submit" className="btn accentBtn cta" disabled={!trimmed || busy}>
            {busy ? 'Buying in…' : 'Buy in for free'}
            {!busy && (
              <span className="mono" style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>
                · {money(preview.buyIn)}
              </span>
            )}
          </button>
        )}
      </form>
    </main>
  );
}
