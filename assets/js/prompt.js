// v01d · the prompt under every building: history (kept in this browser only), ghost completion, token suggestions
// from a live search, tab to take them, ctrl+l to clear.
import { $, $$, esc, api, line, clear, history, pushHist, SEEN, follow } from './core.js';
import { CMDS, ALIAS } from './cmds.js';

const TOKEN_CMDS = new Set(['token', 'chart', 'price', 'buy', 'sell', 'holders', 'tape', 'watch', 'unwatch', 'swap', 'search', 'info', 'c', 'p', 't', 'limit', 'dca', 'alert']);
const SUB = { launch: ['--wallet'], burner: ['new', 'save', 'load', 'use', 'fund', 'sweep', 'forget'], trending: ['5m', '1h', '6h', '24h'], use: ['burner', 'wallet'], sound: ['on', 'off'] };

export function initPrompt(run) {
  const inp = $('#cmd'), ghost = $('#ghost'), form = $('#tin'); let hi = -1;
  const names = () => [...Object.keys(CMDS), ...Object.keys(ALIAS)].sort((a, b) => a.length - b.length);
  function suggest(v) {
    if (!v) return '';
    if (!/\s/.test(v)) { const n = names().find(k => k.startsWith(v.toLowerCase()) && k !== v.toLowerCase()); return n ? n.slice(v.length) : ''; }
    const parts = v.split(/\s+/), c = ALIAS[parts[0].toLowerCase()] || parts[0].toLowerCase(), last = parts[parts.length - 1].toLowerCase().replace('$', '');
    if (SUB[c] && parts.length === 2 && last) { const s = SUB[c].find(x => x.startsWith(last) && x !== last); return s ? s.slice(last.length) : ''; }
    if (TOKEN_CMDS.has(c) && last && !/^\d/.test(last)) { const k = ['sol', 'usdc', 'usdt', ...SEEN.keys()].find(x => x.startsWith(last) && x !== last); return k ? k.slice(last.length) : ''; }
    return '';
  }
  const paintGhost = () => { const v = inp.value, s = suggest(v); ghost.textContent = s ? v + s : ''; ghost.dataset.s = s; };

  // token suggestions while you type a token: arrows to pick, tab or a click to take it
  const sug = document.createElement('div'); sug.className = 'sug'; sug.hidden = true; form.appendChild(sug);
  let list = [], sel = 0, timer = 0, asked = '';
  const hide = () => { sug.hidden = true; list = []; };
  function word() {
    const v = inp.value; if (!/\s/.test(v)) return null;
    const parts = v.split(/\s+/), c = ALIAS[parts[0].toLowerCase()] || parts[0].toLowerCase(), w = parts[parts.length - 1];
    if (!TOKEN_CMDS.has(c) || !w || w.length < 2 || /^[\d.%@]/.test(w) || w.length > 30) return null;
    return w.replace('$', '');
  }
  function paint() {
    if (!list.length) return hide();
    sug.innerHTML = `<span class="sh">tokens · ↑↓ pick · tab to take it</span>` + list.map((t, i) => `<div data-i="${i}" class="${i === sel ? 'on' : ''}"><img class="ic" alt="" src="${t.icon ? '/api/img?u=' + encodeURIComponent(t.icon) : '/assets/img/mark-64.png'}"><b>${esc(t.sym)}</b><span>${esc((t.name || '').slice(0, 26))}</span></div>`).join('');
    sug.hidden = false;
  }
  function take(i) { const t = list[i]; if (!t) return false; inp.value = inp.value.replace(/\S+$/, t.mint) + ' '; SEEN.set(String(t.sym).toLowerCase(), t.mint); hide(); paintGhost(); inp.focus(); return true; }
  sug.addEventListener('mousedown', e => { const d = e.target.closest('[data-i]'); if (d) { e.preventDefault(); take(+d.dataset.i); } });

  inp.addEventListener('input', () => {
    paintGhost(); const w = word(); clearTimeout(timer); if (!w) return hide();
    timer = setTimeout(async () => { asked = w; try { const j = await api('search', { params: { q: w } }); if (asked !== w || word() !== w) return; list = (j.tokens || []).slice(0, 6); sel = 0; paint(); } catch { hide(); } }, 220);
  });
  inp.addEventListener('blur', () => setTimeout(hide, 150));
  form.addEventListener('submit', e => {
    e.preventDefault(); const v = inp.value.trim(); inp.value = ''; paintGhost(); hide(); hi = -1;
    if (!v) return; pushHist(v); follow(); run(v);
  });
  inp.addEventListener('keydown', e => {
    const h = history();
    if (!sug.hidden && list.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % list.length; paint(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + list.length) % list.length; paint(); return; }
      if (e.key === 'Tab') { e.preventDefault(); take(sel); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); return; }
    }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (hi < h.length - 1) inp.value = h[++hi]; paintGhost(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.max(-1, hi - 1); inp.value = hi < 0 ? '' : h[hi]; paintGhost(); }
    else if (e.key === 'Tab' || (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length && ghost.dataset.s)) {
      e.preventDefault(); const s = ghost.dataset.s;
      if (s) { inp.value += s + (/\s/.test(inp.value) ? '' : ' '); paintGhost(); return; }
      const v = inp.value.toLowerCase(); if (v && !/\s/.test(v)) { const hit = names().filter(k => k.startsWith(v)); if (hit.length) line(`<span class="d">${hit.map(esc).join('   ')}</span>`); }
    }
    else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); clear(); }
    else if (e.key === 'Escape') { inp.blur(); }
  });
  // anything in the output with data-fill puts that text in the prompt
  document.addEventListener('click', e => { const f = e.target.closest('[data-fill]'); if (f) { e.preventDefault(); inp.value = f.dataset.fill; paintGhost(); inp.focus(); } });
}
