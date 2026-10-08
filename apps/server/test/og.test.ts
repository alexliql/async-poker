import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { TablePreview } from '@holdem/engine';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { FontMetrics } from '../src/font-metrics';
import { tableMeta } from '../src/meta';
import { type Fonts, escapeXml, fitTitle, inviteSvg, nudgeSvg, timeLeft, wrapText } from '../src/og';

const require = createRequire(import.meta.url);
const font = (f: string) => {
  const b = readFileSync(new URL(`../src/fonts/${f}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const fonts: Fonts = {
  heavy: new FontMetrics(font('bricolage-800.ttf')),
  semi: new FontMetrics(font('bricolage-600.ttf')),
  mono: new FontMetrics(font('geist-mono-600.ttf')),
};

const PREVIEW: TablePreview = {
  slug: 'k7q2mn',
  name: 'Friday Night',
  phase: 'playing',
  hostName: 'Mia',
  smallBlind: 1,
  bigBlind: 2,
  buyIn: 200,
  turnTimerMs: 12 * 3_600_000,
  maxSeats: 6,
  seats: [
    { seat: 0, name: 'Mia', color: 'sage', phrase: '', isHost: true },
    { seat: 1, name: 'Kai', color: 'teal', phrase: '', isHost: false },
  ],
  open: 4,
  handNo: 14,
  toAct: {
    seat: 1,
    name: 'Kai',
    toCall: 6,
    deadlineAt: 1_000_000 + 42_120_000,
    lastAction: 'Theo raised to $6.',
  },
};

describe('font metrics', () => {
  it('measures text proportionally to size', () => {
    const w = fonts.heavy.measure('Friday Night', 100);
    expect(w).toBeGreaterThan(400);
    expect(w).toBeLessThan(700);
    expect(fonts.heavy.measure('Friday Night', 50)).toBeCloseTo(w / 2, 5);
    expect(fonts.mono.measure('iiii', 20)).toBeCloseTo(fonts.mono.measure('MMMM', 20), 5);
  });
});

describe('text layout', () => {
  it('wraps greedily on word boundaries', () => {
    expect(wrapText('a bb ccc dddd', (l) => l.length <= 6)).toEqual(['a bb', 'ccc', 'dddd']);
    expect(wrapText('overlongword', () => false)).toEqual(['overlongword']);
  });

  it('keeps the design titles on the lines the boards show', () => {
    expect(fitTitle(fonts, 'You’re up, Kai.', [124, 112, 100], 720, 1)).toMatchObject({
      fits: true,
      lines: ['You’re up, Kai.'],
    });
    expect(fitTitle(fonts, 'Friday Night Hold’em', [104, 92, 80], 636, 2)).toEqual({
      size: 104,
      lines: ['Friday Night', 'Hold’em'],
      fits: true,
    });
    expect(fitTitle(fonts, 'You’re up, Bartholomew-Maximilian.', [124], 720, 1).fits).toBe(false);
  });

  it('escapes user text', () => {
    expect(escapeXml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      '&lt;b&gt;&quot;Tom&quot; &amp; &apos;Jerry&apos;&lt;/b&gt;',
    );
    expect(inviteSvg(fonts, { ...PREVIEW, hostName: '<script>' }, 'https://x.test')).not.toContain(
      '<script>',
    );
  });

  it('formats time left', () => {
    expect(timeLeft(42_120_000)).toBe('11h 42m left');
    expect(timeLeft(3_600_000)).toBe('1h left');
    expect(timeLeft(90_000)).toBe('2m left');
    expect(timeLeft(-5)).toBe('time’s up');
  });
});

describe('page tags', () => {
  it('invites by default and nudges on a turn link', () => {
    const now = 1_000_000;
    const invite = tableMeta(PREVIEW, 'https://holdem.test', new URL('https://holdem.test/t/k7q2mn'), now);
    expect(invite).toMatchObject({
      title: 'Friday Night Hold’em',
      image: 'https://holdem.test/og/k7q2mn/invite.png?v=2-playing',
    });
    expect(invite.description).toContain('Mia invited you · 2 seated · 4 open');
    const nudge = tableMeta(
      PREVIEW,
      'https://holdem.test',
      new URL('https://holdem.test/t/k7q2mn?turn=14.33'),
      now,
    );
    expect(nudge.title).toBe('You’re up, Kai');
    expect(nudge.description).toBe('Theo raised to $6. $6 to call · 11h 42m left. Friday Night, hand #14.');
    expect(nudge.image).toBe('https://holdem.test/og/k7q2mn/turn.png?v=14.33');
  });
});

describe('rendering', () => {
  beforeAll(async () => {
    await initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
  });

  it.each([
    ['invite', () => inviteSvg(fonts, PREVIEW, 'https://holdem.test')],
    ['nudge', () => nudgeSvg(fonts, PREVIEW, 1_000_000)],
    ['between hands', () => nudgeSvg(fonts, { ...PREVIEW, toAct: null }, 1_000_000)],
  ])('renders the %s card to a 1200x630 PNG', (name, make) => {
    const resvg = new Resvg(make(), {
      font: {
        fontBuffers: ['bricolage-600.ttf', 'bricolage-800.ttf', 'geist-mono-600.ttf'].map(
          (f) => new Uint8Array(font(f)),
        ),
        loadSystemFonts: false,
        defaultFontFamily: 'Bricolage Grotesque',
      },
    });
    const img = resvg.render();
    expect([img.width, img.height]).toEqual([1200, 630]);
    const png = img.asPng();
    expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
    if (process.env.OG_OUT)
      require('node:fs').writeFileSync(`${process.env.OG_OUT}/${name.replace(' ', '-')}.png`, png);
  });
});
