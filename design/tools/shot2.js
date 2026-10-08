const { chromium } = require('playwright');
(async () => { const [out, w, h, inp, x, y, cw, ch] = process.argv.slice(2);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 3 });
  await p.goto('file://' + require('path').resolve(inp)); await p.waitForTimeout(400);
  await p.screenshot({ path: out, clip: { x: +x, y: +y, width: +cw, height: +ch } }); await b.close(); })();
