import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../client/api';
import { setSeat } from '../lib/storage';
import { Message } from './Message';

// A code works once; remember the attempt so a re-run effect doesn't spend it twice.
const claims = new Map<string, ReturnType<typeof api.claim>>();
function claimOnce(slug: string, code: string) {
  const key = `${slug}/${code}`;
  let p = claims.get(key);
  if (!p) {
    p = api.claim(slug, code);
    claims.set(key, p);
  }
  return p;
}

/** Opens a seat from a one-time "other device" link, then goes to the table. */
export function DeviceClaim() {
  const { slug = '', code = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    claimOnce(slug, code)
      .then((grant) => {
        if (cancelled) return;
        setSeat(slug, { seat: grant.seat, token: grant.token });
        navigate(`/t/${slug}`, { replace: true });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Couldn’t open your seat.');
      });
    return () => {
      cancelled = true;
    };
  }, [slug, code, navigate]);

  if (error)
    return (
      <Message
        caps="New device"
        title="That link didn’t work."
        body={`${error}. Make a fresh one from the table info on your other device.`}
        action={{ label: 'Go to the table', to: `/t/${slug}` }}
      />
    );
  return <Message caps="New device" title="Opening your seat…" busy />;
}
