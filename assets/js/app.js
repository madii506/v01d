// v01d · the page: the intro (it starts by itself), the world, its districts, and the engine that runs inside every building.
import { $, $$, esc, api, sleep, line, clear, toast, usd, price, ago, short, imgErr, copy, CA, initOut, follow, toTop } from './core.js';
import { CMDS, ALIAS, setRunner, showTab, chartHover, chartRedraw } from './cmds.js';
import { setExtraRunner, aliasOf, counted, stopTop } from './extra.js';
import * as SG from './signer.js';
import { createV01d, DISTRICTS } from '../v01d-3d.js?v=7';
import { DIST, manual } from './districts.js';
import { initPrompt } from './prompt.js';
import { createScore } from './score.js?v=2';

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

// ---------------------------------------------------------------- sound: on unless you turn it off. the score is written in code (score.js)
const SND = { on: ls.get('v01d:snd') !== '0' };
const score = createScore();
function sndLabel() {
  const st = score.state(), on = SND.on && st === 'on';
  $('#snd').setAttribute('aria-pressed', on); $('#isnd').setAttribute('aria-pressed', on);
  $('#isnd span').textContent = !SND.on ? 'sound off' : st === 'waiting' ? 'tap for sound' : 'sound on';
  $('#isnd').classList.toggle('wait', SND.on && st === 'waiting');
}
score.onState(sndLabel);
function soundStart() { score.start(); sndLabel(); }
function soundStop() { score.mute(); sndLabel(); }
function soundPing() { score.ping(); }
function soundOpen() { score.open(); }
function setSound(on) { SND.on = on; ls.set('v01d:snd', on ? '1' : '0'); if (on) soundStart(); else soundStop(); }
// browsers let sound start only after a tap or a key: the first one anywhere wakes it (and that tap doesn't also mute it)
let woke = 0;
['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { if (SND.on && score.state() !== 'on') { woke = performance.now(); soundStart(); } }, { capture: true, passive: true }));
const toggleSound = () => { if (performance.now() - woke < 800) return; setSound(!SND.on); };
window.addEventListener('v01d:sound', e => setSound(e.detail === 'on' ? true : e.detail === 'off' ? false : !SND.on));
$('#snd').onclick = toggleSound;
$('#isnd').onclick = toggleSound;
sndLabel();

// ---------------------------------------------------------------- the world
let V = null;
try { V = createV01d($('#w'), { low: LOW, still: REDUCED, onPick: id => go(id), onHover: id => hover(id) }); }
catch (e) { console.warn('v01d: no 3D here', e); document.documentElement.classList.add('no3d'); }

// district labels follow their islands
const LBL = {};
DISTRICTS.forEach((d, i) => {
  const el = document.createElement('button'); el.type = 'button'; el.className = 'lbl'; el.dataset.d = d.id;
  el.innerHTML = `<small>${String(i + 1).padStart(2, '0')}</small><b>${d.name}</b><em>${esc(DIST[d.id].tag)}</em>`;
  el.onclick = () => go(d.id); el.tabIndex = -1; el.style.setProperty('--i', i); $('#labels').appendChild(el); LBL[d.id] = el;
  el.onmouseenter = () => V && V.point(d.id); el.onmouseleave = () => V && V.point(null);
});
// labels keep inside the screen (a district at the edge still shows its name), and the far ones dim
const LW = {}, LH = {}; let TOPB = 70, LREV = 0; const measure = () => { for (const k in LBL) { LW[k] = LBL[k].offsetWidth || 90; LH[k] = LBL[k].offsetHeight || 34; } const t = $('.top'); TOPB = t ? t.getBoundingClientRect().bottom : 70; }; addEventListener('resize', measure);
// labels never sit on each other: the nearest district keeps its place, a farther one steps up out of the way (its leader
// line grows to still reach its island). when the world first shows, they come in one after another.
const placed = [];
if (V) V.onLabels((list, th) => {
  const vw = innerWidth, now = performance.now(); placed.length = 0;
  list.slice().sort((a, b) => a.d - b.d).forEach(l => {
    const el = LBL[l.id]; if (!el) return; if (!LW[l.id]) measure();
    const w = LW[l.id], h = LH[l.id] || 34, hw = w / 2, x = Math.min(vw - hw - 8, Math.max(hw + 8, l.x)), y0 = Math.max(l.y, TOPB + 8 + h);
    let y = y0;
    if (l.on) for (let pass = 0; pass < 8; pass++) {
      const hit = placed.find(b => x - hw < b.r + 6 && x + hw > b.l - 6 && y - h < b.b + 4 && y > b.t - 4);
      if (!hit) break; y = hit.t - 4;
    }
    if (y < TOPB + 8 + h) y = y0;                                       // no room above: stay put rather than leave the screen
    if (l.on) placed.push({ l: x - hw, r: x + hw, t: y - h, b: y });
    const i = DISTRICTS.findIndex(d => d.id === l.id), rv = LREV ? Math.min(1, Math.max(0, (now - LREV - i * 85) / 520)) : 1, ev = 1 - Math.pow(1 - rv, 3);
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${(y + (1 - ev) * 10).toFixed(1)}px, 0) translate(-50%, -100%)`;
    el.style.setProperty('--lead', (18 + Math.max(0, y0 - y)).toFixed(0) + 'px');
    el.style.opacity = (l.on ? (l.d > 330 ? .6 : 1) : 0) * ev; el.style.zIndex = String(1000 - Math.round(l.d));
  });
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
$$('#dnav [data-d]').forEach(b => { b.onclick = () => go(b.dataset.d); b.onmouseenter = () => { if (V) V.point(b.dataset.d); hover(b.dataset.d); glide(b); }; b.onmouseleave = () => { if (V) V.point(null); hover(null); }; });
// a soft pill glides under whichever district you point at, and settles on the open one
const GL = document.createElement('i'); GL.className = 'dn-gl'; $('#dnav').prepend(GL);
function glide(b) { if (!b) { GL.style.opacity = 0; return; } GL.style.opacity = 1; GL.style.width = b.offsetWidth + 'px'; GL.style.transform = `translateX(${b.offsetLeft}px)`; }
$('#dnav').addEventListener('mouseleave', () => glide($('#dnav [data-d].on')));
{
}

// ---------------------------------------------------------------- panels: a building opens
function open(id, { quiet = false } = {}) {
  const D = DIST[id]; if (!D) return;
  const P = $('#panel'); clearTimeout(closeT); P.classList.remove('out'); P.dataset.d = id; P.hidden = false; document.body.classList.add('pan');
  $('#lib').hidden = true;
  const i = DISTRICTS.findIndex(d => d.id === id);
  $('#p-no').textContent = String(i + 1).padStart(2, '0') + ' · ' + D.tag; $('#p-name').textContent = DISTRICTS[i].name; $('#p-line').innerHTML = D.line;
  $('#p-acts').innerHTML = D.ui();
  D.wire && D.wire($('#p-acts'), run);
  $$('#dnav [data-d]').forEach(b => b.classList.toggle('on', b.dataset.d === id)); glide($(`#dnav [data-d=${id}]`));
  P.classList.remove('in'); void P.offsetWidth; P.classList.add('in');
  if (V) { V.focus(id); reframe(); setTimeout(reframe, 480); }
  soundOpen();
  // what the building runs when you walk in; its output starts at the top
  if (!quiet && D.first) { clear(); Promise.resolve(D.first(run)).then(() => toTop()); }
  if (location.hash !== '#/' + id) history.replaceState(null, '', '#/' + id);
}
let closeT = 0;
function close() {
  const P = $('#panel');
  if (!P.hidden && !REDUCED) { P.classList.remove('in'); P.classList.add('out'); clearTimeout(closeT); closeT = setTimeout(() => { P.hidden = true; P.classList.remove('out'); }, 240); }
  else P.hidden = true;
  document.body.classList.remove('pan'); $('#lib').hidden = true;
  $$('#dnav [data-d]').forEach(b => b.classList.remove('on')); glide(null);
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
  const L = $('#lib'); if (!L.dataset.built) { L.innerHTML = manual(); L.dataset.built = '1'; L.querySelector('.lib-x').onclick = () => close(); L.querySelectorAll('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); go(a.dataset.go); });
    // each section rises into place the first time it scrolls into view
    if ('IntersectionObserver' in window && !REDUCED) { const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { root: L, threshold: .12 }); L.querySelectorAll('section').forEach(sc => { sc.classList.add('rv'); io.observe(sc); }); } }
  clearTimeout(closeT); $('#panel').classList.remove('out'); $('#panel').hidden = true; L.hidden = false; L.scrollTop = 0; document.body.classList.add('pan');
  $$('#dnav [data-d]').forEach(b => b.classList.toggle('on', b.dataset.d === 'library')); glide($('#dnav [data-d=library]'));
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
function showWorld() {
  introOn = false; $('#skip').hidden = true; $('#isnd').hidden = true; document.documentElement.classList.remove('intro-on'); $('#hud').hidden = false;
  document.documentElement.classList.remove('booting');
  requestAnimationFrame(() => { document.body.classList.add('world'); measure(); LREV = performance.now() + 350; });
  if (SND.on) soundStart(); score.world(); live();
  const h = location.hash.replace(/^#\//, ''); if (h && DIST[h]) setTimeout(() => go(h), 600);
  setTimeout(() => $('#hint').classList.add('gone'), 9000);
}
function skipIntro() { if (!introOn) return; if (V) V.skip(); else showWorld(); }
function startIntro() {
  ss.set('v01d:intro', '1');
  if (!V) { showWorld(); return; }
  introOn = true; document.documentElement.classList.add('intro-on'); document.documentElement.classList.remove('booting');
  $('#isnd').hidden = false; setTimeout(() => { if (introOn) $('#skip').hidden = false; }, 1200);
  score.intro(performance.now());                            // the intro first, so waking the sound doesn't start the world's music
  if (SND.on) soundStart();                                  // the sound is built (a moment), then picture and sound start on the same clock
  introT0 = performance.now(); score.intro(introT0); V.intro(showWorld);   // the score follows the intro's clock, even if sound only starts after a tap
}
$('#skip').onclick = skipIntro;
window.addEventListener('v01d:intro', () => { close(); $('#hud').hidden = true; document.body.classList.remove('world'); startIntro(); });

// the first visit in a tab plays the intro; a reload, a link straight to a district, or reduced motion goes straight in
const DEEP = !!DIST[location.hash.replace(/^#\//, '')] && !Q.has('intro');
const boot = () => { if (REDUCED || (ss.get('v01d:intro') && !Q.has('intro')) || !V || DEEP) { if (V) V.world(); showWorld(); } else startIntro(); };
// the intro waits (black, a moment) until the 3D has compiled everything, so its first seconds never stutter
if (V && V.ready) Promise.race([V.ready, sleep(7000)]).then(boot, boot); else boot();
