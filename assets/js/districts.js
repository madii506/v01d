// v01d · the districts: what each building is for, its own controls, and what it runs when you walk in.
// Every control types a real command into the engine below it, so everything here can also be done by hand in the terminal.
import { esc, CA, line } from './core.js';
import { CMDS } from './cmds.js';
import * as SG from './signer.js';
import HOOD from './hood.js';

const btn = (cmd, label, cls = '') => `<button type="button" class="pa ${cls}" data-cmd="${esc(cmd)}">${label}</button>`;
const field = (id, ph, w = '', val = '') => `<input class="pin" id="${id}" placeholder="${esc(ph)}" spellcheck="false" autocomplete="off" ${w ? `style="width:${w}"` : ''} value="${esc(val)}">`;
const v = (root, id) => (root.querySelector('#' + id).value || '').trim();
// buttons that just run their command
function wireButtons(root, run) { root.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => run(b.dataset.cmd)); }
// a form whose button builds a command from its fields
function wireForm(root, run, sel, build) {
  const f = root.querySelector(sel); if (!f) return;
  f.addEventListener('submit', e => { e.preventDefault(); const c = build(); if (c) run(c); });
}
const priv = t => `<p class="priv"><i></i>${t}</p>`;

export const DIST = {
  launch: {
    tag: 'the mint',
    line: 'a coin on meteora\'s bonding curve with no wallet, no signature and no SOL. the engine pays the launch, your picture is wiped of its metadata, and the creator key is born in this tab. at ~420 SOL market cap it graduates into a meteora pool with its liquidity locked forever.',
    ui: () => `<div class="row2">${btn('launch', 'launch privately', 'pri')}${btn('launch --wallet', 'launch from a wallet or burner')}</div>
      <div class="row2">${btn('coins', 'coins born here')}${btn('claim', 'claim creator fees')}${btn('cat launch.txt', 'how it works')}</div>
      ${priv('no wallet of yours touches a private launch. the engine pays and signs it; your key only ever claims.')}`,
    wire: wireButtons, first: run => run('launch'),
  },
  swap: {
    tag: 'the exchange',
    line: 'any token for any token, routed across every solana dex at once. signed by your wallet, or by a burner that only lives in this tab.',
    ui: () => `<form class="fx" id="f-swap">${field('sw-a', 'amount', '86px', '0.1')}${field('sw-f', 'from', '96px', 'sol')}<span class="arr">→</span>${field('sw-t', 'to · ticker or mint', '', 'usdc')}<button class="pa pri">quote</button></form>
      <form class="fx" id="f-buy"><span class="lb">buy</span>${field('by-t', 'ticker or mint')}${field('by-s', 'sol', '70px', '0.1')}<button class="pa">buy</button></form>
      <form class="fx" id="f-sell"><span class="lb">sell</span>${field('sl-t', 'ticker or mint')}<span class="seg">${['25%', '50%', '100%'].map((p, i) => `<label><input type="radio" name="slp" value="${p}" ${i === 1 ? 'checked' : ''}><span>${p}</span></label>`).join('')}</span><button class="pa">sell</button></form>
      <div class="row2">${btn('wallet', 'what i hold')}${btn('pnl', 'profit and loss')}${btn('trades', 'my trades')}${btn('fees', 'network fees now')}</div>
      ${priv('quotes and swaps go through v01d, so no dex or router sees your ip next to your wallet.')}`,
    wire: (root, run) => {
      wireButtons(root, run);
      wireForm(root, run, '#f-swap', () => v(root, 'sw-a') && v(root, 'sw-f') && v(root, 'sw-t') ? `swap ${v(root, 'sw-a')} ${v(root, 'sw-f')} ${v(root, 'sw-t')}` : null);
      wireForm(root, run, '#f-buy', () => v(root, 'by-t') ? `buy ${v(root, 'by-t')} ${v(root, 'by-s') || '0.1'}` : null);
      wireForm(root, run, '#f-sell', () => v(root, 'sl-t') ? `sell ${v(root, 'sl-t')} ${root.querySelector('input[name=slp]:checked').value}` : null);
    },
    first: run => run('trending 1h'),
  },
  stocks: {
    tag: 'the bank',
    line: 'tokenized stocks, around the clock: tesla, nvidia, the s&p 500 and more, bought and sold with SOL. they track the share price; they are not shares in your name.',
    ui: () => `<form class="fx" id="f-stk"><span class="lb">buy</span>${field('st-t', 'tslax · nvdax · spyx · aaplx')}${field('st-s', 'sol', '70px', '0.25')}<button class="pa pri">buy</button></form>
      <div class="row2">${btn('stocks', 'every stock, live', 'pri')}${btn('chart spyx 1h', 'chart the s&p')}${btn('token nvdax', 'nvidia report')}</div>
      ${priv('the issuer can pause or freeze a tokenized stock. the token report shows what each one can do.')}`,
    wire: (root, run) => { wireButtons(root, run); wireForm(root, run, '#f-stk', () => v(root, 'st-t') ? `buy ${v(root, 'st-t')} ${v(root, 'st-s') || '0.25'}` : null); },
    first: run => run('stocks'),
  },
  radar: {
    tag: 'the watchtower',
    line: 'every coin born on meteora the moment it appears, the final stretch before graduation, what is trending, and a full report on anything: holders, authorities, liquidity, a risk read.',
    ui: () => `<form class="fx" id="f-rd">${field('rd-q', 'ticker, name or mint')}<button class="pa pri" data-k="token">report</button><button class="pa" data-k="chart">chart</button><button class="pa" data-k="holders">holders</button><button class="pa" data-k="tape">tape</button></form>
      <div class="row2"><button type="button" class="pa pri" data-tab="pulse">live scanner</button>${btn('trending 5m', 'trending 5m')}${btn('trending 1h', '1h')}${btn('trending 24h', '24h')}${btn('new', 'just born')}${btn('watchlist', 'watchlist')}</div>`,
    wire: (root, run) => {
      wireButtons(root, run);
      root.querySelectorAll('#f-rd [data-k]').forEach(b => b.onclick = e => { e.preventDefault(); const q = v(root, 'rd-q'); if (q) run(`${b.dataset.k} ${q}`); else root.querySelector('#rd-q').focus(); });
      root.querySelector('#f-rd').addEventListener('submit', e => { e.preventDefault(); const q = v(root, 'rd-q'); if (q) run('token ' + q); });
      root.querySelector('[data-tab=pulse]').onclick = () => document.querySelector('#ctabs [data-tab=pulse]').click();
    },
    first: () => document.querySelector('#ctabs [data-tab=pulse]').click(),
  },
  orders: {
    tag: 'the clocktower',
    line: 'limit orders and dca plans that live on jupiter, not in this tab: close it and they still fill. buy below a price, sell above one, or buy in slices over time.',
    ui: () => `<form class="fx" id="f-lim"><span class="lb">limit</span><span class="seg">${['buy', 'sell'].map((p, i) => `<label><input type="radio" name="ls" value="${p}" ${i ? '' : 'checked'}><span>${p}</span></label>`).join('')}</span>${field('lm-t', 'token')}${field('lm-a', 'amount', '78px')}<span class="lb">@</span>${field('lm-p', 'price $', '86px')}<button class="pa pri">place</button></form>
      <form class="fx" id="f-dca"><span class="lb">dca</span>${field('dc-a', 'total', '70px', '100')}${field('dc-f', 'from', '70px', 'usdc')}<span class="arr">→</span>${field('dc-t', 'to', '84px', 'sol')}<span class="lb">every</span><select class="pin" id="dc-e"><option>1h</option><option selected>1d</option><option>1w</option></select><span class="lb">×</span>${field('dc-n', 'n', '48px', '5')}<button class="pa">start</button></form>
      <div class="row2">${btn('orders', 'my open orders', 'pri')}<button type="button" class="pa" data-tab="orders">orders tab</button>${btn('alerts', 'price alerts')}</div>
      ${priv('jupiter needs about $5 for a limit order and $100 for a dca plan. both are signed by you; v01d holds nothing.')}`,
    wire: (root, run) => {
      wireButtons(root, run);
      root.querySelector('[data-tab=orders]').onclick = () => document.querySelector('#ctabs [data-tab=orders]').click();
      wireForm(root, run, '#f-lim', () => v(root, 'lm-t') && v(root, 'lm-a') && v(root, 'lm-p') ? `limit ${root.querySelector('input[name=ls]:checked').value} ${v(root, 'lm-t')} ${v(root, 'lm-a')} @ ${v(root, 'lm-p')}` : null);
      wireForm(root, run, '#f-dca', () => v(root, 'dc-a') && v(root, 'dc-f') && v(root, 'dc-t') ? `dca ${v(root, 'dc-a')} ${v(root, 'dc-f')} ${v(root, 'dc-t')} every ${root.querySelector('#dc-e').value} x${v(root, 'dc-n') || '5'}` : null);
    },
    first: run => SG.active() ? run('orders') : (
      line('<span class="m">your open limit orders and dca plans show up here once something can sign:</span>'),
      line('<span class="tok c" data-run="connect">connect</span> <span class="d">a wallet, or make a</span> <span class="tok c" data-run="burner new">burner new</span><span class="d">.</span>'),
      line('<span class="f">they live on jupiter, not in this tab: close it and they still fill.</span>')),
  },
  locker: {
    tag: 'the burners',
    line: 'a burner is a wallet born in this tab: its key never leaves the page and is gone when you close it, unless you save the key file. connect your own wallet, or never do.',
    ui: () => `<div class="row2">${btn('burner new', 'new burner', 'pri')}${btn('burner save', 'save its key')}${btn('burner load', 'load a key')}${btn('qr', 'qr to fund it')}${btn('burner sweep', 'sweep it back')}${btn('burner forget', 'forget it')}</div>
      <div class="row2">${btn('connect', 'connect a wallet')}${btn('use burner', 'sign with burner')}${btn('use wallet', 'sign with wallet')}${btn('wallet', 'balances')}${btn('disconnect', 'disconnect')}</div>
      <form class="fx" id="f-send"><span class="lb">send</span>${field('sd-a', 'amount', '78px')}${field('sd-t', 'token', '80px', 'sol')}<span class="arr">→</span>${field('sd-to', 'address')}<button class="pa">send</button></form>
      ${priv('a burner is only as private as the way you fund it. funding it straight from your main wallet links the two.')}`,
    wire: (root, run) => { wireButtons(root, run); wireForm(root, run, '#f-send', () => v(root, 'sd-a') && v(root, 'sd-to') ? `send ${v(root, 'sd-a')} ${v(root, 'sd-t') || 'sol'} ${v(root, 'sd-to')}` : null); },
    first: run => run('burner'),
  },
  scan: {
    tag: 'the mirror',
    line: 'what the surface can see. check this page live (cookies, storage, every host it talks to), read any address or transaction, and wipe everything this browser kept.',
    ui: () => `<div class="row2">${btn('privacy', 'check this page', 'pri')}${btn('rings', 'what stays public')}${btn('whoami', 'who am i here')}${btn('forget', 'forget everything')}</div>
      <form class="fx" id="f-acc"><span class="lb">read</span>${field('ac-a', 'an address or a transaction signature')}<button class="pa">read</button></form>`,
    wire: (root, run) => { wireButtons(root, run); wireForm(root, run, '#f-acc', () => { const a = v(root, 'ac-a'); return a ? (a.length > 60 ? 'tx ' + a : 'account ' + a) : null; }); },
    first: run => run('privacy'),
  },
  terminal: {
    tag: 'every command',
    line: 'the whole engine in one prompt: 70+ commands for launching, trading, reading the chain and staying unseen. type <span class="c">help</span>, or press / anywhere.',
    ui: () => `<div class="row2">${btn('help', 'help', 'pri')}${btn('status', 'engine status')}${btn('cat readme.txt', 'readme')}${btn('cat manifesto.txt', 'manifesto')}${btn('neofetch', 'neofetch')}${btn('ls', 'ls')}</div>`,
    wire: wireButtons,
    first: run => run('cat readme.txt'),
  },
  library: { tag: 'the manual', line: '', ui: () => '' },
};

// ---------------------------------------------------------------- the library: the whole manual, as a page over the world
export function manual() {
  const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  const d = (id, n, what) => `<li><a href="#/${id}" data-go="${id}"><b>${n}</b></a><span>${what}</span></li>`;
  return `<button type="button" class="lib-x" aria-label="close">✕</button>
  <header class="lib-h"><small>09 · the manual</small><h1>v<i class="zs">0</i>1d</h1><p>enter the world in private.</p></header>
  <section><h2><em>01</em>what this is</h2>
    <p>a world on solana where every building is a working app and nobody has a name. you walk in, you launch, you trade, and nothing you do here points back at you.</p>
    <p>up there is the surface: an endless white room where every tile is watched, the way every wallet on a public chain is. down here is the void. you got here through the hole.</p></section>
  <section><h2><em>02</em>the districts</h2><ul class="dl">
    ${d('launch', 'launch', 'a coin on meteora with no wallet, no signature and no SOL, or from a wallet with a first buy. claim its creator fees later.')}
    ${d('swap', 'swap', 'any token to any token across every solana dex. buy, sell, quote, track what you hold.')}
    ${d('stocks', 'stocks', 'tokenized stocks with SOL, any hour of the day.')}
    ${d('radar', 'radar', 'every meteora birth in real time, trending boards, full token reports, charts and tapes.')}
    ${d('orders', 'orders', 'limit orders and dca plans that live on jupiter and fill while you sleep.')}
    ${d('locker', 'locker', 'burner wallets born in your tab, wallet connect, sends.')}
    ${d('scan', 'scan', 'what this page and the chain can see about you, and a button to forget it all.')}
    ${d('terminal', 'terminal', 'every command in one prompt.')}
  </ul></section>
  <section><h2><em>03</em>a private launch, second by second</h2><ol class="tl">
    <li><b>00:00</b>you press launch. no wallet, no account, no email.</li>
    <li><b>00:01</b>your picture is redrawn in your browser. the camera, the place and the time inside the file never leave your device.</li>
    <li><b>00:02</b>a creator key is born in your browser. you save it; v01d never sees it.</li>
    <li><b>00:04</b>a few seconds of proof of work on your device instead of a login, so nobody can drain the engine.</li>
    <li><b>00:05</b>the engine pays for the launch out of its treasury, in one transaction. your wallet is never in it.</li>
    <li><b>00:06</b>the coin is live on meteora's dynamic bonding curve. no dev buy, so everyone starts at the same price.</li>
    <li><b>~420 SOL</b>it graduates into a meteora pool. the liquidity is locked forever: 80% of it is the creator's, 20% v01d's.</li>
    <li><b>later</b>load your key in the launch district and claim the fees. the network fee is paid for you.</li></ol></section>
  <section><h2><em>04</em>the curve, on meteora</h2>
    <p>every coin born here lives on meteora's dynamic bonding curve, the same engine under bags and jupiter studio. one curve for every coin, written on chain once and shared:</p>
    <table class="pt"><tbody>
    ${row('supply', '1,000,000,000 tokens, 6 decimals. nobody can mint more and the metadata is frozen.')}
    ${row('starts at', 'about 30 SOL of market cap. no dev buy on a private launch, so everyone starts at the same price.')}
    ${row('graduates at', 'about 420 SOL of market cap. the curve moves its SOL and tokens into a meteora DAMM v2 pool.')}
    ${row('after graduation', 'the pool\'s liquidity is locked forever. 80% of the locked position belongs to the creator, 20% to v01d; both earn its fees.')}
    ${row('trading fee', '1% on the curve. meteora keeps its protocol cut; of the rest, 80% is the creator\'s and 20% refills the treasury that pays for free launches.')}
    ${row('creator fees', 'they wait in the coin\'s pool until the creator key claims them. type claim, load the key file, done; the network fee is paid for you.')}
    </tbody></table></section>
  <section><h2><em>05</em>what stays hidden, what stays public</h2>
    <table class="pt"><thead><tr><th>hidden</th><th>still public</th></tr></thead><tbody>
    ${row('your name: never asked', 'nothing')}
    ${row('your wallet: never used for a private launch', 'the launcher and the coin')}
    ${row('your creator key: born in your browser', 'its address, once it claims')}
    ${row('your picture\'s metadata: wiped on your device', 'the picture itself')}
    ${row('your browser: no cookies, no analytics, no third-party scripts', 'your ip, to v01d, like any website')}
    ${row('your trades: a burner can sign them', 'the burner, and how it was funded')}
    ${row('your balances: only once you move them into a solana privacy ring (helius runs those, not v01d)', 'who sent to whom, and what leaves a ring')}
    </tbody></table>
    <p class="note">a public chain is public. v01d can't hide what solana shows; it can stop it pointing at you.</p></section>
  <section><h2><em>06</em>honest limits</h2><ul class="lim">
    <li>a burner funded straight from your main wallet is linked to it, forever. fund it some other way.</li>
    <li>tokenized stocks track a share price. they are not shares in your name, and their issuers can pause or freeze them.</li>
    <li>free launches run while the engine's treasury has SOL. 20% of every coin's curve fees flows back into it; when it runs low anyway, launches pause until it is topped up, and the launch district says so.</li>
    <li>a coin graduates only if people buy it up the curve. most never do.</li>
    <li>a limit order needs about $5, a dca plan about $100. those are jupiter's minimums, not ours.</li>
    <li>most memecoins go to zero. nothing in v01d is advice.</li></ul></section>
  <section><h2><em>07</em>every command</h2>
    <p>every building is a front for the same engine. all of it also works by hand: open the terminal (press /) and type. click one here to run it.</p>
    <p class="note">keys: <b>1–9</b> walk into a district · <b>/</b> the prompt · <b>ctrl k</b> go anywhere · <b>tab</b> completes · <b>↑ ↓</b> your history · <b>esc</b> steps back out.</p>
    ${[['launch', 'launch'], ['trade', 'trade'], ['wallet', 'wallets and burners'], ['market', 'markets'], ['privacy', 'privacy'], ['system', 'the system']].map(([k, t]) => {
      const cs = Object.values(CMDS).filter(c => c.cat === k && c.help && c.name !== 'gm'); if (!cs.length) return '';
      return `<h3 class="ch3">${t}</h3><ul class="cref">${cs.map(c => `<li>${/[<\[]/.test(c.usage) ? `<code>${esc(c.usage)}</code>` : `<code class="tok" data-run="${esc(c.name)}">${esc(c.usage)}</code>`}<span>${esc(c.help)}</span></li>`).join('')}</ul>`;
    }).join('')}</section>
  <section><h2><em>08</em>questions</h2><div class="faq2">
    <details><summary>do i need a wallet?</summary><p>not to look around, and not for a private launch. you need one (or a burner with SOL in it) to trade.</p></details>
    <details><summary>does v01d hold my money?</summary><p>no. every transaction is signed by your wallet or by a burner in your tab. v01d builds transactions and relays them; it never holds a key.</p></details>
    <details><summary>what does v01d know about me?</summary><p>what any website sees: your ip, for as long as a request takes. no cookies, no analytics, no accounts. the scan district checks this page live.</p></details>
    <details><summary>who made it?</summary><p>nobody. that is the point.</p></details>
    <details><summary>is there a token?</summary><p>${CA ? `$V01D: <code>${esc(CA)}</code>` : 'not yet. when there is, its address will be here and in the terminal (type ca). nothing else is it.'}</p></details>
  </div></section>
  <section class="lib-end"><pre class="ascii">${esc(HOOD)}</pre><p>independent. not affiliated with anyone. nothing here is advice.</p></section>`;
}
