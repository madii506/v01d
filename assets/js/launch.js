// v01d · launches and claims: the private launch (no connect, no signature, no SOL), the wallet launch with a dev buy,
// gasless claims with a key born in this browser, and the list of coins launched here.
import { $$, api, esc, short, ago, usd, line, block, spinner, dots, sleep, copy, b58, unb58, unb64, isAddr, img } from './core.js';
import * as SG from './signer.js';
const WAL = SG.WAL;
const utf8len = s => new TextEncoder().encode(s).length;
export let STATUS = null;
export const WHY = { treasury: 'free private launches are resting right now. you can launch from your wallet with launch --wallet.', cap: "today's free private launches are used up. back at 00:00 UTC, or use launch --wallet.", paused: 'launches are paused for a moment.', rpc: "solana can't be reached right now." };
export async function engine() { try { STATUS = await api('status'); } catch { STATUS = null; } return STATUS; }

async function cleanImage(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Use a PNG, JPG, WebP or GIF.');
  if (file.size > 12e6) throw new Error('That file is over 12 MB.');
  const bmp = await createImageBitmap(file), max = 1000, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let blob = await new Promise(r => c.toBlob(r, 'image/png'));
  if (blob.size > 1.4e6) blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .9));
  if (blob.size > 1.4e6) blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .75));
  const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  return { dataUrl, bytes: blob.size, w: c.width, h: c.height, origBytes: file.size };
}
function pow(challenge, bits, onP) { return new Promise((res, rej) => { const w = new Worker('/assets/pow.js'); w.onmessage = e => { if (e.data.done) { w.terminate(); res(e.data); } else onP(e.data); }; w.onerror = () => { w.terminate(); rej(new Error('Proof of work failed in this browser.')); }; w.postMessage({ challenge, bits }); }); }

export function launchForm(wallet) {
  const S = { image: null, key: null, mode: wallet ? 'wallet' : 'key' };
  const b = block(wallet ? 'launch --wallet · pump.fun · your wallet signs and can buy first' : 'launch · pump.fun · private, free, no wallet', `
    <div class="f2">
      <label class="fl">name<input name="name" maxlength="32" placeholder="My Coin"></label>
      <label class="fl">ticker<input name="symbol" maxlength="10" placeholder="COIN"></label>
      <label class="fl w">about <span class="f">· "launched on v01d" is added at the end</span><textarea name="description" rows="2" maxlength="600" placeholder="one line about it (optional)"></textarea></label>
      <label class="fl">x link<input name="x" maxlength="120" placeholder="https://x.com/… (optional)"></label>
      <label class="fl">telegram<input name="tg" maxlength="120" placeholder="https://t.me/… (optional)"></label>
      <label class="fl w">website<input name="web" maxlength="160" placeholder="https://… (optional)"></label>
    </div>
    <div class="imgrow" style="margin-top:12px"><div class="pv" data-pv>image</div><div class="row"><button type="button" class="btn ghost sm" data-pick>choose image</button><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden data-file><span class="d" data-info>redrawn here. its hidden data never leaves your device.</span></div></div>
    <div class="seg" data-seg>${wallet ? '<button type="button" class="on" data-m="wallet">your wallet</button>' : '<button type="button" class="on" data-m="key">a key born here</button><button type="button" data-m="own">an address I own</button>'}</div>
    <div data-modebox></div>
    <div class="row" style="margin-top:12px"><button type="button" class="btn" data-go>${wallet ? 'sign &amp; launch' : 'launch'}</button><span class="d">${wallet ? 'your wallet pays pump.fun and any dev buy' : 'free. nothing to connect, sign or pay.'}</span></div>
    <div class="err" data-err></div>`);
  const q = s => b.querySelector(s), fld = n => q(`[name=${n}]`).value.trim(), err = t => { q('[data-err]').textContent = t || ''; };
  q('[data-pick]').onclick = () => q('[data-file]').click();
  q('[data-file]').onchange = async e => { const f = e.target.files[0]; if (!f) return; err(''); q('[data-info]').textContent = 'cleaning…'; try { S.image = await cleanImage(f); q('[data-pv]').innerHTML = `<img src="${S.image.dataUrl}" alt="">`; q('[data-info]').innerHTML = `<span class="ok2">clean</span> · ${S.image.w}×${S.image.h} · ${Math.round(S.image.bytes / 1024)} KB (was ${Math.round(S.image.origBytes / 1024)} KB with its metadata)`; } catch (er) { err(er.message); q('[data-info]').textContent = ''; } };
  const modeBox = () => {
    const box = q('[data-modebox]');
    if (S.mode === 'key') { if (!S.key) { const kp = nacl.sign.keyPair(); S.key = { pub: b58(kp.publicKey), sec: kp.secretKey }; }
      box.innerHTML = `<div class="keybox"><span>creator key, made in this browser just now. it earns every creator fee. save it: it is the only way to claim.</span><code>${S.key.pub}</code><div class="row"><button type="button" class="btn ghost sm" data-dl>save key file</button><button type="button" class="btn ghost sm" data-cp>copy secret</button><label class="d"><input type="checkbox" data-saved> I saved it</label></div></div>`;
      box.querySelector('[data-dl]').onclick = () => { const blob = new Blob([JSON.stringify(Array.from(S.key.sec))], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `v01d-creator-${S.key.pub.slice(0, 6)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); box.querySelector('[data-saved]').checked = true; };
      box.querySelector('[data-cp]').onclick = () => copy(b58(S.key.sec));
    } else if (S.mode === 'own') box.innerHTML = '<label class="fl" style="margin-top:10px">creator address<input data-own placeholder="a Solana address you control"></label>';
    else { const cur = WAL.current(), ws = WAL.wallets();
      box.innerHTML = cur ? `<div class="keybox"><span>wallet <span class="ok2">${esc(cur.name || '')}</span> <code>${cur.address}</code></span><label class="fl">dev buy, SOL (0 to 10)<input data-buy inputmode="decimal" placeholder="0"></label></div>`
        : (ws.length ? `<div class="row" style="margin-top:10px">${ws.map((w, i) => `<button type="button" class="btn ghost sm" data-w="${i}">${esc(w.name)}</button>`).join('')}</div>` : '<p class="d">no solana wallet found in this browser. phantom, solflare and backpack all work.</p>');
      box.querySelectorAll('[data-w]').forEach(x => x.onclick = async () => { try { await WAL.connect(ws[+x.dataset.w]); modeBox(); } catch (er) { err(er && er.message || 'The wallet did not connect.'); } }); }
  };
  q('[data-seg]').addEventListener('click', e => { const x = e.target.closest('[data-m]'); if (!x) return; S.mode = x.dataset.m; $$('[data-m]', b).forEach(y => y.classList.toggle('on', y === x)); modeBox(); });
  modeBox();
  q('[data-go]').onclick = async () => {
    const f = { name: fld('name'), symbol: fld('symbol').replace(/^\$/, ''), description: fld('description'), x: fld('x'), tg: fld('tg'), web: fld('web') };
    if (!f.name) return err('Give the coin a name.'); if (utf8len(f.name) > 32) return err('The name is over 32 bytes.');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,9}$/.test(f.symbol)) return err('The ticker needs 1 to 10 letters or numbers.');
    if (f.x && !/^(https:\/\/)?(www\.)?(x|twitter)\.com\//i.test(f.x)) return err('The X link should start with x.com/');
    if (f.tg && !/^(https:\/\/)?(t|telegram)\.me\//i.test(f.tg)) return err('The Telegram link should start with t.me/');
    if (!S.image) return err('Add an image first.');
    let creator;
    if (S.mode === 'key') { if (!b.querySelector('[data-saved]').checked) return err('Save your creator key first, then tick the box.'); creator = S.key.pub; }
    else if (S.mode === 'own') { creator = (b.querySelector('[data-own]').value || '').trim(); if (!isAddr(creator)) return err('That is not a Solana address.'); }
    else if (!WAL.current()) return err('Connect a wallet first.');
    err(''); q('[data-go]').disabled = true;
    try { if (S.mode === 'wallet') await walletLaunch(f, S, parseFloat((b.querySelector('[data-buy]') || {}).value) || 0); else await privateLaunch(f, S, creator); }
    catch (e) { line(`<span class="r">✗ ${esc(e.message)}</span>`); if (e.detail) line(`<span class="d">${esc(String(e.detail).slice(0, 200))}</span>`); }
    q('[data-go]').disabled = false;
  };
}
async function privateLaunch(f, S, creator) {
  await engine(); if (!STATUS || !STATUS.ready) throw new Error(STATUS ? (WHY[STATUS.why] || 'Free launches are resting.') : 'The engine is not reachable right now.');
  line('<span class="p">v01d:~$</span> <span class="c">launch --private</span>');
  const a = spinner('asking for a proof-of-work challenge'); const ch = await api('pow'); a.done(`<span class="o">✓</span> ${dots('challenge', `<span class="c">${ch.bits} bits</span>`)}`);
  const H = line('hashing on your device …'); const t0 = performance.now();
  const res = await pow(ch.challenge, ch.bits, p => { const k = Math.min(1, p.tries / Math.pow(2, ch.bits)), n = Math.round(k * 24); H.innerHTML = `<span class="d">hashing on your device</span> <span class="p">[${'█'.repeat(n)}${'░'.repeat(24 - n)}]</span> <span class="f">${(p.rate / 1e6).toFixed(2)}M h/s</span>`; });
  H.innerHTML = `<span class="o">✓</span> ${dots('proof of work', `<span class="c">found in ${((performance.now() - t0) / 1000).toFixed(1)}s</span>`)}`;
  line(`<span class="o">✓</span> ${dots('clean image', `<span class="c">${Math.round(S.image.bytes / 1024)} KB, no metadata</span>`)}`);
  line(`<span class="o">✓</span> ${dots('creator', `<span class="c">${short(creator)}</span> <span class="f">(${S.mode === 'own' ? 'your own address' : 'born in this browser'})</span>`)}`);
  const T = spinner('a fresh launcher is funded inside the launch · pump.fun create');
  const j = await api('launch', { method: 'POST', body: { ...f, image: S.image.dataUrl, creator, pow: { challenge: ch.challenge, nonce: res.nonce } } });
  T.done(`<span class="o">✓</span> ${dots('launch', '<span class="c">sent</span>')}`);
  line(dots('mint', `<span class="h">${j.mint}</span>`));
  await confirm(j.status, j.id);
  line(''); line(`<span class="h">■ ${esc(f.name)} ($${esc(f.symbol)}) is live.</span> <span class="m">its creator is a key nobody else has seen.</span>`);
  line(`  <a href="https://pump.fun/coin/${j.mint}" target="_blank" rel="noopener noreferrer">pump.fun ↗</a>   <a href="https://solscan.io/tx/${j.sig}" target="_blank" rel="noopener noreferrer">transaction ↗</a>   <span class="d">claim fees later with</span> <span class="c">claim</span>`);
}
async function walletLaunch(f, S, buy) {
  buy = Math.max(0, Math.min(10, buy));
  const cur = WAL.current(), mk = nacl.sign.keyPair(), mint = b58(mk.publicKey);
  line('<span class="p">v01d:~$</span> <span class="c">launch --wallet</span>');
  line(dots('wallet', `<span class="c">${short(cur.address)}</span> <span class="f">(${esc(cur.name || 'connected')})</span>`));
  line(dots('coin key', `<span class="c">${short(mint)}</span> <span class="f">(born in this browser)</span>`));
  const B = spinner('building and simulating the launch' + (buy ? ` with a ${buy} SOL dev buy` : ''));
  const j = await api('walletbuild', { method: 'POST', body: { ...f, image: S.image.dataUrl, creator: cur.address, mint, buySol: buy } });
  B.done(`<span class="o">✓</span> ${dots('simulated', '<span class="c">ok</span>')}`);
  const W = spinner('<span class="h">approve it in your wallet</span>');
  let signed; try { signed = await WAL.signTx(unb64(j.tx)); } catch (e) { W.fail('cancelled in the wallet. nothing was sent.'); throw new Error(/reject|denied|cancel/i.test(String(e && e.message)) ? 'You cancelled in your wallet. Nothing was sent.' : (e && e.message) || 'The wallet did not sign.'); }
  W.done(`<span class="o">✓</span> ${dots('signed', '<span class="c">yes</span>')}`);
  const full = WAL.addSignature(signed, mk.publicKey, mk.secretKey);
  const Sd = spinner('sending to solana'); const r = await api('walletsend', { method: 'POST', body: { id: j.id, tx: WAL.b64(full) } }); Sd.done(`<span class="o">✓</span> ${dots('sent', '<span class="c">yes</span>')}`);
  line(dots('mint', `<span class="h">${r.mint}</span>`));
  await confirm(r.status, r.id);
  line(''); line(`<span class="h">■ ${esc(f.name)} ($${esc(f.symbol)}) is live.</span> <span class="m">launched from your wallet${buy ? `, ${buy} SOL bought first` : ''}.</span>`);
  line(`  <a href="https://pump.fun/coin/${r.mint}" target="_blank" rel="noopener noreferrer">pump.fun ↗</a>   <a href="https://solscan.io/tx/${r.sig}" target="_blank" rel="noopener noreferrer">transaction ↗</a>`);
}
async function confirm(st, id) {
  const C = spinner('waiting for confirmation'); let n = 0;
  if (st === 'launched') { C.done(`<span class="o">✓</span> ${dots('confirmed', '<span class="c">yes</span>')}`); return; }
  while (st === 'sending' && n++ < 40) { await sleep(2500); try { st = (await api('launches', { params: { id } })).launch.status; } catch {} }
  if (st === 'launched') return C.done(`<span class="o">✓</span> ${dots('confirmed', '<span class="c">yes</span>')}`);
  if (st === 'failed') { C.fail('the launch did not go through. nothing was created.'); throw new Error('The launch did not go through.'); }
  C.done(`<span class="w">…</span> still confirming. type <span class="c">coins</span> in a minute.`);
}

function loadSecret(text) { text = String(text || '').trim(); const sec = text.startsWith('[') ? Uint8Array.from(JSON.parse(text)) : unb58(text); if (sec.length === 32) return nacl.sign.keyPair.fromSeed(sec); if (sec.length !== 64) throw new Error('That does not look like a Solana secret key.'); return nacl.sign.keyPair.fromSecretKey(sec); }
export function claimForm() {
  const CL = { kp: null, addr: null, wallet: false };
  const b = block('claim · creator fees · the network fee is paid for you', `
    <div class="row"><button type="button" class="btn ghost sm" data-load>load key file</button><input type="file" hidden data-file accept=".json,application/json,text/plain"><button type="button" class="btn ghost sm" data-wal>use my wallet</button></div>
    <label class="fl" style="margin-top:10px">or paste the secret key<input data-paste type="password" autocomplete="off" placeholder="it stays in this page"></label>
    <div class="keybox"><span>creator <code data-addr>no key loaded</code></span><span>earned, unclaimed <b data-vault>—</b> · in the key <b data-in>—</b></span></div>
    <div class="row" style="margin-top:12px"><button type="button" class="btn" data-claim disabled>claim</button><button type="button" class="btn ghost sm" data-ref disabled>refresh</button></div>
    <div class="row" style="margin-top:10px"><label class="fl" style="flex:1">send the fees to<input data-to placeholder="any Solana address"></label><button type="button" class="btn ghost sm" data-send disabled style="align-self:flex-end">send</button></div>
    <div class="err" data-err></div>`);
  const q = s => b.querySelector(s), err = t => { q('[data-err]').innerHTML = t || ''; };
  const set = (kp, addr, wallet) => { CL.kp = kp; CL.wallet = !!wallet; CL.addr = kp ? b58(kp.publicKey) : addr; q('[data-addr]').textContent = CL.addr + (wallet ? '  (your wallet)' : ''); q('[data-ref]').disabled = false; refresh(); };
  const refresh = async () => { err(''); try { const j = await api('claim', { params: { creator: CL.addr } }); q('[data-vault]').textContent = `${j.vaultSol.toFixed(4)} SOL`; q('[data-in]').textContent = `${j.walletSol.toFixed(4)} SOL`; q('[data-claim]').disabled = !j.canClaim; q('[data-send]').disabled = CL.wallet || !(j.walletSol > 0.00001); if (!j.canClaim && j.vaultSol > 0) err(`<span class="d">claims open from ${j.minClaimSol} SOL, so the network fee is worth paying.</span>`); } catch (e) { err(esc(e.message)); } };
  const signSend = async (build, op, body) => { const r = await api(build, { method: 'POST', body }); const sig = nacl.sign.detached(unb64(r.message), CL.kp.secretKey); return api(op, { method: 'POST', body: { message: r.message, token: r.token, signer: CL.addr, signature: b58(sig) } }); };
  q('[data-load]').onclick = () => q('[data-file]').click();
  q('[data-file]').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { set(loadSecret(await f.text())); } catch { err('That file is not a creator key.'); } };
  q('[data-paste]').onchange = e => { try { set(loadSecret(e.target.value)); e.target.value = ''; } catch (er) { err(esc(er.message || 'That is not a secret key.')); } };
  q('[data-wal]').onclick = async () => { let cur = WAL.current(); if (!cur) { try { cur = await SG.connectAny(); } catch (er) { return err(esc(er && er.message || 'The wallet did not connect.')); } } set(null, cur.address, true); };
  q('[data-ref]').onclick = refresh;
  q('[data-claim]').onclick = async () => { q('[data-claim]').disabled = true; const L = spinner(CL.wallet ? 'building the claim for your wallet' : 'building the claim · the network fee is paid for you');
    try { let r; if (CL.wallet) { const w = await api('wclaimbuild', { method: 'POST', body: { creator: CL.addr } }); const signed = await WAL.signTx(unb64(w.tx)); r = await api('wclaimsend', { method: 'POST', body: { creator: CL.addr, tx: WAL.b64(signed) } }); } else r = await signSend('claimbuild', 'claimsend', { creator: CL.addr });
      L.done(`<span class="o">✓</span> claimed · <a href="https://solscan.io/tx/${r.sig}" target="_blank" rel="noopener noreferrer">transaction ↗</a>`); setTimeout(refresh, 2500); }
    catch (e) { L.fail(esc(e.message)); q('[data-claim]').disabled = false; } };
  q('[data-send]').onclick = async () => { const to = q('[data-to]').value.trim(); if (!isAddr(to)) return err('Enter a Solana address to send to.'); q('[data-send]').disabled = true; const L = spinner('building the transfer · the network fee is paid for you');
    try { const r = await signSend('withdrawbuild', 'withdrawsend', { from: CL.addr, to }); L.done(`<span class="o">✓</span> sent · <a href="https://solscan.io/tx/${r.sig}" target="_blank" rel="noopener noreferrer">transaction ↗</a>`); setTimeout(refresh, 2500); }
    catch (e) { L.fail(esc(e.message)); q('[data-send]').disabled = false; } };
}
export async function coinsTable(run) {
  const L = spinner('reading the chain');
  const j = await api('coins', { params: { limit: 50 } }); const l = (j.coins || []).filter(c => c.status !== 'failed');
  if (!l.length) return L.done('<span class="m">no coins launched here yet. type</span> <span class="c">launch</span> <span class="m">to be first.</span>');
  L.done(`<span class="o">✓</span> ${l.length} coin${l.length > 1 ? 's' : ''} launched on v01d`);
  const b = block(`coins · launched on v01d · ${l.length}`, `<div style="overflow:auto"><table class="tbl"><thead><tr><th></th><th>coin</th><th class="n">mcap</th><th class="n">curve</th><th>creator</th><th class="n">age</th><th></th></tr></thead><tbody>${l.map(c => `<tr><td><img src="${esc(c.img)}" alt=""></td><td><span class="tok" data-run="token ${esc(c.mint)}"><b>$${esc(c.symbol)}</b></span> <span class="d">${esc(c.name)}</span></td><td class="n">${usd(c.mcapUsd)}</td><td class="n">${c.graduated ? 'graduated' : c.progress != null ? Math.round(c.progress * 100) + '%' : c.status === 'sending' ? 'confirming' : '—'}</td><td class="d">${short(c.creator)}</td><td class="n d">${ago(c.at)}</td><td><a href="https://pump.fun/coin/${esc(c.mint)}" target="_blank" rel="noopener noreferrer">pump.fun ↗</a></td></tr>`).join('')}</tbody></table></div>`);
  return b;
}
