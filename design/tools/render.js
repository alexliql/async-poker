// Usage: node render.js <file.dc.html> <out.html> [propsJSON] [script]
// Static renderer for visual QA: evaluates sc-if/sc-for and {{holes}} against renderVals().
// Optional script: JS run against component `c` and `run(ms)` before rendering (e.g. "c.closeRecap();run(50)").
const fs = require('fs');
const [file, out, propsJSON, script] = process.argv.slice(2);
const src = fs.readFileSync(file, 'utf8');
const helmet = (src.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1];
const body = src.slice(src.indexOf('</helmet>') + 9, src.indexOf('</x-dc>'));
const m = src.match(/data-dc-script[^>]*>([\s\S]*)<\/script>/);
const timers = []; let now = 0, tid = 0;
global.setTimeout = (fn, ms) => { const id = ++tid; timers.push({ id, at: now + (ms || 0), fn }); return id; };
global.clearTimeout = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
global.setInterval = () => 0; global.clearInterval = () => {};
global.requestAnimationFrame = (fn) => setTimeout(fn, 16); global.cancelAnimationFrame = clearTimeout;
global.navigator = {};
class DCLogic { constructor() { this.props = {}; } setState(u) { const p = typeof u === 'function' ? u(this.state, this.props) : u; if (p) this.state = Object.assign({}, this.state, p); if (this.componentDidUpdate) this.componentDidUpdate(); } }
function run(ms) { const end = now + ms; for (;;) { timers.sort((a, b) => a.at - b.at || a.id - b.id); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); now = t.at; t.fn(); } now = end; }
let vals = {};
const props = propsJSON ? JSON.parse(propsJSON) : {};
// defaults from data-props
const dp = (src.match(/data-props='([^']*)'/) || [, '{}'])[1];
const defs = JSON.parse(dp); for (const k in defs) if (!k.startsWith('$') && !(k in props)) props[k] = defs[k].default;
if (m && /class Component/.test(m[1])) {
  const Component = new Function('DCLogic', m[1] + '\nreturn Component;')(DCLogic);
  const c = new Component(); c.props = props; if (c.componentDidMount) c.componentDidMount();
  if (script) new Function('c', 'run', script)(c, run);
  vals = c.renderVals();
}
vals = Object.assign({}, props, vals);
// tree
const re = /<(\/?)(sc-if|sc-for)([^>]*)>/g;
function parse(s) {
  const root = { kids: [] }; const st = [root]; let last = 0, mm;
  while ((mm = re.exec(s))) {
    st[st.length - 1].kids.push(s.slice(last, mm.index)); last = re.lastIndex;
    if (!mm[1]) { const n = { tag: mm[2], attrs: mm[3], kids: [] }; st[st.length - 1].kids.push(n); st.push(n); }
    else st.pop();
  }
  root.kids.push(s.slice(last)); return root;
}
const get = (path, scope) => { const p = path.trim().split('.'); if (/^(true|false)$/.test(p[0])) return p[0] === 'true'; if (/^\d+$/.test(path.trim())) return +path; let cur = p[0] in scope ? scope[p[0]] : undefined; for (let i = 1; i < p.length; i++) cur = cur == null ? undefined : cur[p[i]]; return cur; };
const fill = (s, scope) => s.replace(/\s(on[A-Z]\w*)="\{\{[^}]*\}\}"/g, '').replace(/\{\{([^}]+)\}\}/g, (_, e) => { const v = get(e, scope); return v == null ? '' : String(v); });
function render(n, scope) {
  return n.kids.map((k) => {
    if (typeof k === 'string') return fill(k, scope);
    const attr = (name) => (k.attrs.match(new RegExp(name + '="\\{\\{\\s*([^}]+?)\\s*\\}\\}"')) || [])[1];
    if (k.tag === 'sc-if') return get(attr('value'), scope) ? render(k, scope) : '';
    const list = get(attr('list'), scope) || []; const as = (k.attrs.match(/as="(\w+)"/) || [])[1];
    return list.map((it, i) => render(k, Object.assign({}, scope, { [as]: it, $index: i }))).join('');
  }).join('');
}
const outBody = render(parse(body), vals).replace(/\s(disabled|checked)="(false|null|undefined|)"/g, '');
const html = `<!doctype html><html><head><meta charset="utf-8">${helmet}<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style></head><body>${outBody}</body></html>`;
fs.writeFileSync(out, html);
