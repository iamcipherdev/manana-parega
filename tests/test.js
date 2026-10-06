// Manana Parega v2 — story graph + full UI flow test (incl. minigame)
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];

// ---- stubs ----
let timers = [], tid = 0, timeouts = [], toid = 0, rafs = [];
global.setInterval = (fn) => { const id = ++tid; timers.push({ id, fn }); return id; };
global.clearInterval = (id) => { timers = timers.filter(t => t.id !== id); };
global.setTimeout = (fn) => { const id = ++toid; timeouts.push({ id, fn }); return id; };
global.clearTimeout = (id) => { timeouts = timeouts.filter(t => t.id !== id); };
global.requestAnimationFrame = (fn) => { rafs.push(fn); return rafs.length; };
global.cancelAnimationFrame = () => {};
global.performance = { now: () => 0 };
function runTimers(n) {
  for (let s = 0; s < n; s++) {
    if (!elems['mg'].classList._has('hidden')) break; // don't fast-forward minigame clock
    timers.slice().forEach(t => t.fn());
  }
}
function runTimeouts() { timeouts.splice(0).forEach(t => t.fn()); }
function runRafs(n) { for (let i = 0; i < n; i++) rafs.splice(0).forEach(fn => fn(i * 16)); }

function mkCL() {
  const s = new Set();
  return { add: c => s.add(c), remove: c => s.delete(c),
    toggle: (c, f) => { f === undefined ? (s.has(c) ? s.delete(c) : s.add(c)) : (f ? s.add(c) : s.delete(c)); },
    contains: c => s.has(c), _has: c => s.has(c) };
}
const elems = {};
let dynN = 0;
function mkEl(id) {
  const el = { id, innerHTML: '', textContent: '', style: {}, classList: mkCL(),
    onclick: null, _l: {}, _kids: [],
    appendChild(c) { this._kids.push(c); },
    addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); },
    click(ev) { ev = ev || { target: this };
      (this._l['click'] || []).forEach(fn => fn(ev));
      if (this.onclick) this.onclick(ev); },
    getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
    getBoundingClientRect: () => ({ width: 900, height: 700 }),
    offsetWidth: 100 };
  elems[id] = el; return el;
}
['stage','bg','stars','char','meterWrap','meterVal','meterFill','dlg','speaker','text','nextHint',
 'choices','menu','ending','endingEmoji','endingTitle','endingText','startBtn','againBtn','flash',
 'card','cardText','muteBtn','fx','mg','mgCanvas','mgScore','mgTime','mgBarFill'].forEach(mkEl);
elems['menu'].classList.remove('hidden');
['dlg','meterWrap','ending','mg','muteBtn'].forEach(i => elems[i].classList.add('hidden'));
global.document = {
  getElementById: id => elems[id] || mkEl(id),
  createElement: () => mkEl('dyn' + (dynN++)),
};
global.window = global;
global.window.addEventListener = () => {};

let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL -', n)); };

try { eval(js); } catch (e) { console.error('EVAL FAIL:', e.message); process.exit(1); }
const VN = global.window.__vn;
const { STORY, getEnding, charSVG, MG } = VN;

// --- 1. character art ---
for (const e of ['angry','annoyed','neutral','soft','happy','blush','surprised']) {
  const s = charSVG(e);
  ok(s.includes('<svg') && s.length > 1500, 'charSVG(' + e + ') ' + s.length + 'ch');
}

// --- 2. story graph BFS ---
const seenEnd = new Set(); let paths = 0, mgOnPath = false, minA = 999, maxA = -999;
(function bfs(id, anger, d) {
  if (d > 14) return;
  if (id === '__end__') { seenEnd.add(getEnding(anger).title); paths++;
    minA = Math.min(minA, anger); maxA = Math.max(maxA, anger); return; }
  const n = STORY[id];
  if (n.minigame) { mgOnPath = true; bfs(n.next, anger, d + 1); return; }
  n.choices.forEach(c => bfs(c.next, Math.max(0, Math.min(100, anger + c.anger)), d + 1));
})('start', 70, 0);
ok(mgOnPath, 'minigame on story path');
ok(paths > 100, 'paths: ' + paths);
ok(seenEnd.size >= 3, 'endings: ' + [...seenEnd].join(' | '));
ok(minA <= 20 && maxA > 80, `anger range ${minA}-${maxA} hits best+worst`);

// --- 3. full UI flow ---
elems['startBtn'].click();
ok(elems['menu'].classList._has('hidden'), 'menu hidden after start');
const finishTyping = () => runTimers(600);
const tapDlg = () => { if (!elems['dlg'].classList._has('hidden')) elems['dlg'].click({ target: elems['dlg'] }); };
finishTyping();
ok(elems['text'].textContent.length > 10, 'typewriter works');

let steps = 0, ended = false, mgPlayed = false, pickI = 0;
while (steps++ < 150 && !ended) {
  if (!elems['mg'].classList._has('hidden') && !mgPlayed) {
    mgPlayed = true;
    ok(MG.active, 'minigame active');
    for (let i = 0; i < 5; i++) MG.hearts.push({ x: 100 + i * 60, y: 200, vy: 100, size: 30, wob: 0 });
    let caught = 0;
    for (const h of MG.hearts.slice()) if (VN.mgTap(h.x, h.y)) caught++;
    ok(caught === 5, 'caught 5/5 hearts by tap');
    const before = parseInt(elems['meterVal'].textContent);
    VN.endMinigame(); runTimeouts(); // fires delayed showNode(next)
    const after = parseInt(elems['meterVal'].textContent);
    ok(after === Math.max(0, before - 10), `anger ${before}% -> ${after}% (-2/heart)`);
    ok(elems['mg'].classList._has('hidden'), 'minigame closed');
    continue;
  }
  finishTyping(); runRafs(3);
  const kids = (elems['choices']._kids || []).filter(b => b.textContent);
  if (kids.length) {
    kids[pickI++ % kids.length].click({ target: kids[0] });
    elems['choices']._kids = [];
  } else tapDlg();
  if (!elems['ending'].classList._has('hidden')) ended = true;
}
ok(mgPlayed, 'minigame played mid-story');
ok(ended, 'reached ending in ' + steps + ' steps: ' + elems['endingTitle'].textContent);
elems['againBtn'].click(); runTimeouts();
ok(!elems['dlg'].classList._has('hidden') && elems['ending'].classList._has('hidden'), 'replay resets');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
