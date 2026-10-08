// Usage: node check.js <file.dc.html> [--table]
// 1) tag balance  2) every {{hole}} resolvable  3) (table) engine flows run without errors
const fs = require('fs');
const file = process.argv[2];
const isTable = process.argv.includes('--table');
const src = fs.readFileSync(file, 'utf8');
let failures = 0;
const fail = (m) => { failures++; console.log('FAIL', m); };

// ---------- 1. tag balance inside <x-dc> ----------
const body = src.slice(src.indexOf('<x-dc>'), src.indexOf('</x-dc>') + 7);
const markup = body.replace(/<style>[\s\S]*?<\/style>/, '');
const VOID = new Set(['input', 'br', 'img', 'meta', 'link', 'hr']);
const stack = [];
const tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
let m;
while ((m = tagRe.exec(markup))) {
  const [, close, name, , selfClose] = m;
  const n = name.toLowerCase();
  if (VOID.has(n) || selfClose) continue;
  if (!close) stack.push({ n, at: m.index });
  else {
    const top = stack.pop();
    if (!top || top.n !== n) { fail(`tag mismatch: </${n}> closes <${top && top.n}> near ${markup.slice(Math.max(0, m.index - 80), m.index + 20).replace(/\s+/g, ' ')}`); break; }
  }
}
if (stack.length) fail('unclosed tags: ' + stack.map((s) => s.n).join(','));

// ---------- 2. load logic ----------
const js = src.match(/data-dc-script[^>]*>([\s\S]*)<\/script>/)[1];
const timers = [];
let now = 0, tid = 0;
global.setTimeout = (fn, ms) => { const id = ++tid; timers.push({ id, at: now + (ms || 0), fn }); return id; };
global.clearTimeout = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
global.requestAnimationFrame = (fn) => setTimeout(fn, 16);
global.cancelAnimationFrame = clearTimeout;
global.navigator = {};
class DCLogic {
  constructor() { this.props = {}; }
  setState(u) {
    const patch = typeof u === 'function' ? u(this.state, this.props) : u;
    if (patch) this.state = Object.assign({}, this.state, patch);
    if (this.componentDidUpdate) this.componentDidUpdate();
  }
}
const Component = new Function('DCLogic', js + '\nreturn Component;')(DCLogic);
function run(ms) { const end = now + ms; for (;;) { timers.sort((a, b) => a.at - b.at || a.id - b.id); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); now = t.at; t.fn(); } now = end; }

// ---------- 3. hole coverage ----------
function holeCheck(vals, label) {
  // walk markup tracking sc-for aliases
  const aliasStack = [];
  const re = /<sc-for[^>]*list="\{\{\s*([\w.]+)\s*\}\}"[^>]*as="(\w+)"[^>]*>|<\/sc-for>|\{\{\s*([^}]+?)\s*\}\}/g;
  let mm;
  const resolve = (path, scope) => {
    const parts = path.split('.');
    let cur;
    const alias = [...aliasStack].reverse().find((a) => a.as === parts[0]);
    if (alias) cur = alias.sample; else if (parts[0] === '$index') return true; else cur = vals[parts[0]];
    if (cur === undefined) return false;
    for (let i = 1; i < parts.length; i++) { if (cur == null) return false; cur = cur[parts[i]]; if (cur === undefined) return false; }
    return true;
  };
  while ((mm = re.exec(markup))) {
    if (mm[1]) {
      const listPath = mm[1];
      const parts = listPath.split('.');
      let list;
      const alias = [...aliasStack].reverse().find((a) => a.as === parts[0]);
      if (alias) { list = alias.sample; for (let i = 1; i < parts.length; i++) list = list && list[parts[i]]; }
      else { list = vals[parts[0]]; for (let i = 1; i < parts.length; i++) list = list && list[parts[i]]; }
      if (!Array.isArray(list)) { fail(`${label}: sc-for list {{${listPath}}} is not an array`); list = []; }
      // pick an item that has the most keys to check fields
      const sample = list.reduce((b, x) => (x && Object.keys(x).length > Object.keys(b || {}).length ? x : b), list[0] || {});
      aliasStack.push({ as: mm[2], sample: sample || {}, empty: !list.length });
    } else if (mm[0] === '</sc-for>') aliasStack.pop();
    else {
      const expr = mm[3].trim();
      if (/^(true|false|\d+)$/.test(expr)) continue;
      const parts = expr.split('.');
      const alias = [...aliasStack].reverse().find((a) => a.as === parts[0]);
      if (alias && alias.empty) continue;
      if (!resolve(expr)) fail(`${label}: hole {{${expr}}} unresolved`);
    }
  }
}

function make(props) { const c = new Component(); c.props = props || {}; if (c.componentDidMount) c.componentDidMount(); return c; }

if (!isTable) {
  const c = make({});
  holeCheck(c.renderVals(), 'initial');
  // exercise every handler returned
  const v = c.renderVals();
  for (const k of Object.keys(v)) if (typeof v[k] === 'function' && k !== 'onName' && k !== 'onPhrase') { try { v[k]({ target: { value: 'Kai' }, key: 'x' }); run(10000); holeCheck(c.renderVals(), 'after ' + k); } catch (e) { fail('handler ' + k + ': ' + e.message); } }
  console.log(failures ? `${failures} problem(s)` : 'OK', file.split('/').pop());
  process.exit(failures ? 1 : 0);
}

// ---------- 4. table flows ----------
const snap = (c, label) => { try { holeCheck(c.renderVals(), label); } catch (e) { fail(label + ': renderVals threw ' + e.stack); } };
function playUntil(c, phases, maxMs) { let t = 0; while (t < maxMs) { run(100); t += 100; if (phases.includes(c.state.phase)) return true; } return false; }

for (const props of [{}, { dark: true, fourColor: true }]) {
  // A: call down every street, win at showdown
  let c = make(props);
  snap(c, 'A0 initial');
  const nudge = /const ENTRY = 'nudge'/.test(src);
  if (nudge && !c.state.recapOpen && c.renderVals().showHistoryBtn) fail('recap expected on nudge entry');
  if (!nudge && c.state.recapOpen) fail('table entry should not open recap');
  c.closeRecap(); run(50); snap(c, 'A recap closed');
  for (let street = 0; street < 4; street++) {
    if (c.state.phase !== 'me') { fail('A: expected my turn on street ' + street + ' got ' + c.state.phase); break; }
    c.onCall(); run(50);
    if (c.state.phase !== 'undo') fail('A: expected undo window');
    snap(c, 'A undo s' + street);
    run(5100);
    snap(c, 'A busy s' + street);
    playUntil(c, ['me', 'done'], 20000);
    snap(c, 'A after s' + street);
  }
  playUntil(c, ['done'], 20000);
  if (c.state.phase !== 'done') fail('A: hand did not finish');
  if (!c.state.log.some((e) => e.k === 'result' && e.shown)) fail('A: showdown result row missing');
  run(4000); snap(c, 'A done');
  if (c.state.me.stack <= 200) fail('A: expected to win the pot, stack ' + c.state.me.stack);
  c.next(); run(50); snap(c, 'A next hand');
  if (c.state.handNo !== 15 || c.state.phase !== 'me') fail('A: next hand not dealt');

  // B: undo works
  c = make(props); c.closeRecap(); run(50);
  c.onFold(); run(1000); c.onUndo(); run(6000);
  if (c.state.phase !== 'me' || c.state.me.folded) fail('B: undo did not restore my turn');

  // C: raise via sheet, then all-in hold
  c = make(props); c.closeRecap(); run(50);
  c.openRaise(); run(50); snap(c, 'C sheet');
  c.inc(); c.inc(); c.dec(); run(50);
  if (c.state.raiseTo !== 14) fail('C: steppers wrong ' + c.state.raiseTo);
  const v = c.renderVals(); v.presets[3].pick(); run(50); snap(c, 'C all-in selected');
  if (!c.renderVals().isAllIn) fail('C: all-in not detected');
  c.holdStart(); run(300); c.holdEnd(); run(100);
  if (c.state.phase !== 'me') fail('C: short hold should not commit');
  c.holdStart(); run(900);
  if (c.state.phase !== 'undo') fail('C: long hold should commit to undo');
  run(5200); playUntil(c, ['me', 'done'], 30000); snap(c, 'C after all-in');
  let guard = 0;
  while (c.state.phase === 'me' && guard++ < 5) { c.onCall(); run(5200); playUntil(c, ['me', 'done'], 30000); }
  playUntil(c, ['done'], 30000);
  if (c.state.phase !== 'done') fail('C: all-in hand did not finish');
  snap(c, 'C done');
  { const v = c.renderVals(); if (v.doneOk === v.doneBroke) fail('C: exactly one end-of-hand CTA expected'); if (c.state.me.stack <= 0 && !v.doneBroke) fail('C: bust should offer rebuy'); }
  { const before = c.state.seats.map((x) => x.stack); if (c.state.me.stack > 0) { c.next(); run(50); c.state.seats.forEach((x, i) => { const exp = before[i] > 0 ? Math.max(0, before[i] - [1, 0, 2, 0, 6][i]) : 200 - [1, 0, 2, 0, 6][i]; if (x.stack !== exp) fail('C: seat ' + i + ' stack not carried: ' + x.stack + ' vs ' + exp); }); } }

  // D: pre-actions (call any) auto-acts on next street
  c = make(props); c.closeRecap(); run(50);
  c.onCall(); run(5100); run(300);
  snap(c, 'D busy');
  if (!c.renderVals().showPre) fail('D: pre-actions not shown while waiting');
  c.renderVals().preOpts[2].pick(); run(10);
  if (c.state.pre !== 'callany') fail('D: pre-action not stored');
  playUntil(c, ['undo'], 30000);
  if (c.state.phase !== 'undo') fail('D: pre-action did not auto-act');
  run(5200); snap(c, 'D after auto');

  // E: fold ends hand, info/ranks/recap sheets
  c = make(props); c.closeRecap(); run(50);
  c.openInfo(); snap(c, 'E info'); c.closeInfo();
  c.openRanks(); snap(c, 'E ranks'); c.closeRanks();
  if (c.renderVals().showHistoryBtn) { c.openRecap(); snap(c, 'E recap'); c.closeRecap(); }
  c.onFold(); run(5200); playUntil(c, ['done'], 20000);
  if (c.state.phase !== 'done') fail('E: fold did not end hand');
  snap(c, 'E done');
}
console.log(failures ? `${failures} problem(s)` : 'OK', file.split('/').pop());
process.exit(failures ? 1 : 0);
