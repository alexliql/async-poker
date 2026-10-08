/**
 * Minimal TrueType reader for measuring text: maps characters to glyphs (cmap format 4) and reads
 * their advance widths (hmtx). Lets the preview images wrap titles accurately without a layout engine.
 * Kerning is ignored; it changes widths by a percent or two.
 */
export class FontMetrics {
  private readonly view: DataView;
  private readonly unitsPerEm: number;
  private readonly advances: number[];
  private readonly glyphs = new Map<number, number>();

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    const tables = this.tables();
    const head = tables.get('head');
    const hhea = tables.get('hhea');
    const hmtx = tables.get('hmtx');
    const cmap = tables.get('cmap');
    if (head === undefined || hhea === undefined || hmtx === undefined || cmap === undefined)
      throw new Error('Unsupported font');
    this.unitsPerEm = this.view.getUint16(head + 18);
    const count = this.view.getUint16(hhea + 34);
    this.advances = Array.from({ length: count }, (_, i) => this.view.getUint16(hmtx + i * 4));
    this.readCmap(cmap);
  }

  private tables(): Map<string, number> {
    const n = this.view.getUint16(4);
    const out = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16;
      const tag = String.fromCharCode(...[0, 1, 2, 3].map((k) => this.view.getUint8(o + k)));
      out.set(tag, this.view.getUint32(o + 8));
    }
    return out;
  }

  private readCmap(cmap: number) {
    const v = this.view;
    const n = v.getUint16(cmap + 2);
    let sub = -1;
    for (let i = 0; i < n; i++) {
      const platform = v.getUint16(cmap + 4 + i * 8);
      const encoding = v.getUint16(cmap + 6 + i * 8);
      const offset = v.getUint32(cmap + 8 + i * 8);
      if (platform === 3 && encoding === 1 && v.getUint16(cmap + offset) === 4) sub = cmap + offset;
    }
    if (sub < 0) throw new Error('Font has no Unicode BMP cmap');
    const segX2 = v.getUint16(sub + 6);
    const ends = sub + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let i = 0; i < segX2 / 2; i++) {
      const end = v.getUint16(ends + i * 2);
      const start = v.getUint16(starts + i * 2);
      const delta = v.getInt16(deltas + i * 2);
      const rangeOffset = v.getUint16(ranges + i * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let glyph: number;
        if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
        else {
          const addr = ranges + i * 2 + rangeOffset + (c - start) * 2;
          const g = v.getUint16(addr);
          glyph = g === 0 ? 0 : (g + delta) & 0xffff;
        }
        if (glyph) this.glyphs.set(c, glyph);
      }
    }
  }

  /** Width in pixels of `text` at `size`, with optional letter spacing in pixels. */
  measure(text: string, size: number, letterSpacing = 0): number {
    let units = 0;
    let chars = 0;
    for (const ch of text) {
      const glyph = this.glyphs.get(ch.codePointAt(0)!) ?? 0;
      units += this.advances[Math.min(glyph, this.advances.length - 1)] ?? 0;
      chars++;
    }
    return (units / this.unitsPerEm) * size + letterSpacing * chars;
  }
}
