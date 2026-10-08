import { useEffect, useState } from 'react';
import { LocalTableClient } from '../client/local';
import type { TableClient } from '../client/types';
import { getProfile } from '../lib/storage';
import { Loading } from './Message';
import { SeatedTable } from './TableRoute';

/** A practice table against bots, run entirely in the page. */
export function Demo() {
  const [client, setClient] = useState<TableClient | null>(null);
  useEffect(() => {
    const p = getProfile();
    const c = new LocalTableClient({
      you: p && p.name.trim() ? p : { name: 'You', color: 'teal', phrase: 'Read ’em and weep.' },
    });
    setClient(c);
    return () => c.close();
  }, []);
  if (!client) return <Loading />;
  return <SeatedTable client={client} fromNudge={false} onLost={() => undefined} />;
}
