import type {
  CommandRequest,
  CommandResponse,
  CreateTableRequest,
  DeviceLink,
  JoinRequest,
  SeatGrant,
  TablePreview,
  ViewResponse,
} from '@holdem/engine';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const NETWORK = 'network';

async function request<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
  okStatuses: number[] = [],
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new ApiError(0, NETWORK, 'You seem to be offline');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON (a proxy error page, say)
  }
  if (res.ok || okStatuses.includes(res.status)) return body as T;
  const e = body as { code?: string; message?: string } | null;
  throw new ApiError(res.status, e?.code ?? 'http_' + res.status, e?.message ?? 'Something went wrong');
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && err.code === NETWORK;
}

export const api = {
  createTable(req: CreateTableRequest): Promise<SeatGrant> {
    return request('/api/tables', { method: 'POST', body: JSON.stringify(req) });
  },

  async preview(slug: string): Promise<TablePreview | null> {
    try {
      return await request<TablePreview>(`/api/tables/${slug}/preview`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },

  join(slug: string, req: JoinRequest): Promise<SeatGrant> {
    return request(`/api/tables/${slug}/join`, { method: 'POST', body: JSON.stringify(req) });
  },

  view(slug: string, token: string, peek = false): Promise<ViewResponse> {
    return request(`/api/tables/${slug}/view${peek ? '?peek=1' : ''}`, { token });
  },

  command(slug: string, token: string, body: CommandRequest): Promise<CommandResponse> {
    // 409 carries a normal rejection body: it's an answer, not a failure.
    return request(`/api/tables/${slug}/commands`, { method: 'POST', token, body: JSON.stringify(body) }, [
      409,
    ]);
  },

  deviceLink(slug: string, token: string): Promise<DeviceLink> {
    return request(`/api/tables/${slug}/device-link`, { method: 'POST', token, body: '{}' });
  },

  claim(slug: string, code: string): Promise<SeatGrant> {
    return request(`/api/tables/${slug}/claim`, { method: 'POST', body: JSON.stringify({ code }) });
  },
};

export function liveUrl(slug: string, token: string): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/api/tables/${slug}/live?token=${encodeURIComponent(token)}`;
}

export function newClientId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
