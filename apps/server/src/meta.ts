import type { TablePreview } from '@holdem/engine';
import { escapeXml, formatTimer, timeLeft } from './og';

export interface PageMeta {
  title: string;
  description: string;
  image: string;
  url: string;
}

/** Open Graph tags for a table link: the invite card, or the your-turn card for a nudge link. */
export function tableMeta(p: TablePreview, origin: string, requestUrl: URL, now: number): PageMeta {
  const url = `${origin}${requestUrl.pathname}${requestUrl.search}`;
  const turn = requestUrl.searchParams.get('turn');
  if (turn && p.toAct && p.phase === 'playing') {
    const t = p.toAct;
    const call = t.toCall > 0 ? `$${t.toCall} to call` : 'Check or bet';
    const left = t.deadlineAt !== null ? ` · ${timeLeft(t.deadlineAt - now)}` : '';
    return {
      title: `You’re up, ${t.name}`,
      description: `${t.lastAction ? `${t.lastAction} ` : ''}${call}${left}. ${p.name}, hand #${p.handNo}.`,
      image: `${origin}/og/${p.slug}/turn.png?v=${encodeURIComponent(turn)}`,
      url,
    };
  }
  const title = /hold.?em/i.test(p.name) ? p.name : `${p.name} Hold’em`;
  const open = p.open > 0 ? `${p.open} open` : 'table full';
  return {
    title,
    description: `${p.hostName} invited you · ${p.seats.length} seated · ${open} · $${p.smallBlind}/$${p.bigBlind} blinds · $${p.buyIn} free buy-in · ${formatTimer(p.turnTimerMs)}`,
    image: `${origin}/og/${p.slug}/invite.png?v=${p.seats.length}-${p.phase}`,
    url,
  };
}

export function metaTags(m: PageMeta): string {
  const e = escapeXml;
  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${e(m.title)}">`,
    `<meta property="og:description" content="${e(m.description)}">`,
    `<meta property="og:image" content="${e(m.image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:url" content="${e(m.url)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="description" content="${e(m.description)}">`,
  ].join('');
}

/** Puts the table's tags into the app shell. */
export function injectMeta(page: Response, m: PageMeta): Response {
  return new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(m.title);
      },
    })
    .on('head', {
      element(el) {
        el.append(metaTags(m), { html: true });
      },
    })
    .transform(page);
}
