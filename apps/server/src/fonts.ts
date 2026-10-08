import { FontMetrics } from './font-metrics';
import bricolage600 from './fonts/bricolage-600.ttf';
import bricolage800 from './fonts/bricolage-800.ttf';
import geistMono600 from './fonts/geist-mono-600.ttf';
import type { Fonts } from './og';

export const FONT_BUFFERS = [bricolage600, bricolage800, geistMono600];

let fonts: Fonts | null = null;

export function previewFonts(): Fonts {
  fonts ??= {
    heavy: new FontMetrics(bricolage800),
    semi: new FontMetrics(bricolage600),
    mono: new FontMetrics(geistMono600),
  };
  return fonts;
}
