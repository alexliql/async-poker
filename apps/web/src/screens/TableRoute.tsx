import type { ClientCommand, TablePreview, TableView } from '@holdem/engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../client/api';
import { useFrame, useNow, useSnapshot } from '../client/hooks';
import { RemoteTableClient } from '../client/remote';
import type { SendResult, TableClient } from '../client/types';
import { Stage } from '../components/Stage';
import { clearSeat, getSeat } from '../lib/storage';
import { Table } from '../table/Table';
import { Ended } from './Ended';
import { Join } from './Join';
import { Lobby, Waiting } from './Lobby';
import { Loading, Message, NotFound } from './Message';
import { Rebuy } from './Rebuy';
import { SatOut } from './SatOut';

const SLUG = /^[a-hjkmnp-z2-9]{6}$/;

export function TableRoute() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const [stored, setStored] = useState(() => getSeat(slug));

  useEffect(() => setStored(getSeat(slug)), [slug]);

  if (!SLUG.test(slug)) return <NotFound />;
  if (!stored) return <JoinGate slug={slug} onSeated={() => setStored(getSeat(slug))} />;
  return (
    <RemoteTable
      key={stored.token}
      slug={slug}
      token={stored.token}
      fromNudge={params.has('turn')}
      onLost={() => {
        clearSeat(slug);
        setStored(null);
      }}
    />
  );
}

/** Not seated yet: the invite, or why you can't sit. */
function JoinGate({ slug, onSeated }: { slug: string; onSeated: () => void }) {
  const [state, setState] = useState<{
    preview: TablePreview | null;
    loading: boolean;
    error: string | null;
  }>({
    preview: null,
    loading: true,
    error: null,
  });
  const load = useCallback(() => {
    api
      .preview(slug)
      .then((preview) => setState({ preview, loading: false, error: null }))
      .catch((err: Error) => setState((s) => ({ ...s, loading: false, error: err.message })));
  }, [slug]);
  useEffect(load, [load]);

  if (state.loading) return <Loading />;
  if (state.error && !state.preview)
    return (
      <Message
        title="Couldn’t reach the table."
        body={state.error}
        action={{ label: 'Try again', onClick: load }}
      />
    );
  const p = state.preview;
  if (!p) return <NotFound />;
  if (p.phase === 'ended')
    return (
      <Message
        caps={p.name}
        title="This game is over."
        body={`${p.hostName} already called it. Start your own and send the link around.`}
        action={{ label: 'Host a table', to: '/' }}
      />
    );
  if (p.open === 0)
    return (
      <Message
        caps={p.name}
        title="This table is full."
        body={`All ${p.maxSeats} seats are taken. Ask ${p.hostName} to start another, or host your own.`}
        action={{ label: 'Host a table', to: '/' }}
      />
    );
  return <Join preview={p} onSeated={onSeated} onRefresh={load} />;
}

function RemoteTable({
  slug,
  token,
  fromNudge,
  onLost,
}: {
  slug: string;
  token: string;
  fromNudge: boolean;
  onLost: () => void;
}) {
  const [client, setClient] = useState<TableClient | null>(null);
  useEffect(() => {
    const c = new RemoteTableClient(slug, token);
    setClient(c);
    return () => c.close();
  }, [slug, token]);
  if (!client) return <Loading />;
  return <SeatedTable client={client} fromNudge={fromNudge} onLost={onLost} />;
}

function isBroke(view: TableView): boolean {
  const me = view.seats.find((s) => s.seat === view.you?.seat);
  if (!me) return false;
  const inLiveHand = me.inHand && !me.folded && !!view.hand && view.hand.street !== 'over';
  return me.stack === 0 && !inLiveHand && (me.status === 'busted' || me.status === 'sittingOut');
}

function isAway(view: TableView): boolean {
  const me = view.seats.find((s) => s.seat === view.you?.seat);
  return !!me && me.status === 'sittingOut' && me.stack > 0;
}

/** You have a seat: the right screen for where the game is. */
export function SeatedTable({
  client,
  fromNudge,
  onLost,
}: {
  client: TableClient;
  fromNudge: boolean;
  onLost: () => void;
}) {
  const navigate = useNavigate();
  const snap = useSnapshot(client);
  const frame = useFrame(client);
  const now = useNow(client, 5_000);
  const [screen, setScreen] = useState<'table' | 'rebuy' | 'satout'>('table');
  const [sawLobby, setSawLobby] = useState(false);
  const [wentIn, setWentIn] = useState(false);
  const arrival = useRef<number | null | undefined>(undefined);

  const view = snap.view;
  const send = useCallback((cmd: ClientCommand): Promise<SendResult> => client.send(cmd), [client]);

  useEffect(() => {
    if (view?.phase === 'lobby') setSawLobby(true);
  }, [view?.phase]);

  // On arriving (or coming back to the tab), land on the screen that fits: out of chips, or sat out.
  useEffect(() => {
    if (!view || view.phase !== 'playing') return;
    if (arrival.current === snap.lastSeenAt) return;
    arrival.current = snap.lastSeenAt;
    if (isBroke(view)) setScreen('rebuy');
    else if (isAway(view)) setScreen('satout');
  }, [view, snap.lastSeenAt]);

  const myTurn = !!view?.you?.legal;
  useEffect(() => {
    if (!view) return;
    document.title =
      view.phase === 'playing' && myTurn ? `Your turn · ${view.config.name}` : view.config.name;
  }, [view, myTurn]);

  useEffect(() => {
    if (snap.status === 'unauthorized' && client.slug === 'demo') navigate('/');
  }, [snap.status, client.slug, navigate]);

  if (snap.status === 'unauthorized')
    return (
      <Message
        title="You’re not at this table anymore."
        body="Your seat was removed or opened on another device. You can buy in again."
        action={{ label: 'Rejoin', onClick: onLost }}
      />
    );
  if (snap.status === 'not_found') return <NotFound />;
  if (snap.status === 'error' && !view)
    return (
      <Message
        title="Couldn’t reach the table."
        body={snap.error ?? undefined}
        action={{ label: 'Try again', onClick: () => location.reload() }}
      />
    );
  if (!view || !frame) return <Loading />;

  const me = view.seats.find((s) => s.seat === view.you?.seat);
  if (me?.left)
    return (
      <Message
        caps={view.config.name}
        title="You left this table."
        body="Your chips stay in the standings. Want back in?"
        action={{ label: 'Buy in again', onClick: onLost }}
      />
    );

  if (view.phase === 'lobby') {
    return view.you?.seat === view.hostSeat ? (
      <Lobby slug={client.slug} view={view} send={send} />
    ) : (
      <Waiting view={view} started={false} onGo={() => undefined} />
    );
  }
  if (view.phase === 'ended') return <Ended view={view} />;
  if (sawLobby && !wentIn && view.you?.seat !== view.hostSeat)
    return <Waiting view={view} started onGo={() => setWentIn(true)} />;
  if (screen === 'rebuy') return <Rebuy view={view} send={send} onBack={() => setScreen('table')} />;
  if (screen === 'satout')
    return <SatOut view={view} now={now} send={send} onWatch={() => setScreen('table')} />;

  return (
    <Stage>
      {(layout) => (
        <Table
          client={client}
          frame={frame}
          snapshot={snap}
          layout={layout}
          fromNudge={fromNudge}
          onRebuy={() => setScreen('rebuy')}
          onLeft={() => {
            if (client.slug !== 'demo') clearSeat(client.slug);
            navigate('/');
          }}
        />
      )}
    </Stage>
  );
}
