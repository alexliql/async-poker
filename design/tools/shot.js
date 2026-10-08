// node shot.js out.png w h in.html
const { chromium } = require('playwright');
(async () => { const [out, w, h, inp] = process.argv.slice(2);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h } });
  await p.goto('file://' + require('path').resolve(inp)); await p.waitForTimeout(600);
  await p.screenshot({ path: out }); await b.close(); })();
