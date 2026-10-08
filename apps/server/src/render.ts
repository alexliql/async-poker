import { Resvg, initWasm } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import { FONT_BUFFERS } from './fonts';

let ready: Promise<void> | null = null;

function init(): Promise<void> {
  ready ??= initWasm(resvgWasm).catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

/** Rasterizes one of the preview SVGs to PNG. Fonts are bundled; no system fonts are used. */
export async function svgToPng(svg: string): Promise<Uint8Array> {
  await init();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: {
      fontBuffers: FONT_BUFFERS.map((b) => new Uint8Array(b)),
      loadSystemFonts: false,
      defaultFontFamily: 'Bricolage Grotesque',
    },
  });
  const png = resvg.render().asPng();
  resvg.free();
  return png;
}
