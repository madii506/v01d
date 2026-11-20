// v01d · every command. Each one is real: quotes, transactions and data come from the chain, Jupiter and the
// launch engine; the wallet (or a burner born in this tab) signs. Nothing here is a demo.
import { $, $$, api, esc, short, ago, usd, price, pct, amt, img, line, block, spinner, dots, sleep, clear, copy, toast, isAddr, unb64, b64, history, forgetHist, seen, SEEN, pic, CA } from './core.js';
import * as SG from './signer.js';
import { drawChart, spark } from './chart.js';
import { launchForm, claimForm, coinsTable, engine, STATUS, WHY } from './launch.js';
import { startPulse, stopPulse, setPulseRunner } from './pulse.js';

export const CMDS = {}, ALIAS = {};
export const def = (name, cat, usage, help, run, alias = []) => { CMDS[name] = { name, cat, usage, help, run }; alias.forEach(a => { ALIAS[a] = name; }); };
let RUN = () => {}; export const setRunner = f => { RUN = f; setPulseRunner(x => { showTab('out'); f(x); }); };
const tx = s => `<a href="https://solscan.io/tx/${s}" target="_blank" rel="noopener noreferrer">transaction ↗</a>`;
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const signerLabel = () => { const s = SG.state(); return s.use === 'burner' && s.burner ? `burner ${short(s.burner.address)}` : s.wallet ? `wallet ${short(s.wallet.address)}` : 'none'; };
async function ensureSigner() {
  const s = SG.state(); if (s.active) return s.active;
  const sp = spinner('no signer yet · connecting your wallet');
  try { const w = await SG.connectAny(); sp.done(`<span class="o">✓</span> ${dots('wallet', `<span class="c">${esc(w.name)} ${short(w.address)}</span>`)}`); return w.address; }
  catch (e) { sp.fail(esc(e.message)); throw new Error('Connect a wallet (connect) or make a burner (burner new) first.'); }
}
// sign, send, confirm: the same path for swaps, sends and orders
async function signAndSend(txB64, what = 'transaction') {
  const kind = SG.activeKind();
  const W = spinner(kind === 'burner' ? 'signing with the burner in this tab' : '<span class="h">approve it in your wallet</span>');
  let signed; try { signed = await SG.sign(txB64, kind); } catch (e) { W.fail(esc(e.message)); throw e; }
  W.done(`<span class="o">✓</span> ${dots('signed', `<span class="c">${kind === 'burner' ? 'by the burner' : 'by your wallet'}</span>`)}`);
  const S = spinner('sending to solana'); const r = await api('relay', { method: 'POST', body: { tx: signed } });
  S.set(`sending to solana · <span class="f">${short(r.sig)}</span>`);
  for (let i = 0; i < 40; i++) {
    await sleep(1600);
    try { const st = (await api('sig', { params: { sig: r.sig } })).status; if (st && st.done) { if (st.err) { S.fail(`${what} failed on chain · ${tx(r.sig)}`); throw new Error('It failed on chain. Usually the price moved: try again, or raise the slippage.'); } S.done(`<span class="o">✓</span> ${what} confirmed · ${tx(r.sig)}`); return r.sig; } } catch (e) { if (/failed on chain/.test(e.message)) throw e; }
  }
  S.done(`<span class="w">…</span> sent, still confirming · ${tx(r.sig)}`); return r.sig;
}
const tokLink = t => `<span class="tok" data-run="token ${esc(t.mint)}"><b>${esc(t.sym || short(t.mint))}</b></span>`;
const icon = t => pic(t);

// ---------------------------------------------------------------- LAUNCH
def('launch', 'launch', 'launch [--wallet]', 'a coin on raydium launchlab. private and free by default; --wallet signs, pays and can buy first', a => {
  if (a.includes('--bonk') || a.includes('--stonk') || a.includes('--pump')) { line('<span class="w">!</span> <span class="m">bonk.fun, stonk.fun and pump.fun launch only through their own sites. v01d launches on raydium launchlab, in its own launchpad: privately (free) or from your wallet.</span>'); }
  launchForm(a.includes('--wallet') || a.includes('wallet'));
});
def('coins', 'launch', 'coins', 'every coin launched on v01d', () => coinsTable());
def('claim', 'launch', 'claim', 'claim creator fees with your key file or wallet; the network fee is paid for you', () => claimForm());

// ---------------------------------------------------------------- TRADE
async function quoteBlock({ amount, from, to, slip = 100, title }) {
  const sp = spinner(`routing ${esc(amount)} ${esc(from)} → ${esc(to)} across every dex`);
  let q; try { q = await api('quote', { params: { in: from, out: to, amount, slip } }); } catch (e) { sp.fail(esc(e.message)); throw e; }
  sp.done(`<span class="o">✓</span> ${dots('best route', `<span class="c">${esc(q.route.join(' → ') || 'direct')}</span>`)}`); seen(q.in); seen(q.out);
  let usdIn = null; try { const p = await api('price', { params: { ids: [q.in.mint, q.out.mint].join(',') } }); usdIn = p.prices[q.in.mint] ? p.prices[q.in.mint].usd * q.inUi : null; } catch {}
  const b = block(title || `swap · ${esc(q.inUi)} ${esc(q.in.sym)} → ${esc(q.out.sym)}`, `
    <div class="kvg">
      <div><span>you pay</span><b>${amt(q.inUi)} ${tokLink(q.in)}</b>${usdIn != null ? ` <span class="f">${usd(usdIn, 2)}</span>` : ''}</div>
      <div><span>you get about</span><b>${amt(q.outUi)} ${tokLink(q.out)}</b></div>
      <div><span>at least</span><b>${amt(q.minUi)}</b> <span class="f">${(q.slip / 100).toFixed(1)}% slippage</span></div>
      <div><span>price impact</span><b class="${q.impact > 3 ? 'dn' : q.impact > 1 ? 'w' : ''}">${q.impact < .01 ? '<0.01' : q.impact.toFixed(2)}%</b></div>
    </div>
    <p class="d" style="margin:10px 0 0">route <span class="c">${esc(q.route.join(' → ') || 'direct')}</span> · signer <span class="c" data-sg>${signerLabel()}</span></p>
    <div class="row" style="margin-top:12px"><button type="button" class="btn" data-go>sign &amp; swap</button><button type="button" class="btn ghost sm" data-re>requote</button><span class="d">slippage</span>${[50, 100, 300, 1000].map(s => `<button type="button" class="btn ghost sm${s === q.slip ? ' on' : ''}" data-s="${s}" style="${s === q.slip ? 'border-color:#ecebe6' : ''}">${s / 100}%</button>`).join('')}</div>
    <div class="err" data-err></div>`);
  const go = b.querySelector('[data-go]');
  b.querySelector('[data-re]').onclick = () => { b.remove(); quoteBlock({ amount, from, to, slip, title }); };
  b.querySelectorAll('[data-s]').forEach(x => x.onclick = () => { b.remove(); quoteBlock({ amount, from, to, slip: +x.dataset.s, title }); });
  go.onclick = async () => {
    go.disabled = true; b.querySelector('[data-err]').textContent = '';
    try {
      const owner = await ensureSigner(); b.querySelector('[data-sg]').textContent = signerLabel();
      const fresh = await api('quote', { params: { in: q.in.mint, out: q.out.mint, amount, slip } });
      const B = spinner('building the swap'); let s; try { s = await api('swap', { method: 'POST', body: { owner, quote: fresh.quote } }); } catch (e) { B.fail(esc(e.message)); throw e; }
      B.done(`<span class="o">✓</span> ${dots('swap built', `<span class="c">${amt(fresh.outUi)} ${esc(q.out.sym)} expected</span>`)}`);
      const sig = await signAndSend(s.tx, 'swap'); setTimeout(() => window.dispatchEvent(new Event('v01d:balances')), 1500);
      window.dispatchEvent(new CustomEvent('v01d:trade', { detail: { in: { mint: q.in.mint, sym: q.in.sym }, out: { mint: q.out.mint, sym: q.out.sym }, inUi: fresh.inUi, outUi: fresh.outUi, usd: usdIn != null ? usdIn * (fresh.inUi / q.inUi) : null, sig, at: Date.now() } }));
    } catch (e) { b.querySelector('[data-err]').textContent = e.message; go.disabled = false; }
  };
  return q;
}
def('swap', 'trade', 'swap <amount> <from> <to> [slip%]', 'swap any two tokens on any solana dex (jupiter finds the route)', async a => {
  need(a.length >= 3, 'Try: swap 0.5 sol usdc  ·  swap 100 usdc bonk  ·  swap 1 sol <mint>');
  let [amount, from, to, s] = a; if (/^(to|for|->)$/.test(to) && a[3]) { to = a[3]; s = a[4]; }
  await quoteBlock({ amount: amount.replace(',', '.'), from, to, slip: s ? Math.round(parseFloat(s) * 100) : 100 });
});
def('ca', 'system', 'ca', 'the v01d contract address: copy it, buy it, chart it', () => {
  if (!CA) { line('<span class="d">no contract yet.</span> <span class="m">the $V01D address goes here the moment it exists. nothing else is it.</span>'); return; }
  line(`<span class="d">ca</span>  <span class="c">${CA}</span>`);
  line(`<span class="tok c" data-copy="${CA}">copy</span> · <span class="tok c" data-run="buy ${CA} 0.1">buy 0.1</span> · <span class="tok c" data-run="chart ${CA}">chart</span> · <span class="tok c" data-run="token ${CA}">report</span>`);
}, ['contract', 'address']);
def('buy', 'trade', 'buy <token> <sol>', 'buy any token or any coin born on raydium with SOL', async a => {
  need(a.length >= 2, 'Try: buy bonk 0.1  ·  buy <mint> 0.25');
  let [t, sol] = a; if (/^\d*\.?\d+$/.test(t) && !/^\d*\.?\d+$/.test(sol)) [t, sol] = [sol, t];
  await quoteBlock({ amount: sol, from: 'sol', to: t, title: `buy · ${esc(sol)} SOL of ${esc(t)}` });
});
def('sell', 'trade', 'sell <token> <percent|amount>', 'sell a token back to SOL: 50%, 100% or an amount', async a => {
  need(a.length >= 2, 'Try: sell bonk 50%  ·  sell <mint> 100%  ·  sell wif 25');
  const [t, v] = a; let amount = v;
  if (/%$/.test(v)) {
    const owner = await ensureSigner(); const sp = spinner('reading your balance');
    const [h, tk] = await Promise.all([api('holdings', { params: { owner } }), api('token', { params: { q: t } })]);
    const row = h.tokens.find(x => x.mint === tk.token.mint); if (!row) { sp.fail(`you hold no ${esc(tk.token.sym)}`); return; }
    const k = Math.max(0, Math.min(100, parseFloat(v))) / 100; amount = String((row.ui * k).toFixed(Math.min(row.dec, 9)).replace(/\.?0+$/, ''));
    sp.done(`<span class="o">✓</span> ${dots('balance', `<span class="c">${amt(row.ui)} ${esc(tk.token.sym)}</span> · selling ${Math.round(k * 100)}%`)}`);
  }
  await quoteBlock({ amount, from: t, to: 'sol', title: `sell · ${esc(v)} ${esc(t)} → SOL` });
});
def('limit', 'trade', 'limit <buy|sell> <token> <amount> @ <price>', 'a limit order on jupiter: buy with SOL below a price, or sell above one (min about $5)', async a => {
  need(a.length >= 4, 'Try: limit buy bonk 0.5 @ 0.000018  (0.5 SOL, when BONK costs 0.000018 SOL)  ·  limit sell wif 100 @ 0.012');
  const side = a[0]; need(side === 'buy' || side === 'sell', 'Start with buy or sell.');
  const rest = a.slice(1).filter(x => x !== '@'); const [t, amount, p] = rest; need(p, 'Give a price after @, in SOL per token.');
  const owner = await ensureSigner();
  const sp = spinner('building the limit order on jupiter');
  const body = side === 'buy' ? { op: 'create', side, in: 'sol', out: t, amount, price: p, owner } : { op: 'create', side, in: t, out: 'sol', amount, price: p, owner };
  let j; try { j = await api('limit', { method: 'POST', body }); } catch (e) { sp.fail(esc(e.message)); throw e; }
  sp.done(`<span class="o">✓</span> ${dots('order', `<span class="c">${side} ${side === 'buy' ? amt(j.takingUi) + ' ' + esc(j.out.sym) + ' for ' + esc(amount) + ' SOL' : esc(amount) + ' ' + esc(j.in.sym) + ' for ' + amt(j.takingUi) + ' SOL'}</span> <span class="f">@ ${esc(p)} SOL</span>`)}`);
  const kind = SG.activeKind(); const W = spinner(kind === 'burner' ? 'signing with the burner' : '<span class="h">approve it in your wallet</span>');
  const signed = await SG.sign(j.tx, kind).catch(e => { W.fail(esc(e.message)); throw e; }); W.done(`<span class="o">✓</span> ${dots('signed', '<span class="c">yes</span>')}`);
  const E = spinner('placing it'); const r = await api('limit', { method: 'POST', body: { op: 'execute', tx: signed, requestId: j.requestId } });
  if (r.status && /fail/i.test(r.status)) { E.fail(esc(r.error || 'the order was not placed')); return; }
  E.done(`<span class="o">✓</span> order placed${r.sig ? ' · ' + tx(r.sig) : ''} · <span class="d">see it with</span> <span class="c">orders</span>`);
});
def('orders', 'trade', 'orders', 'your open limit orders and dca plans, with cancel', async () => {
  const owner = await ensureSigner(); const sp = spinner('reading your orders');
  const [o, d] = await Promise.allSettled([api('limit', { method: 'POST', body: { op: 'list', owner } }), api('dca', { method: 'POST', body: { op: 'list', owner } })]);
  sp.done(`<span class="o">✓</span> ${dots('orders', `<span class="c">${o.status === 'fulfilled' ? o.value.orders.length : '?'} limit · ${d.status === 'fulfilled' ? d.value.plans.length : '?'} dca</span>`)}`);
  const lo = o.status === 'fulfilled' ? o.value.orders : [], pl = d.status === 'fulfilled' ? d.value.plans : [];
  if (!lo.length && !pl.length) return line('<span class="m">nothing open. try</span> <span class="c">limit buy bonk 0.5 @ 0.000018</span> <span class="m">or</span> <span class="c">dca 1 sol jup every 1d x5</span>');
  const b = block('open orders', `<table class="tbl"><thead><tr><th>kind</th><th>id</th><th>pair</th><th class="n">amount</th><th></th></tr></thead><tbody>${lo.map(x => `<tr><td>limit</td><td class="d">${short(x.id)}</td><td>${short(x.in)} → ${short(x.out)}</td><td class="n">${esc(x.making)} → ${esc(x.taking)}</td><td><button type="button" class="btn ghost sm" data-c="cancel ${esc(x.id)}">cancel</button></td></tr>`).join('')}${pl.map(x => `<tr><td>dca</td><td class="d">${short(x.id)}</td><td>${short(x.in)} → ${short(x.out)}</td><td class="n">${esc(x.each)} each</td><td><button type="button" class="btn ghost sm" data-c="cancel ${esc(x.id)} dca">cancel</button></td></tr>`).join('')}</tbody></table>`);
  b.querySelectorAll('[data-c]').forEach(x => x.onclick = () => RUN(x.dataset.c));
});
def('cancel', 'trade', 'cancel <order id> [dca]', 'cancel an open limit order or dca plan', async a => {
  need(a[0] && isAddr(a[0]), 'Give the order id from orders.'); const owner = await ensureSigner(), op = a[1] === 'dca' ? 'dca' : 'limit';
  const sp = spinner('building the cancel'); const j = await api(op, { method: 'POST', body: { op: 'cancel', owner, order: a[0] } }); sp.done(`<span class="o">✓</span> ${dots('cancel', '<span class="c">built</span>')}`);
  const signed = await SG.sign(j.tx); const r = await api(op, { method: 'POST', body: { op: 'execute', tx: signed, requestId: j.requestId } });
  line(r.status && /fail/i.test(r.status) ? `<span class="r">✗ ${esc(r.error || 'not cancelled')}</span>` : `<span class="o">✓</span> cancelled${r.sig ? ' · ' + tx(r.sig) : ''}`);
});
def('dca', 'trade', 'dca <amount> <from> <to> every <1h|1d|1w> x<count>', 'buy in slices over time on jupiter (min about $100 total, $50 a slice)', async a => {
  need(a.length >= 3, 'Try: dca 2 sol jup every 1d x4  (0.5 SOL of JUP a day for 4 days)');
  const [amount, from, to] = a; const ev = (a[a.indexOf('every') + 1] || '1d').match(/^(\d+)?([mhdw])$/); const cnt = parseInt((a.find(x => /^x\d+$/.test(x)) || 'x4').slice(1));
  const every = ev ? (parseInt(ev[1] || '1') * { m: 60, h: 3600, d: 86400, w: 604800 }[ev[2]]) : 86400;
  const owner = await ensureSigner(); const sp = spinner('building the plan on jupiter');
  let j; try { j = await api('dca', { method: 'POST', body: { op: 'create', in: from, out: to, amount, every, count: cnt, owner } }); } catch (e) { sp.fail(esc(e.message)); throw e; }
  sp.done(`<span class="o">✓</span> ${dots('plan', `<span class="c">${esc(amount)} ${esc(j.in.sym)} → ${esc(j.out.sym)} in ${j.count} slices, one every ${every >= 86400 ? every / 86400 + 'd' : every >= 3600 ? every / 3600 + 'h' : every / 60 + 'm'}</span>`)}`);
  const signed = await SG.sign(j.tx); const E = spinner('starting it'); const r = await api('dca', { method: 'POST', body: { op: 'execute', tx: signed, requestId: j.requestId } });
  if (r.status && /fail/i.test(r.status)) { E.fail(esc(r.error || 'the plan did not start')); return; }
  E.done(`<span class="o">✓</span> plan running${r.sig ? ' · ' + tx(r.sig) : ''}`);
});

// ---------------------------------------------------------------- WALLET
// every solana wallet in this browser, the usual ones first; one click connects
const WPREF = ['phantom', 'solflare', 'backpack', 'jupiter', 'glow', 'okx'];
const wrank = w => { const i = WPREF.findIndex(k => String(w.name || '').toLowerCase().includes(k)); return i < 0 ? 99 : i; };
const wlist = () => SG.WAL.wallets().slice().sort((a, b) => wrank(a) - wrank(b));
def('connect', 'wallet', 'connect [n]', 'connect phantom, solflare, backpack or any solana wallet', async a => {
  const ws = wlist(); need(ws.length, 'No Solana wallet found in this browser. Install Phantom, Solflare or Backpack, then reload.');
  if (ws.length > 1 && !a[0]) {
    line('<span class="m">pick a wallet:</span>');
    line(ws.map((w, i) => `<button type="button" class="wpick" data-run="connect ${i + 1}">${/^data:image\//.test(w.icon || '') ? `<img src="${esc(w.icon)}" alt="">` : ''}<b>${esc(w.name)}</b></button>`).join(''));
    return;
  }
  const w = ws[Math.max(0, Math.min(ws.length - 1, (parseInt(a[0]) || 1) - 1))];
  const sp = spinner(`waiting for <span class="c">${esc(w.name)}</span> <span class="d">· approve in the wallet popup</span>`);
  let c;
  try { c = await SG.WAL.connect(w); }
  catch (e) {
    const m = String((e && e.message) || e || '');
    sp.done(`<span class="r">✗</span> ${/reject|denied|cancel|declin|closed/i.test(m) ? 'you cancelled in ' + esc(w.name) + '. nothing was connected.' : esc(w.name) + ' said: ' + esc(m.slice(0, 140) || 'it could not connect') + (/locked|unlock/i.test(m) ? '' : ' <span class="d">· unlock it and try again</span>')}`, 'r');
    return;
  }
  SG.use('wallet');
  sp.done(`<span class="o">✓</span> ${dots('connected', `<span class="c">${esc(c.name)} ${short(c.address)}</span>`)}`);
  line('<span class="d">it only signs what you approve. type</span> <span class="c">wallet</span> <span class="d">to see what it holds.</span>');
}, ['login']);
def('disconnect', 'wallet', 'disconnect', 'forget the connected wallet in this tab', async () => { await SG.WAL.disconnect(); line('<span class="o">✓</span> disconnected'); }, ['logout']);
def('wallet', 'wallet', 'wallet [address]', 'what the active signer (or any address) holds, priced', async a => {
  const owner = a[0] && isAddr(a[0]) ? a[0] : await ensureSigner(); const sp = spinner(`reading ${short(owner)}`);
  const h = await api('holdings', { params: { owner } }); const solUsd = h.solUsd ? h.sol * h.solUsd : null;
  const total = (solUsd || 0) + h.tokens.reduce((s, t) => s + (t.usd || 0), 0);
  sp.done(`<span class="o">✓</span> ${dots(short(owner), `<span class="c">${usd(total, 2)}</span> <span class="f">across ${h.tokens.length + 1} assets</span>`)}`);
  block(`portfolio · ${short(owner)}`, `<table class="tbl"><thead><tr><th>asset</th><th class="n">amount</th><th class="n">value</th><th></th></tr></thead><tbody>
    <tr><td><b>SOL</b></td><td class="n">${amt(h.sol)}</td><td class="n">${usd(solUsd, 2)}</td><td></td></tr>
    ${h.tokens.map(t => `<tr><td>${t.sym ? `<span class="tok" data-run="token ${esc(t.mint)}"><b>${esc(t.sym)}</b></span>` : `<span class="tok d" data-run="token ${esc(t.mint)}">${short(t.mint)}</span>`}</td><td class="n">${amt(t.ui)}</td><td class="n">${usd(t.usd, 2)}</td><td><button type="button" class="btn ghost sm" data-c="sell ${esc(t.mint)} 100%">sell</button></td></tr>`).join('')}</tbody></table>`).querySelectorAll('[data-c]').forEach(x => x.onclick = () => RUN(x.dataset.c));
}, ['portfolio', 'bal', 'balance', 'pf']);
def('send', 'wallet', 'send <amount> <token> <address>', 'send SOL or any token to an address', async a => {
  need(a.length >= 3, 'Try: send 0.1 sol <address>  ·  send 50 usdc <address>');
  const [amount, token, to] = a; need(isAddr(to), 'The last part should be a Solana address.');
  const from = await ensureSigner(); const sp = spinner('building the transfer');
  const j = await api('sendbuild', { method: 'POST', body: { from, to, token, amount } }); sp.done(`<span class="o">✓</span> ${dots('transfer', `<span class="c">${esc(j.human)} → ${short(to)}</span>`)}`);
  await signAndSend(j.tx, 'transfer'); window.dispatchEvent(new Event('v01d:balances'));
});
def('burner', 'privacy', 'burner [new|save|load|use|fund <sol>|sweep|forget]', 'a throwaway wallet born in this tab, to trade without your main wallet', async a => {
  const sub = a[0] || 'show';
  if (sub === 'new') { const pub = SG.newBurner(); SG.use('burner'); line(`<span class="o">✓</span> ${dots('burner', `<span class="h">${pub}</span>`)}`); line('<span class="m">born in this tab. it signs here and is gone when the tab closes, unless you</span> <span class="c">burner save</span><span class="m">.</span>'); line('<span class="d">next:</span> <span class="c">burner fund 0.2</span> <span class="d">· trades now sign with it. switch back with</span> <span class="c">use wallet</span>'); line('<span class="w">!</span> <span class="d">funding it from your wallet links the two on chain. for a clean break, fund it from an exchange or a privacy ring instead.</span>'); return; }
  if (sub === 'save') { SG.saveBurner(); line('<span class="o">✓</span> burner key saved as a file. keep it offline.'); return; }
  if (sub === 'load') { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.onchange = async () => { try { const pub = SG.loadBurner(await inp.files[0].text()); SG.use('burner'); line(`<span class="o">✓</span> ${dots('burner loaded', `<span class="c">${pub}</span>`)}`); } catch { line('<span class="r">✗ that file is not a key</span>'); } }; inp.click(); return; }
  if (sub === 'use') { SG.use('burner'); line(`<span class="o">✓</span> trades now sign with the burner ${short(SG.burnerPub())}`); return; }
  if (sub === 'forget') { SG.forgetBurner(); line('<span class="o">✓</span> burner forgotten in this tab'); return; }
  if (sub === 'fund') {
    const sol = a[1]; need(sol && /^\d*\.?\d+$/.test(sol), 'Try: burner fund 0.2'); const bp = SG.burnerPub(); need(bp, 'No burner yet. Type burner new.');
    const w = SG.state().wallet || await SG.connectAny(); const prev = SG.activeKind(); SG.use('wallet');
    try { const j = await api('sendbuild', { method: 'POST', body: { from: w.address, to: bp, token: 'sol', amount: sol } }); line(dots('funding', `<span class="c">${esc(sol)} SOL → burner ${short(bp)}</span>`)); await signAndSend(j.tx, 'funding'); } finally { if (prev === 'burner') SG.use('burner'); }
    return;
  }
  if (sub === 'sweep') {
    const bp = SG.burnerPub(); need(bp, 'No burner yet.'); const w = SG.state().wallet; need(w, 'Connect the wallet to sweep back to (connect).');
    const h = await api('holdings', { params: { owner: bp } }); const sol = Math.max(0, h.sol - .00093); need(sol > 0, 'The burner has no SOL to sweep.');
    const prev = SG.activeKind(); SG.use('burner');
    try { const j = await api('sendbuild', { method: 'POST', body: { from: bp, to: w.address, token: 'sol', amount: sol.toFixed(9) } }); line(dots('sweeping', `<span class="c">${sol.toFixed(4)} SOL → ${short(w.address)}</span>`)); await signAndSend(j.tx, 'sweep'); } finally { if (prev !== 'burner') SG.use('wallet'); }
    return;
  }
  const s = SG.state(); if (!s.burner) { line('<span class="m">no burner in this tab.</span> <span class="c">burner new</span> <span class="m">makes one.</span>'); return; }
  line(dots('burner', `<span class="c">${s.burner.address}</span> ${s.burner.saved ? '<span class="o">saved</span>' : '<span class="w">not saved</span>'}`)); line(dots('signing with', `<span class="c">${s.use}</span>`));
});
def('use', 'privacy', 'use <wallet|burner>', 'choose who signs trades', a => { SG.use(a[0] === 'burner' ? 'burner' : 'wallet'); line(`<span class="o">✓</span> ${dots('signer', `<span class="c">${signerLabel()}</span>`)}`); });

// ---------------------------------------------------------------- MARKET
function risk(t) {
  let s = 0; const why = [];
  if (t.mintOff === false) { s += 2; why.push('mint authority on'); } if (t.freezeOff === false) { s += 2; why.push('freeze authority on'); }
  if (t.top10 != null && t.top10 > 40) { s += 1; why.push(`top 10 hold ${t.top10.toFixed(0)}%`); } if (t.liq != null && t.liq < 10000) { s += 1; why.push('thin liquidity'); }
  if (t.created && Date.now() - new Date(t.created).getTime() < 3600e3) { s += 1; why.push('under an hour old'); } if (t.organic != null && t.organic < 20) { s += 1; why.push('little organic trading'); }
  const lvl = Math.min(5, s), cls = lvl >= 4 ? 'bad' : lvl >= 2 ? 'mid' : 'good';
  return { html: `<span class="meter ${cls}">${[0, 1, 2, 3, 4].map(i => `<i class="${i < Math.max(1, lvl) ? 'on' : ''}"></i>`).join('')}</span> <span class="${cls === 'bad' ? 'dn' : cls === 'mid' ? 'w' : 'up'}">${lvl >= 4 ? 'high' : lvl >= 2 ? 'medium' : 'low'}</span>`, why };
}
def('token', 'market', 'token <ticker|name|mint>', 'a full report: price, liquidity, holders, authorities, a risk read and a sparkline', async a => {
  need(a[0], 'Try: token bonk  ·  token <mint>'); const sp = spinner(`looking up ${esc(a.join(' '))}`);
  const { token: t } = await api('token', { params: { q: a.join(' ') } }); seen(t); sp.done(`<span class="o">✓</span> ${dots('found', `<span class="c">${esc(t.name)} (${esc(t.sym)})</span>`)}`);
  const r = risk(t);
  const b = block(`${icon(t)} <b>${esc(t.sym)}</b> <span class="d">${esc(t.name)}</span> <span class="f" style="margin-left:6px">${short(t.mint)}</span>`, `
    <div class="kvg">
      <div><span>price</span><b>${price(t.price)}</b></div><div><span>1h · 24h</span><b>${pct(t.c1h)} · ${pct(t.c24h)}</b></div>
      <div><span>market cap</span><b>${usd(t.mcap)}</b></div><div><span>liquidity</span><b>${usd(t.liq)}</b></div>
      <div><span>volume 24h</span><b>${usd(t.v24h)}</b></div><div><span>holders</span><b>${t.holders != null ? t.holders.toLocaleString('en-US') : '—'}</b></div>
      <div><span>top 10 hold</span><b>${t.top10 != null ? t.top10.toFixed(1) + '%' : '—'}</b></div><div><span>age</span><b>${ago(t.created)}</b></div>
      <div><span>mint authority</span><b class="${t.mintOff === false ? 'dn' : 'up'}">${t.mintOff == null ? '—' : t.mintOff ? 'off ✓' : 'ON'}</b></div><div><span>freeze authority</span><b class="${t.freezeOff === false ? 'dn' : 'up'}">${t.freezeOff == null ? '—' : t.freezeOff ? 'off ✓' : 'ON'}</b></div>
      <div><span>organic score</span><b>${t.organic != null ? Math.round(t.organic) + '/100' : '—'}</b></div><div><span>launchpad</span><b>${esc(t.launchpad || '—')}${t.grad ? ' · graduated' : ''}</b></div>
    </div>
    <canvas class="spark" data-sp></canvas>
    <div class="mtape" data-mt></div>
    <p class="d" style="margin:8px 0 0">risk ${r.html}${r.why.length ? ' <span class="f">· ' + esc(r.why.join(' · ')) + '</span>' : ' <span class="f">· nothing obvious. still do your own research.</span>'}</p>
    <div class="row" style="margin-top:12px"><button type="button" class="btn sm" data-c="buy ${esc(t.mint)} 0.1">buy 0.1 SOL</button><button type="button" class="btn ghost sm" data-c="chart ${esc(t.mint)}">chart</button><button type="button" class="btn ghost sm" data-c="holders ${esc(t.mint)}">holders</button><button type="button" class="btn ghost sm" data-c="watch ${esc(t.mint)}">watch</button><button type="button" class="btn ghost sm" data-cp>copy mint</button>${t.launchpad === 'pump.fun' ? `<a class="btn ghost sm" href="https://pump.fun/coin/${esc(t.mint)}" target="_blank" rel="noopener noreferrer">pump.fun ↗</a>` : ''}</div>`);
  b.querySelectorAll('[data-c]').forEach(x => x.onclick = () => RUN(x.dataset.c)); b.querySelector('[data-cp]').onclick = () => copy(t.mint);
  try { const o = await api('ohlcv', { params: { mint: t.mint, tf: '1h' } }); spark(b.querySelector('[data-sp]'), o.candles.slice(-72).map(c => c[4])); } catch { b.querySelector('[data-sp]').remove(); }
  const bh = b.querySelector('.bh'); bh.insertAdjacentHTML('beforeend', '<i class="live" title="live" style="margin-left:6px"></i>');
  const mt = b.querySelector('[data-mt]'), mseen = new Set();
  const mini = async () => { try { const { trades } = await api('trades', { params: { mint: t.mint } }); if (!b.isConnected) return; const first = !mseen.size; const fresh = trades.filter(x => x.sig && !mseen.has(x.sig)); fresh.forEach(x => mseen.add(x.sig)); if (!trades.length) { mt.remove(); return; } if (fresh.length) { if (first) mt.innerHTML = '<div class="f mth">last trades <span data-mtc></span></div><div class="trl"></div>'; const l = mt.querySelector('.trl'); l.insertAdjacentHTML('afterbegin', fresh.slice(0, 6).map(x => tradeRow(x, !first)).join('')); while (l.children.length > 6) l.lastElementChild.remove(); } mt.querySelectorAll('[data-t]').forEach(e => { e.textContent = ago(+e.dataset.t); }); const bb = trades.filter(x => x.side === 'buy').length; const c = mt.querySelector('[data-mtc]'); if (c) c.innerHTML = `· <span class="up">${bb}</span>/<span class="dn">${trades.length - bb}</span> of the last ${trades.length}`; } catch {} };
  mini();
  const cells = [...b.querySelectorAll('.kvg>div')], val = i => cells[i] && cells[i].querySelector('b');
  (async () => { for (let k = 0; k < 75 && b.isConnected; k++) {
    await sleep(8000); if (!b.isConnected) break; if (document.hidden || $('#out').hidden) continue;
    if (mt.isConnected) mini();
    try { const n = (await api('token', { params: { q: t.mint } })).token;
      const upd = (i, html, a, z) => { const e = val(i); if (!e || e.innerHTML === html) return; e.innerHTML = html; e.classList.remove('flashu', 'flashd'); void e.offsetWidth; if (a != null && z != null && a !== z) e.classList.add(z > a ? 'flashu' : 'flashd'); };
      upd(0, price(n.price), t.price, n.price); upd(1, `${pct(n.c1h)} · ${pct(n.c24h)}`); upd(2, usd(n.mcap), t.mcap, n.mcap); upd(3, usd(n.liq), t.liq, n.liq); upd(4, usd(n.v24h)); upd(5, n.holders != null ? n.holders.toLocaleString('en-US') : '—', t.holders, n.holders);
      Object.assign(t, n);
    } catch {}
  } })();
}, ['info', 't']);
let CH = null;
async function openChart(mint, tf = '15m', label) {
  showTab('chart'); const box = $('#chartbox'), cv = $('#chart'), head = $('#ch-h');
  head.innerHTML = `<span class="d">loading ${esc(label || short(mint))} · ${tf}</span>`;
  const [o, t] = await Promise.all([api('ohlcv', { params: { mint, tf } }), api('token', { params: { q: mint } }).catch(() => null)]);
  const tk = t && t.token; CH = { mint, tf, candles: o.candles, tk, pool: o.pool };
  const last = o.candles.length ? o.candles[o.candles.length - 1][4] : null, first = o.candles.length ? o.candles[0][1] : null;
  head.innerHTML = `${tk ? icon(tk) : ''} <b>${esc(tk ? tk.sym : short(mint))}</b> <span class="c" data-px>${price(last)}</span> ${first ? pct((last / first - 1) * 100) : ''} <span class="f">${esc(o.pool.name || '')} · ${esc(o.pool.dex || '')}</span> <span class="f" data-hv></span>`;
  $('#ch-tf').innerHTML = ['1m', '5m', '15m', '1h', '4h', '1d'].map(x => `<button type="button" data-tf="${x}" class="${x === tf ? 'on' : ''}">${x}</button>`).join('') + `<span style="flex:1"></span><button type="button" data-c="buy ${esc(mint)} 0.1">buy 0.1</button><button type="button" data-c="token ${esc(mint)}">report</button>`;
  $$('#ch-tf [data-tf]').forEach(b => b.onclick = () => openChart(mint, b.dataset.tf, label)); $$('#ch-tf [data-c]').forEach(b => b.onclick = () => { showTab('out'); RUN(b.dataset.c); });
  requestAnimationFrame(() => drawChart(cv, CH.candles)); tapeTick();
}
// ---------------------------------------------------------------- the live tape: every trade as it lands, with the last candle moving along
const TFS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
const TAPE = { mint: null, timer: 0, gen: 0, seen: new Set() };
const sol = v => v == null ? '—' : v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v >= .01 ? v.toFixed(3) : v.toFixed(4);
const tradeRow = (x, fresh) => `<div class="tr ${x.side}${fresh ? ' new' : ''}${(x.sol || 0) >= 5 ? ' whale' : ''}"><span class="f" data-t="${x.t}">${ago(x.t)}</span><b>${x.side}</b><span class="n">${sol(x.sol)}<em> SOL</em></span><span class="n f">${usd(x.usd)}</span><span class="tok f" data-run="account ${esc(x.who)}" title="${esc(x.who)}">${x.who ? esc(x.who.slice(0, 4)) : ''}</span>${x.mev ? '<i title="mev bot">mev</i>' : x.tags.length ? `<i title="${esc(x.tags.join(', '))}">${esc(x.tags[0].slice(0, 6))}</i>` : '<i></i>'}</div>`;
function liveCandle(list, count) {
  const step = TFS[CH.tf] || 900, c = CH.candles; if (!c.length) return;
  for (const x of list.filter(x => x.price && x.t).sort((a, b) => a.t - b.t)) {
    const sec = Math.floor(x.t / 1000), b = sec - sec % step; let last = c[c.length - 1];
    if (b < last[0]) continue;
    if (b > last[0]) { c.push([b, last[4], last[4], last[4], last[4], 0]); last = c[c.length - 1]; if (c.length > 400) c.shift(); }
    last[4] = x.price; last[2] = Math.max(last[2], x.price); last[3] = Math.min(last[3], x.price); if (count) last[5] += x.usd || 0;
  }
  if (!$('#chartbox').hidden) drawChart($('#chart'), c);
  const px = $('#ch-h [data-px]'), now = c[c.length - 1][4];
  if (px) { const was = parseFloat(px.dataset.v || '0'); const h = price(now); if (px.innerHTML !== h) { px.innerHTML = h; px.classList.remove('flashu', 'flashd'); void px.offsetWidth; if (was) px.classList.add(now > was ? 'flashu' : 'flashd'); } px.dataset.v = now; }
}
async function tapeTick() {
  clearTimeout(TAPE.timer); const my = ++TAPE.gen;
  if (!CH || $('#chartbox').hidden) return;
  const mint = CH.mint, box = $('#ch-tr');
  if (TAPE.mint !== mint) { TAPE.mint = mint; TAPE.seen = new Set(); box.innerHTML = '<div class="trh"><i class="live"></i><b>trades</b><span class="f" data-tc>connecting…</span></div><div class="trl"></div>'; }
  try {
    const { trades } = await api('trades', { params: { mint } });
    if (my !== TAPE.gen || TAPE.mint !== mint) return;
    const list = box.querySelector('.trl'), first = !TAPE.seen.size, fresh = trades.filter(x => x.sig && !TAPE.seen.has(x.sig));
    fresh.forEach(x => TAPE.seen.add(x.sig));
    if (fresh.length) { list.insertAdjacentHTML('afterbegin', fresh.map(x => tradeRow(x, !first)).join('')); while (list.children.length > 80) list.lastElementChild.remove(); liveCandle(fresh, !first); }
    if (!trades.length && first) list.innerHTML = '<p class="f" style="padding:10px">no trades yet.</p>';
    list.querySelectorAll('[data-t]').forEach(e => { e.textContent = ago(+e.dataset.t); });
    const b = trades.filter(x => x.side === 'buy').length, v = trades.reduce((a, x) => a + (x.sol || 0), 0);
    box.querySelector('[data-tc]').innerHTML = trades.length ? `<span class="up">${b}</span>/<span class="dn">${trades.length - b}</span> · ${sol(v)} SOL` : '';
  } catch { if (my !== TAPE.gen) return; const tc = box.querySelector('[data-tc]'); if (tc) tc.textContent = 'feed busy · retrying'; }
  if (my === TAPE.gen) TAPE.timer = setTimeout(tapeTick, document.hidden ? 12000 : 2500);
}
def('chart', 'market', 'chart <token> [1m|5m|15m|1h|4h|1d]', 'live candles with volume and a crosshair', async a => {
  need(a[0], 'Try: chart bonk  ·  chart <mint> 1h'); const tf = ['1m', '5m', '15m', '1h', '4h', '1d'].includes(a[a.length - 1]) ? a.pop() : '15m';
  const sp = spinner(`finding the deepest pool for ${esc(a.join(' '))}`); const { token: t } = await api('token', { params: { q: a.join(' ') } }); seen(t); sp.done(`<span class="o">✓</span> ${dots('chart', `<span class="c">${esc(t.sym)} · ${tf}</span> <span class="f">(chart tab)</span>`)}`);
  await openChart(t.mint, tf, t.sym);
}, ['c']);
def('tape', 'market', 'tape <token>', 'every trade on a coin as it lands, beside a live 1m chart', async a => {
  need(a[0], 'Try: tape bonk  ·  tape <mint>'); const sp = spinner(`opening the tape for ${esc(a.join(' '))}`); const { token: t } = await api('token', { params: { q: a.join(' ') } }); seen(t);
  sp.done(`<span class="o">✓</span> ${dots('tape', `<span class="c">${esc(t.sym)} · live</span> <span class="f">(chart tab)</span>`)}`); await openChart(t.mint, '1m', t.sym);
}, ['feed']);
def('price', 'market', 'price <token> [token…]', 'quick prices for one or more tokens', async a => {
  need(a.length, 'Try: price sol bonk jup');
  for (const q of a.slice(0, 8)) { try { const { token: t } = await api('token', { params: { q } }); seen(t); line(`${icon(t)} ${tokLink(t)} ${' '.repeat(Math.max(1, 8 - t.sym.length))}<span class="c">${price(t.price)}</span>  ${pct(t.c24h)} <span class="f">24h · mcap ${usd(t.mcap)}</span>`); } catch (e) { line(`<span class="r">✗</span> ${esc(q)}: ${esc(e.message)}`); } }
}, ['p']);
function tokenTable(title, list, cols = 'mcap') {
  const b = block(title, `<div style="overflow:auto"><table class="tbl"><thead><tr><th>#</th><th>token</th><th class="n">price</th><th class="n">1h</th><th class="n">24h</th><th class="n">mcap</th><th class="n">liq</th><th class="n">age</th><th></th></tr></thead><tbody>${list.map((t, i) => { seen(t); return `<tr><td class="f">${i + 1}</td><td>${icon(t)} ${tokLink(t)} <span class="f">${esc(t.name.slice(0, 22))}</span></td><td class="n">${price(t.price)}</td><td class="n">${pct(t.c1h)}</td><td class="n">${pct(t.c24h)}</td><td class="n">${usd(t.mcap)}</td><td class="n">${usd(t.liq)}</td><td class="n f">${ago(t.created)}</td><td><button type="button" class="btn ghost sm" data-c="buy ${esc(t.mint)} 0.1">buy</button></td></tr>`; }).join('')}</tbody></table></div>`);
  b.querySelectorAll('[data-c]').forEach(x => x.onclick = () => RUN(x.dataset.c)); return b;
}
def('trending', 'market', 'trending [5m|1h|6h|24h]', 'what is moving on solana right now', async a => { const w = ['5m', '1h', '6h', '24h'].includes(a[0]) ? a[0] : '1h'; const sp = spinner(`top trending · ${w}`); const j = await api('trending', { params: { w } }); sp.done(`<span class="o">✓</span> ${dots('trending', `<span class="c">${j.tokens.length} tokens · ${w}</span>`)}`); tokenTable(`trending · ${w}`, j.tokens.slice(0, 25)); }, ['hot', 'top']);
def('new', 'market', 'new', 'the newest coins born on raydium launchlab', async () => { const sp = spinner('newest on raydium'); const j = await api('recent'); sp.done(`<span class="o">✓</span> ${dots('new', `<span class="c">${j.tokens.length} fresh coins</span>`)}`); tokenTable('new on raydium', j.tokens.slice(0, 25)); }, ['fresh']);
def('stocks', 'market', 'stocks', 'tokenized stocks you can buy with SOL (TSLAx, NVDAx, SPYx…)', async () => { const sp = spinner('tokenized stocks'); const j = await api('stocks'); sp.done(`<span class="o">✓</span> ${dots('stocks', `<span class="c">${j.tokens.length} listed</span>`)}`); tokenTable('tokenized stocks · buy with SOL, no broker', j.tokens.slice(0, 30)); line('<span class="d">buy one with</span> <span class="c">buy tslax 0.5</span> <span class="d">· stock tokens can be paused by their issuer; they are not shares in your name.</span>'); }, ['stonks', 'stonk']);
def('search', 'market', 'search <query>', 'find tokens by name, ticker or mint', async a => { need(a[0], 'Try: search dog'); const sp = spinner(`searching ${esc(a.join(' '))}`); const j = await api('search', { params: { q: a.join(' ') } }); sp.done(`<span class="o">✓</span> ${dots('results', `<span class="c">${j.tokens.length}</span>`)}`); if (j.tokens.length) tokenTable(`search · ${esc(a.join(' '))}`, j.tokens); }, ['find', 's']);
def('holders', 'market', 'holders <token>', 'the 20 biggest holders and how much of the supply they have', async a => {
  need(a[0], 'Try: holders bonk'); const sp = spinner('reading the largest accounts');
  let j; try { j = await api('holders', { params: { q: a.join(' ') } }); } catch (e) { sp.fail(esc(e.message)); return; }
  sp.done(`<span class="o">✓</span> ${dots('holders', `<span class="c">${esc(j.token.sym)} · top 20 hold ${j.holders.reduce((s, h) => s + (h.pct || 0), 0).toFixed(1)}%</span>`)}`);
  block(`holders · ${esc(j.token.sym)}`, `<table class="tbl"><thead><tr><th>#</th><th>owner</th><th class="n">amount</th><th class="n">share</th><th></th></tr></thead><tbody>${j.holders.map((h, i) => `<tr><td class="f">${i + 1}</td><td>${h.owner ? `<a href="https://solscan.io/account/${esc(h.owner)}" target="_blank" rel="noopener noreferrer">${short(h.owner)}</a>` : '—'}</td><td class="n">${amt(h.ui)}</td><td class="n">${h.pct != null ? h.pct.toFixed(2) + '%' : '—'}</td><td><span class="bar-p">${'█'.repeat(Math.max(0, Math.round((h.pct || 0) / 2)))}</span></td></tr>`).join('')}</tbody></table>`);
});
let WATCH = []; try { WATCH = JSON.parse(localStorage.getItem('v01d:watch') || '[]'); } catch {}
const saveWatch = () => { try { localStorage.setItem('v01d:watch', JSON.stringify(WATCH)); } catch {} window.dispatchEvent(new Event('v01d:watch')); };
export const watchlist = () => WATCH;
def('watch', 'market', 'watch <token>', 'add a token to your watchlist (kept in this browser)', async a => { need(a[0], 'Try: watch bonk'); const { token: t } = await api('token', { params: { q: a.join(' ') } }); if (!WATCH.find(w => w.mint === t.mint)) WATCH.unshift({ mint: t.mint, sym: t.sym }); WATCH = WATCH.slice(0, 30); saveWatch(); line(`<span class="o">✓</span> watching ${tokLink(t)}`); });
def('unwatch', 'market', 'unwatch <token>', 'remove it from the watchlist', a => { const k = (a[0] || '').toLowerCase(); WATCH = WATCH.filter(w => w.mint !== a[0] && w.sym.toLowerCase() !== k.replace('$', '')); saveWatch(); line('<span class="o">✓</span> removed'); });
def('watchlist', 'market', 'watchlist', 'your watchlist with live prices', async () => {
  if (!WATCH.length) return line('<span class="m">nothing watched yet.</span> <span class="c">watch bonk</span>');
  const sp = spinner('pricing your watchlist'); const p = await api('price', { params: { ids: WATCH.map(w => w.mint).join(',') } }); sp.done(`<span class="o">✓</span> ${dots('watchlist', `<span class="c">${WATCH.length}</span>`)}`);
  block('watchlist', `<table class="tbl"><tbody>${WATCH.map(w => { const x = p.prices[w.mint] || {}; return `<tr><td><span class="tok" data-run="token ${esc(w.mint)}"><b>${esc(w.sym)}</b></span></td><td class="n">${price(x.usd)}</td><td class="n">${pct(x.c24h)}</td></tr>`; }).join('')}</tbody></table>`);
}, ['wl']);

// ---------------------------------------------------------------- PRIVACY
const RINGS = [
  ['your name', 'v01d never asks who you are. no account, no email, no sign-up.', 'nothing'],
  ['your wallet', 'a private launch needs no wallet at all. a fresh launcher pays and ends empty.', 'the launcher and the coin, like every coin on solana'],
  ['your creator key', 'born in your browser, saved by you. the server only checks signatures.', 'its address, once it claims'],
  ['your gas', 'claims are paid by the treasury, so the key never needs funding from you.', 'that the treasury paid'],
  ['your image', 'redrawn in your browser, so camera and gps data never leave your device.', 'the picture itself'],
  ['your browser', 'no cookies, no analytics, no third-party scripts. every request goes to v01d only.', 'your ip, to v01d, like any website'],
  ['your trades', 'a burner born in this tab can trade for you, away from your main wallet.', 'the burner and how it was funded'],
  ['your balances', 'inside solana privacy rings, amounts are encrypted. v01d points you there.', 'who sent to whom, and what leaves a ring'],
];
def('rings', 'privacy', 'rings', 'what v01d hides, and exactly what stays public', async () => {
  line('<span class="m">every layer hides one thing. each one also says what stays public, because nothing on a public chain is invisible.</span>');
  for (let i = 0; i < RINGS.length; i++) { const [t, d, p] = RINGS[i]; line(`<span class="h">${String(i + 1).padStart(2, '0')}</span>  <span class="c">${esc(t)}</span>`); line(`    <span class="m">${esc(d)}</span>`); line(`    <span class="f">still public: ${esc(p)}</span>`); await sleep(90); }
  line(''); line('<span class="d">solana privacy rings (helius) encrypt balances and amounts. senders and receivers stay public, and a withdrawal shows its amount. confidential, not anonymous.</span>');
}, ['layers']);
def('scan', 'market', 'scan', 'the live scanner: new coins on raydium launchlab, the final stretch, and fresh graduations, in real time', () => { showTab('pulse'); line('<span class="o">✓</span> scanner open <span class="f">(scanner tab · refreshes every few seconds)</span>'); }, ['pulse', 'scanner', 'live']);
def('privacy', 'privacy', 'privacy', 'check this page live: cookies, storage, and every host it talks to', () => {
  let ls = 0; try { ls = localStorage.length; } catch {}
  const hosts = [...new Set(performance.getEntriesByType('resource').map(e => { try { return new URL(e.name).host; } catch { return ''; } }).filter(Boolean))];
  const own = location.host, other = hosts.filter(h => h !== own);
  line(`<span class="o">✓</span> ${dots('cookies', `<span class="${document.cookie ? 'r' : 'c'}">${document.cookie ? 'some' : 'none'}</span>`)}`);
  line(`<span class="o">✓</span> ${dots('local storage', `<span class="c">${ls ? ls + ' item(s): history, watchlist, sound' : 'empty'}</span>`)}`);
  line(`<span class="${other.length ? 'r">✗' : 'o">✓'}</span> ${dots('hosts used', `<span class="c">${esc(own)}</span>${other.length ? ` <span class="r">+ ${esc(other.join(', '))}</span>` : ' <span class="f">(only its own)</span>'}`)}`);
  line(`<span class="o">✓</span> ${dots('token images', '<span class="c">fetched through v01d, so their hosts never see you</span>')}`);
  line(`<span class="o">✓</span> ${dots('trackers', '<span class="c">none</span> <span class="f">· the security policy only allows this site</span>')}`);
  // and it keeps watching: every request this page makes for the next minute, live
  const L = line('<span class="spin">⠋</span> <span class="d">watching every request for 60s …</span>'); let n = 0, ext = new Set(); const seenHosts = new Set();
  const po = new PerformanceObserver(list => { for (const e of list.getEntries()) { let hst = ''; try { hst = new URL(e.name).host; } catch {} n++; if (hst && hst !== location.host) ext.add(hst); seenHosts.add(hst); } L.innerHTML = `<span class="spin">◉</span> <span class="d">live:</span> <span class="c">${n} requests</span> <span class="f">·</span> ${ext.size ? `<span class="r">${esc([...ext].join(', '))}</span>` : '<span class="o">all to ' + esc(location.host) + '</span>'}`; });
  try { po.observe({ type: 'resource', buffered: false }); } catch {}
  setTimeout(() => { po.disconnect(); L.innerHTML = `<span class="o">✓</span> ${dots('watched 60s', `<span class="c">${n} requests</span>, ${ext.size ? `<span class="r">${ext.size} other host(s)</span>` : `<span class="c">every one to ${esc(location.host)}</span>`}`)}`; }, 60000);
}, ['check', 'audit']);
def('whoami', 'privacy', 'whoami', 'who the terminal thinks you are', () => { const s = SG.state(); line(s.active ? `<span class="m">a signer, ${short(s.active)}. nothing else.</span>` : '<span class="m">nobody. that is the point.</span>'); });
def('forget', 'privacy', 'forget', 'wipe this browser: history, watchlist, burner', () => { forgetHist(); WATCH = []; saveWatch(); SG.forgetBurner(); try { localStorage.removeItem('v01d:mute'); sessionStorage.clear(); } catch {} clear(); line('<span class="o">✓</span> forgotten. nothing of you is left in this browser.'); });

// ---------------------------------------------------------------- SYSTEM
const CATS = [['launch', 'launch'], ['trade', 'trade'], ['wallet', 'wallet'], ['market', 'market'], ['privacy', 'privacy'], ['system', 'system']];
def('help', 'system', 'help [command]', 'this list', a => {
  if (a[0]) { const c = CMDS[ALIAS[a[0]] || a[0]]; if (!c) return line(`<span class="r">no such command:</span> ${esc(a[0])}`); line(`<span class="c">${esc(c.usage)}</span>`); line(`  <span class="m">${esc(c.help)}</span>`); const al = Object.entries(ALIAS).filter(([, v]) => v === c.name).map(([k]) => k); if (al.length) line(`  <span class="f">also: ${esc(al.join(', '))}</span>`); return; }
  for (const [k, t] of CATS) { line(`<span class="h">${t}</span>`); Object.values(CMDS).filter(c => c.cat === k && c.help && !['gm'].includes(c.name)).forEach(c => line(`<span class="tok c" data-fill="${esc(c.usage.split(' ')[0])} ">${esc(c.usage)}</span><span class="d">${esc(c.help)}</span>`, 'hrow')); }
  line(''); line('<span class="f">tab completes · ↑↓ history · / or ctrl k jumps here · ctrl l clears · click anything underlined</span>');
}, ['?', 'man']);
def('clear', 'system', 'clear', 'clear the screen', () => clear(), ['cls']);
def('history', 'system', 'history', 'what you typed (kept in this browser only)', () => { const h = history(); if (!h.length) return line('<span class="d">empty</span>'); h.slice(0, 30).reverse().forEach((c, i) => line(`<span class="f">${String(i + 1).padStart(3)}</span>  <span class="tok" data-run="${esc(c)}">${esc(c)}</span>`)); });
def('status', 'system', 'status', 'the engine, the chain and the router, live', async () => {
  const sp = spinner('checking'); const [p, e] = await Promise.allSettled([api('ping'), engine()]); sp.done('<span class="o">✓</span> status');
  const P = p.status === 'fulfilled' ? p.value : null, E = e.status === 'fulfilled' ? e.value : null;
  line(dots('solana', P && P.slot ? `<span class="o">●</span> <span class="c">slot ${P.slot.toLocaleString('en-US')}</span> <span class="f">${P.rpcMs} ms</span>` : '<span class="r">● unreachable</span>'));
  line(dots('router', P && P.jupMs != null ? `<span class="o">●</span> <span class="c">jupiter ok</span> <span class="f">${P.jupMs} ms</span>` : '<span class="w">● busy</span>'));
  line(dots('private launches', E ? (E.ready ? '<span class="o">● open</span>' : `<span class="w">●</span> <span class="m">${esc(WHY[E.why] || 'resting')}</span>`) : '<span class="r">● unreachable</span>'));
  line(dots('wallet launches', '<span class="o">● open</span> <span class="f">(launch --wallet)</span>'));
  line(dots('signer', `<span class="c">${signerLabel()}</span>`));
});
def('intro', 'system', 'intro', 'play the intro again', () => { window.dispatchEvent(new Event('v01d:intro')); });
def('sound', 'system', 'sound [on|off]', 'the room tone, on or off', a => { window.dispatchEvent(new CustomEvent('v01d:sound', { detail: a[0] || 'toggle' })); });
def('docs', 'system', 'docs', 'how everything works, in plain words', () => { window.dispatchEvent(new CustomEvent('v01d:go', { detail: 'library' })); line('<span class="d">opening the library</span>'); });
def('about', 'system', 'about', 'what v01d is', () => { line('<span class="h">v01d</span> <span class="m">· enter the world in private.</span>'); line('<span class="m">a private world for solana. launch on raydium with no wallet, swap on every dex, buy tokenized stocks, set limit orders and dca, claim fees, trade from a burner.</span>'); line('<span class="f">independent. not affiliated with raydium, jupiter, helius, phantom or any token here. nothing here is advice; memecoins mostly go to zero.</span>'); });
def('gm', 'system', 'gm', 'gm', () => line('gm. nobody saw that.'));
def('sudo', 'system', 'sudo', '', () => line('<span class="r">nice try.</span> <span class="d">there is no root here. there is no you here.</span>'));
def('exit', 'system', 'exit', '', () => line('<span class="d">there is no exit. close the tab and you were never here.</span>'));

// ---------------------------------------------------------------- tabs inside the console
export function showTab(k) {
  $$('#ctabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === k));
  $('#out').hidden = k !== 'out'; $('#chartbox').hidden = k !== 'chart'; $('#ordbox').hidden = k !== 'orders'; $('#pulsebox').hidden = k !== 'pulse';
  if (k === 'pulse') startPulse(); else stopPulse();
  if (k === 'chart' && CH) { requestAnimationFrame(() => drawChart($('#chart'), CH.candles)); tapeTick(); } else { clearTimeout(TAPE.timer); TAPE.gen++; }
  if (k === 'chart' && !CH) { $('#ch-h').innerHTML = '<span class="d">no chart open. type</span> <span class="c">chart sol</span>'; $('#ch-tf').innerHTML = ''; }
  if (k === 'orders') loadOrders();
}
async function loadOrders() {
  const box = $('#ordbox'); const s = SG.state();
  if (!s.active) { box.innerHTML = '<p class="d">connect a wallet or make a burner to see orders. <span class="tok c" data-run="connect">connect</span></p>'; return; }
  box.innerHTML = '<p class="d">reading orders …</p>';
  const [o, d] = await Promise.allSettled([api('limit', { method: 'POST', body: { op: 'list', owner: s.active } }), api('dca', { method: 'POST', body: { op: 'list', owner: s.active } })]);
  const lo = o.status === 'fulfilled' ? o.value.orders : [], pl = d.status === 'fulfilled' ? d.value.plans : [];
  box.innerHTML = `<p class="d">open orders for ${short(s.active)}</p>` + (lo.length || pl.length ? `<table class="tbl"><tbody>${lo.map(x => `<tr><td>limit</td><td class="d">${short(x.id)}</td><td>${short(x.in)} → ${short(x.out)}</td><td><span class="tok" data-run="cancel ${esc(x.id)}">cancel</span></td></tr>`).join('')}${pl.map(x => `<tr><td>dca</td><td class="d">${short(x.id)}</td><td>${short(x.in)} → ${short(x.out)}</td><td><span class="tok" data-run="cancel ${esc(x.id)} dca">cancel</span></td></tr>`).join('')}</tbody></table>` : '<p class="m">nothing open.</p>');
}
export function chartHover(e) { if (!CH) return; const cv = $('#chart'), r = cv.getBoundingClientRect(); const info = drawChart(cv, CH.candles, { hover: { x: e.clientX - r.left, y: e.clientY - r.top } }); const hv = $('#ch-h [data-hv]'); if (info && hv) { const c = info.c, d = new Date(c[0] * 1000); hv.innerHTML = `${d.toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · o ${price(c[1])} h ${price(c[2])} l ${price(c[3])} c ${price(c[4])} · vol ${usd(c[5])}`; } }
export const chartRedraw = () => { if (CH && !$('#chartbox').hidden) drawChart($('#chart'), CH.candles); };
