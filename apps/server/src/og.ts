import { type TablePreview, colorHex } from '@holdem/engine';
import type { FontMetrics } from './font-metrics';

/**
 * Link-preview images (1200x630) as SVG, matching the OGInvite and OGNudge design boards.
 * `render.ts` rasterizes them to PNG; chat apps don't show SVG previews.
 */

const W = 1200;
const H = 630;
const BG = '#E3E6EB';
const FG = '#15181D';
const MUTED = '#575E6C';
const BACK = '#2A2F38';
const ACCENT = '#FF5B2E';
const ACCENT_INK = '#1B0F0A';

export function escapeXml(s: string): string {
  return s.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
}

export interface Fonts {
  /** Bricolage Grotesque ExtraBold (800): titles. */
  heavy: FontMetrics;
  /** Bricolage Grotesque SemiBold (600): labels and pills. */
  semi: FontMetrics;
  /** Geist Mono SemiBold (600): numbers and the link. */
  mono: FontMetrics;
}

const TITLE_TRACKING = -0.045;

export function wrapText(text: string, fits: (line: string) => boolean): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (!line || fits(next)) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest size from `sizes` at which the title wraps into at most `maxLines` lines that all fit. */
export function fitTitle(fonts: Fonts, text: string, sizes: number[], maxWidth: number, maxLines: number) {
  const width = (line: string, size: number) => fonts.heavy.measure(line, size, size * TITLE_TRACKING);
  for (const size of sizes) {
    const lines = wrapText(text, (l) => width(l, size) <= maxWidth);
    if (lines.length <= maxLines && lines.every((l) => width(l, size) <= maxWidth))
      return { size, lines, fits: true };
  }
  const size = sizes[sizes.length - 1]!;
  return { size, lines: wrapText(text, (l) => width(l, size) <= maxWidth).slice(0, maxLines), fits: false };
}

const DEFS = `<defs>
  <filter id="raised" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="5" dy="5" stdDeviation="6" flood-color="#929BAB" flood-opacity="0.55"/>
    <feDropShadow dx="-5" dy="-5" stdDeviation="6" flood-color="#FFFFFF" flood-opacity="0.95"/>
  </filter>
  <filter id="card" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="16" dy="20" stdDeviation="18" flood-color="#929BAB" flood-opacity="0.55"/>
  </filter>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="3" dy="3" stdDeviation="4" flood-color="#929BAB" flood-opacity="0.5"/>
  </filter>
</defs>`;

function cardBack(x: number, y: number, w: number, h: number, rotate: number, icon: number): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const s = icon / 24;
  return `<g transform="rotate(${rotate} ${cx} ${cy})" filter="url(#card)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="${BACK}"/>
    <rect x="${x + 7}" y="${y + 7}" width="${w - 14}" height="${h - 14}" rx="14" fill="none" stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="2"/>
    <g transform="translate(${cx - icon / 2 - 0.8 * s} ${cy - icon / 2 - 1.75 * s}) scale(${s})" fill="none" stroke="#FFFFFF" stroke-opacity="0.88" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="9" cy="16" r="4.5"/><path d="M9 11.5V8.5"/><path d="M6.5 8.5a2.5 2.5 0 0 1 5 0z"/><path d="M11.2 7.4l7.3 5.1"/><circle cx="18.5" cy="16.5" r="2.6"/>
    </g>
  </g>`;
}

function pill(
  fonts: Fonts,
  x: number,
  y: number,
  text: string,
  mono: boolean,
): { svg: string; width: number } {
  const size = 22;
  const width = Math.round((mono ? fonts.mono : fonts.semi).measure(text, size) + 44);
  const family = mono ? 'Geist Mono' : 'Bricolage Grotesque';
  return {
    width,
    svg: `<g filter="url(#raised)"><rect x="${x}" y="${y}" width="${width}" height="52" rx="26" fill="${BG}"/></g>
      <text x="${x + width / 2}" y="${y + 34}" text-anchor="middle" font-family="${family}" font-weight="600" font-size="${size}" fill="${FG}">${escapeXml(text)}</text>`,
  };
}

function frame(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS}<rect width="${W}" height="${H}" fill="${BG}"/>${body}</svg>`;
}

export function formatTimer(ms: number): string {
  const h = ms / 3_600_000;
  if (h >= 1) return `${Math.round(h)}h turns`;
  return `${Math.round(ms / 60_000)}m turns`;
}

function titleLines(lines: string[], x: number, top: number, size: number, step: number): string {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${top + size * 0.8 + i * size * step}" font-family="Bricolage Grotesque" font-weight="800" font-size="${size}" letter-spacing="${size * TITLE_TRACKING}" fill="${FG}">${escapeXml(line)}</text>`,
    )
    .join('');
}

function caps(text: string, x: number, y: number): string {
  return `<text x="${x}" y="${y}" font-family="Bricolage Grotesque" font-weight="600" font-size="20" letter-spacing="2.8" fill="${MUTED}">${escapeXml(text.toUpperCase())}</text>`;
}

function footer(text: string, x: number): string {
  return `<text x="${x}" y="${H - 44}" font-family="Geist Mono" font-weight="600" font-size="20" fill="${MUTED}">${escapeXml(text)}</text>`;
}

/** Vertically centres a content block of `height` in the space above the footer. */
function blockTop(height: number): number {
  return Math.round(Math.max(56, (H - 70 - height) / 2));
}

export function inviteSvg(fonts: Fonts, p: TablePreview, origin: string): string {
  const titleText = /hold.?em/i.test(p.name) ? p.name : `${p.name} Hold’em`;
  const { size, lines } = fitTitle(fonts, titleText, [104, 92, 80], 636, 2);
  const step = 0.92;
  const titleH = size * 0.8 + (lines.length - 1) * size * step + size * 0.22;
  const height = 20 + 26 + titleH + 32 + 60 + 28 + 52;
  let y = blockTop(height);
  const parts: string[] = [cardBack(90, 166, 200, 284, -11, 108), cardBack(220, 136, 200, 284, 9, 108)];
  parts.push(caps(`${p.hostName} invited you`, 500, y + 16));
  y += 20 + 26;
  parts.push(titleLines(lines, 496, y, size, step));
  y += titleH + 32 + 30;
  const avatars = p.seats.slice(0, 6);
  avatars.forEach((s, i) => {
    const cx = 530 + i * 42;
    parts.push(
      `<circle cx="${cx}" cy="${y}" r="30" fill="${BG}"/><circle cx="${cx}" cy="${y}" r="26" fill="${colorHex(s.color)}"/>`,
      `<text x="${cx}" y="${y + 8}" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="21" fill="${FG}">${escapeXml(
        s.name.slice(0, 1).toUpperCase(),
      )}</text>`,
    );
  });
  const seatedX = 530 + (avatars.length - 1) * 42 + 30 + 18;
  const openText = p.open > 0 ? `${p.open} open` : 'table full';
  parts.push(
    `<text x="${seatedX}" y="${y + 9}" font-family="Bricolage Grotesque" font-weight="600" font-size="26" fill="${FG}">${p.seats.length} seated · <tspan fill="${p.open > 0 ? ACCENT : MUTED}">${openText}</tspan></text>`,
  );
  y += 30 + 28;
  let x = 500;
  for (const [text, mono] of [
    [`$${p.smallBlind}/$${p.bigBlind}`, true],
    [`$${p.buyIn} free buy-in`, false],
    [formatTimer(p.turnTimerMs), false],
  ] as const) {
    const pl = pill(fonts, x, y, text, mono);
    parts.push(pl.svg);
    x += pl.width + 14;
  }
  parts.push(footer(`${origin.replace(/^https?:\/\//, '')}/t/${p.slug}`, 70));
  return frame(parts.join(''));
}

export function timeLeft(ms: number): string {
  if (ms <= 0) return 'time’s up';
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m left`;
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}

export function nudgeSvg(fonts: Fonts, p: TablePreview, now: number): string {
  const t = p.toAct;
  const parts: string[] = [cardBack(830, 186, 180, 256, -10, 96), cardBack(944, 158, 180, 256, 9, 96)];
  const step = 0.9;
  const text = t ? `You’re up, ${t.name}.` : p.phase === 'ended' ? 'Good game.' : 'Between hands.';
  // One big line reads best in a chat bubble; wrap only for long names.
  const single = fitTitle(fonts, text, [124, 112, 100], 720, 1);
  const { size, lines } = single.fits ? single : fitTitle(fonts, text, [100, 88, 76], 720, 2);
  const titleH = size * 0.8 + (lines.length - 1) * size * step + size * 0.2;
  const hasLast = !!t?.lastAction;
  const height = 20 + 28 + titleH + (hasLast ? 50 : 0) + (t ? 40 + 72 : 0);
  let y = blockTop(height);
  parts.push(caps(`${p.name} · hand #${p.handNo}`, 76, y + 16));
  y += 20 + 28;
  parts.push(titleLines(lines, 72, y, size, step));
  y += titleH;
  if (!t) return frame(parts.join(''));
  if (hasLast) {
    y += 40;
    parts.push(
      `<text x="76" y="${y}" font-family="Bricolage Grotesque" font-weight="600" font-size="30" fill="${MUTED}">${escapeXml(t.lastAction!)}</text>`,
    );
    y += 10;
  }
  y += 40;
  const callText = t.toCall > 0 ? `$${t.toCall} to call` : 'Check or bet';
  const pillW = Math.round(fonts.heavy.measure(callText, 32) + 60);
  parts.push(
    `<g filter="url(#soft)"><rect x="76" y="${y}" width="${pillW}" height="72" rx="24" fill="${ACCENT}"/></g>`,
    `<text x="${76 + pillW / 2}" y="${y + 47}" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="32" fill="${ACCENT_INK}">${escapeXml(callText)}</text>`,
  );
  if (t.deadlineAt !== null) {
    const left = t.deadlineAt - now;
    const frac = Math.max(0, Math.min(1, left / p.turnTimerMs));
    const bx = 76 + pillW + 22;
    parts.push(
      `<text x="${bx}" y="${y + 30}" font-family="Geist Mono" font-weight="600" font-size="24" fill="${FG}">${escapeXml(timeLeft(left))}</text>`,
      `<rect x="${bx}" y="${y + 44}" width="220" height="12" rx="6" fill="#D9DEE5"/>`,
      `<rect x="${bx}" y="${y + 44}" width="${Math.max(12, Math.round(220 * frac))}" height="12" rx="6" fill="${ACCENT}"/>`,
    );
  }
  parts.push(footer('Only you can see your cards. Tap to play.', 76));
  return frame(parts.join(''));
}
