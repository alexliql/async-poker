import type { TablePreview } from '@holdem/engine';
import type { Env } from './env';
import { error, json } from './http';
import { injectMeta, tableMeta } from './meta';
import { inviteSvg, nudgeSvg } from './og';
import { previewFonts } from './fonts';
import { svgToPng } from './render';
import { RateLimiter, isSlug, newSlug } from './security';

export { TableObject } from './table-object';

const createLimiter = new RateLimiter(20, 60 * 60_000);
const joinLimiter = new RateLimiter(60, 60 * 60_000);
/** Generous: a fast game is a few moves a minute per player. This only stops runaway scripts. */
const commandLimiter = new RateLimiter(240, 60_000);

function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'local';
}

function tableStub(env: Env, slug: string) {
  return env.TABLES.get(env.TABLES.idFromName(slug));
}

async function createTable(request: Request, env: Env): Promise<Response> {
  if (!createLimiter.allow(clientIp(request), Date.now()))
    return error(429, 'rate_limited', 'Too many new tables, try later');
  const body = await request.text();
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = newSlug();
    const res = await tableStub(env, slug).fetch(`https://table/init?slug=${slug}`, { method: 'POST', body });
    if (res.status !== 409) return res;
  }
  return error(503, 'busy', 'Could not allocate a table, try again');
}

async function preview(env: Env, slug: string): Promise<TablePreview | null> {
  const res = await tableStub(env, slug).fetch('https://table/preview');
  return res.ok ? ((await res.json()) as TablePreview) : null;
}

async function tableApi(request: Request, env: Env, slug: string, rest: string): Promise<Response> {
  const allowed: Record<string, string> = {
    'GET preview': '/preview',
    'POST join': '/join',
    'GET view': '/view',
    'POST commands': '/commands',
    'POST device-link': '/device-link',
    'POST claim': '/claim',
    'GET live': '/live',
  };
  const target = allowed[`${request.method} ${rest}`];
  if (!target) return error(404, 'not_found', 'No such route');
  if ((rest === 'join' || rest === 'claim') && !joinLimiter.allow(clientIp(request), Date.now()))
    return error(429, 'rate_limited', 'Too many attempts, try later');
  if (rest === 'commands' && !commandLimiter.allow(`${clientIp(request)}:${slug}`, Date.now()))
    return error(429, 'rate_limited', 'Slow down a little');
  const url = new URL(request.url);
  const inner = new URL(`https://table${target}${url.search}`);
  return tableStub(env, slug).fetch(new Request(inner, request));
}

async function tablePage(request: Request, env: Env, slug: string): Promise<Response> {
  const url = new URL(request.url);
  const shell = await env.ASSETS.fetch(
    new Request(new URL('/index.html', url), { headers: request.headers }),
  );
  const p = await preview(env, slug);
  if (!p || !shell.ok) return shell;
  const page = new Response(shell.body, shell);
  page.headers.set('Cache-Control', 'no-store');
  return injectMeta(page, tableMeta(p, url.origin, url, Date.now()));
}

async function ogImage(env: Env, slug: string, kind: string, origin: string): Promise<Response> {
  const p = await preview(env, slug);
  if (!p) return error(404, 'not_found', 'No such table');
  const svg =
    kind === 'invite' ? inviteSvg(previewFonts(), p, origin) : nudgeSvg(previewFonts(), p, Date.now());
  const png = await svgToPng(svg);
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': kind === 'invite' ? 'public, max-age=300' : 'public, max-age=60',
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === '/api/tables' && request.method === 'POST') return await createTable(request, env);
      if (path === '/api/health') return json({ ok: true });

      let m = path.match(/^\/api\/tables\/([^/]+)\/([a-z-]+)$/);
      if (m) {
        if (!isSlug(m[1]!)) return error(404, 'not_found', 'No such table');
        return await tableApi(request, env, m[1]!, m[2]!);
      }

      m = path.match(/^\/og\/([^/]+)\/(invite|turn)\.png$/);
      if (m && request.method === 'GET') {
        if (!isSlug(m[1]!)) return error(404, 'not_found', 'No such table');
        return await ogImage(env, m[1]!, m[2]!, url.origin);
      }

      m = path.match(/^\/t\/([^/]+)\/?$/);
      if (m && request.method === 'GET' && isSlug(m[1]!)) return await tablePage(request, env, m[1]!);

      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('worker error', err);
      return error(500, 'internal', 'Something went wrong');
    }
  },
} satisfies ExportedHandler<Env>;
