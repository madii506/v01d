// v01d · the page: the intro (it starts by itself), the world, its districts, and the engine that runs inside every building.
import { $, $$, esc, api, sleep, line, clear, toast, usd, price, ago, short, imgErr, copy, CA, initOut, follow, toTop } from './core.js';
import { CMDS, ALIAS, setRunner, showTab, chartHover, chartRedraw } from './cmds.js';
import { setExtraRunner, aliasOf, counted, stopTop } from './extra.js';
import * as SG from './signer.js';
import { createV01d, DISTRICTS } from '../v01d-3d.js?v=4';
import { DIST, manual } from './districts.js';
import { initPrompt } from './prompt.js';

const Q = new URLSearchParams(location.search);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LOW = Q.has('lowfx') || (navigator.hardwareConcurrency || 8) <= 4 || matchMedia('(max-width: 700px)').matches;
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// ---------------------------------------------------------------- the engine runner: every command, run inside the open building
let busy = 0;
export async function run(cmd, { echo = true } = {}) {
  cmd = String(cmd || '').trim(); if (!cmd) return;
  // run inside the open building; with none open, a report opens in radar and anything else in the terminal
  if ($('#panel').hidden) open(/^(token|chart|holders|tape|price|search|trending|new|scan)\b/i.test(cmd) ? 'radar' : 'terminal', { quiet: true });
  showTab('out'); follow();
  const el = echo ? line(`<span class="ps2">v01d:~$</span> <span class="c">${esc(cmd)}</span>`, 'cmdl') : null, t0 = performance.now(); let ok = true;
  counted(); stopTop();
  { const al = aliasOf(cmd.split(/\s+/)[0].toLowerCase()); if (al) cmd = al + cmd.slice(cmd.split(/\s+/)[0].length); }
  const parts = cmd.split(/\s+/), name0 = parts[0].toLowerCase(), name = ALIAS[name0] || name0, c = CMDS[name];
  const args = parts.slice(1).map(a => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) ? a : a.toLowerCase());
  const meta = () => { if (el && !el.querySelector('.cmeta')) el.insertAdjacentHTML('beforeend', `<span class="cmeta ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ${Math.round(performance.now() - t0)}ms</span>`); };
  if (!c) { ok = false; meta(); const near = Object.keys(CMDS).filter(k => k.startsWith(name0.slice(0, 2))).slice(0, 4); line(`<span class="r">not a command:</span> ${esc(name0)}${near.length ? ` <span class="d">· did you mean</span> ${near.map(n => `<span class="tok c" data-run="${n}">${n}</span>`).join(' ')}` : ''}`); return; }
  busy++; document.body.classList.add('busy');
  try { await c.run(args, cmd); }
  catch (e) { ok = false; line(`<span class="r">✗ ${esc(e.message || e)}</span>`); if (e.detail) line(`<span class="f">${esc(String(e.detail).slice(0, 220))}</span>`); }
  finally { busy--; if (!busy) document.body.classList.remove('busy'); meta(); }
}
setRunner(c => run(c)); setExtraRunner(c => run(c)); initOut();
window.v01dRun = run;
if (Q.has('dev')) queueMicrotask(() => { window.__v01d = { get V() { return V; }, go, close, open, run }; });

// clicks inside the engine: underlined things run, copy buttons copy, a click on empty output puts you back at the prompt
document.addEventListener('click', e => {
  const r = e.target.closest('[data-run]'); if (r) { e.preventDefault(); run(r.dataset.run); return; }
  const cp = e.target.closest('[data-copy]');
  if (cp) { e.preventDefault(); copy(cp.dataset.copy); cp.classList.add('ok'); const u = cp.querySelector('u'); if (u) u.textContent = 'copied'; clearTimeout(cp._t); cp._t = setTimeout(() => { cp.classList.remove('ok'); if (u) u.textContent = 'copy'; }, 1400); }
});
$('#out').addEventListener('click', e => { if (!getSelection().toString() && !e.target.closest('a,button,input,textarea,select,label,.tok,[data-run],[data-copy]') && innerWidth > 760) $('#cmd').focus({ preventScroll: true }); });
document.addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG') imgErr(t); }, true);
$$('#ctabs [data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));
$('#chart').addEventListener('mousemove', chartHover); $('#chart').addEventListener('mouseleave', chartRedraw); addEventListener('resize', chartRedraw);
initPrompt(run);

// ---------------------------------------------------------------- ctrl/cmd k: go anywhere, a district or any command
let palSel = 0, palList = [];
function openPal() { const p = $('#pal'); p.hidden = false; $('#pal-in').value = ''; palSel = 0; paintPal(); setTimeout(() => $('#pal-in').focus(), 10); }
function closePal() { $('#pal').hidden = true; }
function paintPal() {
  const q = $('#pal-in').value.toLowerCase().trim();
  const ds = DISTRICTS.map((d, i) => ({ k: 'd', id: d.id, a: `${i + 1} · ${d.name.toLowerCase()}`, b: DIST[d.id].tag, hay: d.id + ' ' + DIST[d.id].tag }));
  const cs = Object.values(CMDS).filter(c => c.help).map(c => ({ k: 'c', id: c.name, usage: c.usage, a: c.usage, b: c.help, hay: c.name + ' ' + c.help + ' ' + c.cat }));
  palList = [...ds, ...cs].filter(x => !q || x.hay.toLowerCase().includes(q)).slice(0, 60);
  palSel = Math.min(palSel, Math.max(0, palList.length - 1));
  $('#pal-l').innerHTML = palList.map((x, i) => `<div data-i="${i}" class="${i === palSel ? 'on' : ''}${x.k === 'd' ? ' pd' : ''}"><b>${x.k === 'd' ? '<i>go</i> ' : ''}${esc(x.a)}</b><span>${esc(x.b)}</span></div>`).join('') || '<div><span>nothing here</span></div>';
  const on = $('#pal-l .on'); if (on) on.scrollIntoView({ block: 'nearest' });
}
function pickPal(i) {
  const x = palList[i]; if (!x) return; closePal();
  if (x.k === 'd') return go(x.id);
  if (/[<\[]/.test(x.usage)) { if ($('#panel').hidden) open('terminal', { quiet: true }); $('#cmd').value = x.id + ' '; $('#cmd').dispatchEvent(new Event('input')); $('#cmd').focus(); }
  else run(x.id);
}
$('#pal-in').addEventListener('input', () => { palSel = 0; paintPal(); });
$('#pal-in').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palList.length - 1, palSel + 1); paintPal(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, palSel - 1); paintPal(); }
  else if (e.key === 'Enter') { e.preventDefault(); pickPal(palSel); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePal(); }
});
$('#pal-l').addEventListener('click', e => { const d = e.target.closest('[data-i]'); if (d) pickPal(+d.dataset.i); });
$('#pal').addEventListener('click', e => { if (e.target.id === 'pal') closePal(); });

// ---------------------------------------------------------------- sound: off unless asked; the room hums, the void breathes
const SND = { on: ls.get('v01d:snd') === '1', ctx: null, g: null, hum: null, low: null };
function soundStart() {
  if (SND.ctx) { SND.ctx.resume(); SND.g.gain.setTargetAtTime(.5, SND.ctx.currentTime, .4); return; }
  const C = new (window.AudioContext || window.webkitAudioContext)(); SND.ctx = C;
  const g = C.createGain(); g.gain.value = 0; g.connect(C.destination); SND.g = g;
  // the fluorescent hum: a buzz at 120 Hz, its harmonics through a band-pass
  const hum = C.createGain(); hum.gain.value = .0; hum.connect(g); SND.hum = hum;
  const o1 = C.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 120; const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 6;
  o1.connect(bp); bp.connect(hum); o1.start();
  const o2 = C.createOscillator(); o2.type = 'sine'; o2.frequency.value = 60; const g2 = C.createGain(); g2.gain.value = .35; o2.connect(g2); g2.connect(hum); o2.start();
  // the void: two detuned low sines and filtered noise, slowly breathing
  const low = C.createGain(); low.gain.value = 0; low.connect(g); SND.low = low;
  [[43.65, .5], [43.9, .45], [87.3, .12]].forEach(([f, v]) => { const o = C.createOscillator(); o.frequency.value = f; const gg = C.createGain(); gg.gain.value = v; o.connect(gg); gg.connect(low); o.start(); });
  const n = C.createBufferSource(), buf = C.createBuffer(1, C.sampleRate * 2, C.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  n.buffer = buf; n.loop = true; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; const ng = C.createGain(); ng.gain.value = .06; n.connect(lp); lp.connect(ng); ng.connect(low); n.start();
  const lfo = C.createOscillator(); lfo.frequency.value = .07; const lg = C.createGain(); lg.gain.value = .25; lfo.connect(lg); lg.connect(low.gain); lfo.start();
  g.gain.setTargetAtTime(.5, C.currentTime, .6);
}
function soundStop() { if (SND.ctx) SND.g.gain.setTargetAtTime(0, SND.ctx.currentTime, .3); }
// a coin is born somewhere: a far, soft chime. a building opens: a low breath of air. both quiet, both only with sound on.
function soundPing() {
  if (!SND.on || !SND.ctx) return; const C = SND.ctx, t = C.currentTime + .02;
  [[392, .035], [587.3, .018], [784.6, .008]].forEach(([f, v]) => { const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.value = f * (1 + (Math.random() - .5) * .006);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + 3.2); o.connect(g); g.connect(SND.g); o.start(t); o.stop(t + 3.3); });
}
function soundOpen() {
  if (!SND.on || !SND.ctx) return; const C = SND.ctx, t = C.currentTime + .01;
  const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(74, t); o.frequency.exponentialRampToValueAtTime(41, t + .35);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .7); o.connect(g); g.connect(SND.g); o.start(t); o.stop(t + .75);
  const n = C.createBufferSource(), b = C.createBuffer(1, C.sampleRate * .5, C.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(260, t + .45); f.Q.value = .8;
  const ng = C.createGain(); ng.gain.value = .045; n.buffer = b; n.connect(f); f.connect(ng); ng.connect(SND.g); n.start(t);
}
function soundScene(k) {      // 'room' | 'dark' | 'void'
  if (!SND.ctx) return; const t = SND.ctx.currentTime;
  SND.hum.gain.setTargetAtTime(k === 'room' ? .09 : 0, t, k === 'dark' ? .02 : .5);
  SND.low.gain.setTargetAtTime(k === 'void' ? .55 : k === 'dark' ? .25 : 0, t, 1.2);
}
function setSound(on) {
  SND.on = on; ls.set('v01d:snd', on ? '1' : '0');
  $('#snd').setAttribute('aria-pressed', on); $('#isnd').setAttribute('aria-pressed', on); $('#isnd span').textContent = on ? 'sound on' : 'sound off';
  if (on) { soundStart(); soundScene(introScene()); } else soundStop();
}
window.addEventListener('v01d:sound', e => setSound(e.detail === 'on' ? true : e.detail === 'off' ? false : !SND.on));
$('#snd').onclick = () => setSound(!SND.on);
$('#isnd').onclick = () => setSound(!SND.on);
$('#isnd').setAttribute('aria-pressed', SND.on); $('#isnd span').textContent = SND.on ? 'sound on' : 'sound off';

// ---------------------------------------------------------------- the world
let V = null;
try { V = createV01d($('#w'), { low: LOW, still: REDUCED, onPick: id => go(id), onHover: id => hover(id) }); }
catch (e) { console.warn('v01d: no 3D here', e); document.documentElement.classList.add('no3d'); }

// district labels follow their islands
const LBL = {};
DISTRICTS.forEach((d, i) => {
  const el = document.createElement('button'); el.type = 'button'; el.className = 'lbl'; el.dataset.d = d.id;
  el.innerHTML = `<small>${String(i + 1).padStart(2, '0')}</small><b>${d.name}</b><em>${esc(DIST[d.id].tag)}</em>`;
  el.onclick = () => go(d.id); el.tabIndex = -1; $('#labels').appendChild(el); LBL[d.id] = el;
  el.onmouseenter = () => V && V.point(d.id); el.onmouseleave = () => V && V.point(null);
});
// labels keep inside the screen (a district at the edge still shows its name), and the far ones dim
const LW = {}; let TOPB = 70; const measure = () => { for (const k in LBL) LW[k] = LBL[k].offsetWidth || 90; const t = $('.top'); TOPB = t ? t.getBoundingClientRect().bottom : 70; }; addEventListener('resize', measure);
if (V) V.onLabels((list, th) => {
  const vw = innerWidth;
  for (const l of list) {
    const el = LBL[l.id]; if (!el) continue; if (!LW[l.id]) measure();
    const hw = LW[l.id] / 2, x = Math.min(vw - hw - 8, Math.max(hw + 8, l.x)), y = Math.max(l.y, TOPB + 8 + el.offsetHeight);
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    el.style.opacity = l.on ? (l.d > 330 ? .6 : 1) : 0; el.style.zIndex = String(1000 - Math.round(l.d));
  }
});
function hover(id) { $$('.lbl').forEach(el => el.classList.toggle('hov', el.dataset.d === id)); }
// each label says one true, live thing about its district (falls back to its name when there is nothing to say)
function tag(id, text) { const el = LBL[id] && LBL[id].querySelector('em'); if (el && text && el.textContent !== text) { el.textContent = text; LW[id] = 0; } }
async function liveTags() {
  tag('terminal', `${Object.keys(CMDS).filter(k => CMDS[k].help).length} commands`);
  tag('scan', '0 trackers · 0 cookies');
  tag('orders', 'limit + dca, on jupiter');
  const s = SG.state(); tag('locker', s.use === 'burner' && s.burner ? 'burner ' + short(s.burner.address) : s.wallet ? s.wallet.name.toLowerCase() + ' ' + short(s.wallet.address) : 'no signer yet');
  try { const j = await api('coins', { params: { limit: 50 } }); const n = (j.coins || []).filter(c => c.status === 'launched').length; tag('launch', n ? `${n}${n >= 50 ? '+' : ''} coins born here` : 'nothing born here yet'); } catch {}
  try { const j = await api('stocks'); const t = (j.tokens || []).filter(x => x.c24h != null).sort((a, b) => Math.abs(b.c24h) - Math.abs(a.c24h))[0]; if (t) tag('stocks', `${t.sym} ${t.c24h >= 0 ? '+' : ''}${t.c24h.toFixed(1)}% today`); } catch {}
}

// the district bar and the map
$('#dnav').innerHTML = DISTRICTS.map((d, i) => `<button type="button" data-d="${d.id}"><small>${i + 1}</small>${d.name.toLowerCase()}</button>`).join('');
$$('#dnav [data-d]').forEach(b => { b.onclick = () => go(b.dataset.d); b.onmouseenter = () => { if (V) V.point(b.dataset.d); hover(b.dataset.d); }; b.onmouseleave = () => { if (V) V.point(null); hover(null); }; });
{
}

// ---------------------------------------------------------------- panels: a building opens
function open(id, { quiet = false } = {}) {
  const D = DIST[id]; if (!D) return;
  const P = $('#panel'); P.dataset.d = id; P.hidden = false; document.body.classList.add('pan');
  $('#lib').hidden = true;
  const i = DISTRICTS.findIndex(d => d.id === id);
  $('#p-no').textContent = String(i + 1).padStart(2, '0') + ' · ' + D.tag; $('#p-name').textContent = DISTRICTS[i].name; $('#p-line').innerHTML = D.line;
  $('#p-acts').innerHTML = D.ui();
  D.wire && D.wire($('#p-acts'), run);
  $$('#dnav [data-d]').forEach(b => b.classList.toggle('on', b.dataset.d === id));
  P.classList.remove('in'); void P.offsetWidth; P.classList.add('in');
  if (V) { V.focus(id); reframe(); setTimeout(reframe, 480); }
  soundOpen();
  // what the building runs when you walk in; its output starts at the top
  if (!quiet && D.first) { clear(); Promise.resolve(D.first(run)).then(() => toTop()); }
  if (location.hash !== '#/' + id) history.replaceState(null, '', '#/' + id);
}
function close() {
  $('#panel').hidden = true; document.body.classList.remove('pan'); $('#lib').hidden = true;
  $$('#dnav [data-d]').forEach(b => b.classList.remove('on'));
  if (V) { V.focus(null); V.frame(0, 0); } history.replaceState(null, '', '#/');
}
// keep the open district in the part of the screen the panel leaves free
function reframe() {
  if (!V) return;
  if ($('#panel').hidden) return V.frame(0, 0);
  if (innerWidth > 760) { const pw = $('#panel').getBoundingClientRect().width || Math.min(600, innerWidth * .46); V.frame((pw + 16) / 2 / innerWidth, 0); }
  else V.frame(0, .37);
}
addEventListener('resize', reframe);
function go(id) {
  if (id === 'library') { openLib(); return; }
  open(id);
}
function openLib() {
  const L = $('#lib'); if (!L.dataset.built) { L.innerHTML = manual(); L.dataset.built = '1'; L.querySelector('.lib-x').onclick = () => close(); L.querySelectorAll('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); go(a.dataset.go); }); }
  $('#panel').hidden = true; L.hidden = false; L.scrollTop = 0; document.body.classList.add('pan');
  $$('#dnav [data-d]').forEach(b => b.classList.toggle('on', b.dataset.d === 'library'));
  if (V) { V.focus('library'); V.frame(0, 0); } history.replaceState(null, '', '#/library');
}
$('#p-x').onclick = close;
window.addEventListener('v01d:go', e => go(e.detail));
addEventListener('keydown', e => {
  const typing = /input|textarea|select/i.test(document.activeElement && document.activeElement.tagName);
  if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !gateOpen() && !introOn) { e.preventDefault(); $('#pal').hidden ? openPal() : closePal(); return; }
  if (e.key === 'Escape') { if (gateOpen()) return; if (introOn) { skipIntro(); return; } if (!$('#pal').hidden) { closePal(); return; } if (!typing) close(); return; }
  if (typing || gateOpen() || introOn) return;
  if (e.key === '/') { e.preventDefault(); if ($('#panel').hidden) open('terminal'); $('#cmd').focus(); return; }
  const n = parseInt(e.key, 10); if (n >= 1 && n <= DISTRICTS.length) go(DISTRICTS[n - 1].id);
});
$('#kbtn').onclick = () => { open('terminal'); setTimeout(() => $('#cmd').focus(), 60); };
$('.brand').onclick = e => { e.preventDefault(); close(); };

// ---------------------------------------------------------------- the signer chip
SG.onSigner(s => {
  const b = $('#sig'), sp = b.querySelector('span'), dot = b.querySelector('.dot');
  if (s.use === 'burner' && s.burner) { sp.textContent = 'burner ' + short(s.burner.address); dot.className = 'dot on b'; }
  else if (s.wallet) { sp.textContent = s.wallet.name.toLowerCase() + ' ' + short(s.wallet.address); dot.className = 'dot on'; }
  else { sp.textContent = 'no signer'; dot.className = 'dot'; }
  if (Object.keys(LBL).length) tag('locker', s.use === 'burner' && s.burner ? 'burner ' + short(s.burner.address) : s.wallet ? s.wallet.name.toLowerCase() + ' ' + short(s.wallet.address) : 'no signer yet');
  const sg = $('#signer'); if (sg) sg.innerHTML = `signer: <b>${s.active ? (s.use === 'burner' && s.burner ? 'burner ' : 'wallet ') + short(s.active) : 'none'}</b>`;
});
$('#sig').onclick = () => go('locker');

// ---------------------------------------------------------------- live: the chain's pulse, new coins, anons here
const SEENM = new Set(); let feedFirst = true;
async function feed() {
  try {
    const j = await api('pulse'); const list = (j.fresh || []).slice(0, 7);
    let fresh = 0; list.forEach(t => { if (!SEENM.has(t.mint)) { SEENM.add(t.mint); fresh++; } });
    if (!feedFirst && fresh) { if (V) V.beacon(); soundPing(); }
    { const now = Date.now(), all = j.fresh || [], m = all.filter(t => now - Date.parse(t.created) < 60000).length; tag('radar', m ? `${m}${m >= all.length && all.length >= 20 ? '+' : ''} born in the last minute` : 'watching raydium'); }
    feedFirst = false;
  } catch {}
}
async function net() {
  try { const j = await api('ping'); if (j.sol) tag('swap', 'SOL $' + j.sol.toFixed(2)); } catch {}
}
// presence: a random id for this tab only, counted for a minute, never stored with anything else
const ME = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).replace(/-/g, '').slice(0, 20);
async function here() {
  try { const j = await api('here', { method: 'POST', body: { id: ME } }); if (V) V.anons(j.n || 0); } catch {}
}
let liveT = 0;
function live() { feed(); net(); here(); liveTags(); clearInterval(liveT); liveT = setInterval(() => { if (!document.hidden) { feed(); here(); } }, 12000); setInterval(() => { if (!document.hidden) { net(); liveTags(); } }, 30000); }

// ---------------------------------------------------------------- the intro: it starts by itself
let introOn = false, introT0 = 0;
const gateOpen = () => false;
const introScene = () => { if (!V || V.mode === 'world') return 'void'; const t = (performance.now() - introT0) / 1000; return t > 13.7 ? 'void' : t > 8.6 ? 'dark' : 'room'; };
function showWorld() {
  introOn = false; $('#skip').hidden = true; $('#isnd').hidden = true; document.documentElement.classList.remove('intro-on'); $('#hud').hidden = false;
  requestAnimationFrame(() => { document.body.classList.add('world'); measure(); });
  soundScene('void'); live();
  const h = location.hash.replace(/^#\//, ''); if (h && DIST[h]) setTimeout(() => go(h), 600);
  setTimeout(() => $('#hint').classList.add('gone'), 9000);
}
function skipIntro() { if (!introOn) return; if (V) V.skip(); else showWorld(); }
function startIntro() {
  ss.set('v01d:intro', '1');
  if (!V) { showWorld(); return; }
  introOn = true; introT0 = performance.now(); document.documentElement.classList.add('intro-on');
  $('#isnd').hidden = false; setTimeout(() => { if (introOn) $('#skip').hidden = false; }, 1200);
  if (SND.on) { soundStart(); soundScene('room'); }
  // the hum thins as the lights die around the desk; the void opens as the screen throws you in
  setTimeout(() => introOn && soundScene('dark'), 8600); setTimeout(() => introOn && soundScene('void'), 13700);
  V.intro(showWorld);
}
$('#skip').onclick = skipIntro;
window.addEventListener('v01d:intro', () => { close(); $('#hud').hidden = true; document.body.classList.remove('world'); startIntro(); });

// the first visit in a tab plays the intro; a reload, a link straight to a district, or reduced motion goes straight in
const DEEP = !!DIST[location.hash.replace(/^#\//, '')] && !Q.has('intro');
if (REDUCED || (ss.get('v01d:intro') && !Q.has('intro')) || !V || DEEP) { if (V) V.world(); showWorld(); }
else startIntro();
