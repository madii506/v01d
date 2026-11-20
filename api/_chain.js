// v01d chain side: derived keys, Raydium LaunchLab launches, gasless creator-fee claims, withdrawals and coin stats.
// Raydium's own SDK builds every LaunchLab instruction; web3.js compiles, simulates and sends.
//
// Every coin is born on Raydium LaunchLab, inside v01d's own LaunchLab platform (a platform config the treasury makes once):
// SOL-quoted, 1B supply, 793.1M sold along a constant-product curve, graduating once the curve has raised 85 SOL into a
// Raydium CPMM pool (its LP half burned, half locked for good with the pool's trading fees going to v01d).
// The trading fee on the curve is 1%: 0.5% to the coin's creator, 0.25% to the treasury that pays for free launches, 0.25% to Raydium.
const crypto = require('crypto');
const L = require('./_lib');
const MOCK = !!process.env.HALO_MOCK;          // local dev only: no network, fake chain answers
let W3, RAY, BNM, SPL;
const w3 = () => W3 || (W3 = require('@solana/web3.js'));
const ray = () => RAY || (RAY = require('@raydium-io/raydium-sdk-v2'));
const BN = () => BNM || (BNM = require('bn.js'));
const spl = () => SPL || (SPL = require('@solana/spl-token'));

const RPCS = [process.env.RPC_URL, 'https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'].filter(Boolean);
// dry runs only: a simulated launch needs a payer that exists. The richest of these public wallets is used (nothing is signed or sent).
const SIM_PAYERS = [process.env.HALO_SIM_PAYER, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9',
  'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS', 'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2', 'FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5'].filter(Boolean);
const BASE_FEE = 5000;
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SUPPLY = 1_000_000_000, BASE_DEC = 6;
const SUPPLY_RAW = '1000000000000000', SELL_RAW = '793100000000000';     // LaunchLab's standard shape: 79.31% sold on the curve
const RAISE_SOL = Number(process.env.V01D_RAISE_SOL || 85);
const PROGRAM = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
const FEE_PPM = { platform: 2500, creator: 5000 };                     // 0.25% to v01d, 0.5% to the creator (Raydium adds its 0.25%)
const LP_PPM = { burn: 500000, platform: 500000 };                     // at graduation: half the LP burned, half locked with its fees to v01d
const SITE = process.env.V01D_SITE || 'https://v01d-82yx.vercel.app';
const MIN_CLAIM = 1_000_000;                                           // a gasless claim pays out at least 0.001 SOL
const ATA_RENT = 2_039_280;
const CB_PROGRAM = 'ComputeBudget111111111111111111111111111111';

function timedFetch(ms) { return (url, opt = {}) => fetch(url, { ...opt, signal: AbortSignal.timeout(ms) }); }
let conns = null;
function connections() {
  if (!conns) { const { Connection } = w3(); conns = RPCS.map(u => new Connection(u, { commitment: 'confirmed', disableRetryOnRateLimit: true, fetch: timedFetch(10000) })); }
  return conns;
}
async function rpc(fn) {
  let last;
  for (const c of connections()) { try { return await fn(c); } catch (e) { last = e; } }
  const m = String(last && last.message || last || '');
  throw L.err(502, 'Solana RPC is busy right now. Try again in a moment.', { detail: m.slice(0, 160) });
}
// Raydium's SDK reads the chain (and Raydium's launch API) while it builds: on a network failure try the next RPC, never a raw 500
const NETERR = /fetch|network|timed? ?out|abort|429|50[234]|ECONN|socket|rate.?limit|too many|failed to get|ENOTFOUND|EAI_AGAIN/i;
async function sdk(fn) {
  let last;
  for (const c of connections()) { try { return await fn(c); } catch (e) { last = e; if (!NETERR.test(String(e && e.message || e))) throw e; } }
  throw L.err(502, 'The network is busy right now. Try again in a moment.', { detail: String(last && last.message || last).slice(0, 160) });
}
const loadRay = (c, owner) => ray().Raydium.load({ connection: c, owner, cluster: 'mainnet', disableLoadToken: true, disableFeatureCheck: true, blockhashCommitment: 'confirmed' });

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58enc(buf) { let n = 0n; for (const b of buf) n = n * 256n + BigInt(b); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b === 0) s = '1' + s; else break; } return s; }
function b58dec(str) { let n = 0n; for (const c of str) { const i = B58.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); } const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; } for (const c of str) { if (c === '1') out.unshift(0); else break; } return Buffer.from(out); }
function isAddr(s) { if (typeof s !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false; try { return b58dec(s).length === 32; } catch { return false; } }
function edVerify(pub32, msg, sig64) {
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pub32)]), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(msg), key, Buffer.from(sig64));
  } catch { return false; }
}

// ---------- keys: all derived from the master secret ----------
async function keys(id) {
  const m = await L.master(), seed = s => crypto.createHmac('sha256', m).update(s).digest();
  if (MOCK) {
    const fake = s => { const pub = crypto.createHash('sha256').update(seed(s)).digest(); return { publicKey: { toBase58: () => b58enc(pub), bytes: pub } }; };
    const o = { treasury: fake('halo:treasury') }; if (id) { o.launcher = o.treasury; o.mint = fake('halo:mint:' + id); } return o;
  }
  const { Keypair } = w3();
  const o = { treasury: Keypair.fromSeed(seed('halo:treasury')) };
  if (id) { o.launcher = o.treasury; o.mint = Keypair.fromSeed(seed('halo:mint:' + id)); }
  return o;
}
async function treasury() { return (await keys()).treasury.publicKey.toBase58(); }

// ---------- LaunchLab addresses ----------
let IDS = null;
function ids() {
  if (IDS) return IDS;
  const { PublicKey } = w3(), R = ray(), prog = new PublicKey(PROGRAM), wsol = new PublicKey(SOL_MINT);
  return (IDS = { R, PublicKey, prog, wsol, config: R.getPdaLaunchpadConfigId(prog, wsol, 0, 0).publicKey, rayPlatform: R.LAUNCHPAD_PLATFORM });
}
async function platformId() { const { R, prog } = ids(); return R.getPdaPlatformId(prog, (await keys()).treasury.publicKey).publicKey; }
async function configAddress() { if (MOCK) return treasury(); return (await platformId()).toBase58(); }   // "config" = v01d's own platform on LaunchLab
function poolOf(mint) { const { R, prog, wsol, PublicKey } = ids(); return R.getPdaLaunchpadPoolId(prog, new PublicKey(mint), wsol).publicKey.toBase58(); }
// LaunchLab's global SOL config and Raydium's own platform (for its CPMM config id), read once a minute
let CHAIN = null;
async function chainCfg() {
  if (CHAIN && Date.now() - CHAIN.t < 60000) return CHAIN.v;
  const { R, config, rayPlatform } = ids();
  const [ca, pa] = await rpc(c => c.getMultipleAccountsInfo([config, rayPlatform], 'confirmed'));
  if (!ca) throw L.err(502, 'Raydium LaunchLab could not be read right now. Try again in a moment.');
  const v = { cfg: R.LaunchpadConfig.decode(ca.data), ray: pa ? R.PlatformConfig.decode(pa.data) : null };
  CHAIN = { t: Date.now(), v }; return v;
}

// ---------- mock chain for local dev ----------
const M = { bal: new Map(), sigs: new Map(), vault: new Map() };
if (MOCK) M.bal.set('*treasury', Number(process.env.HALO_MOCK_TREASURY || 500_000_000));
function mockSig() { return b58enc(crypto.randomBytes(64)); }

async function balance(addr) {
  if (MOCK) { if (addr === await treasury()) return M.bal.get('*treasury'); return M.bal.get(addr) || 0; }
  const { PublicKey } = w3(); return rpc(c => c.getBalance(new PublicKey(addr), 'confirmed'));
}
async function priorityFee() {
  if (MOCK) return 60000;
  return L.cached('prio', 20000, async () => {
    const r = await rpc(c => c.getRecentPrioritizationFees({ lockedWritableAccounts: [new (w3().PublicKey)(PROGRAM)] }));
    const v = r.map(x => x.prioritizationFee).filter(x => x > 0).sort((a, b) => a - b);
    const p = v.length ? v[Math.floor(v.length * .75)] : 50000;
    return Math.max(25000, Math.min(400000, p));
  });
}

// ---------- building ----------
// the SDK hands back legacy transactions (sometimes empty with the instructions on its builder); we keep the instructions
// and set compute budget ourselves
const ixsOf = m => {
  const list = Array.isArray(m.transactions) && m.transactions.length ? m.transactions
    : [m.transaction && m.transaction.instructions && m.transaction.instructions.length ? m.transaction : { instructions: (m.builder && m.builder.allInstructions) || [] }];
  return list.flatMap(t => t.instructions || []).filter(ix => ix.programId.toBase58() !== CB_PROGRAM);
};
function compile(payer, ixs, blockhash) {
  const { TransactionMessage, VersionedTransaction } = w3();
  return new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());
}

// v01d's platform on LaunchLab: made once by the treasury (its admin and fee wallet), then every launch points at it
let platReady = false;
async function configExists() {
  if (MOCK || platReady) return true;
  const { prog } = ids(), id = await platformId();
  const inf = await rpc(c => c.getAccountInfo(id, 'confirmed'));
  platReady = !!inf && inf.owner.equals(prog);
  return platReady;
}
async function platformIxs() {
  const { R, prog } = ids(), B = BN(); const tre = (await keys()).treasury.publicKey;
  const { ray: rp } = await chainCfg(); if (!rp) throw L.err(502, 'Raydium LaunchLab could not be read right now. Try again in a moment.');
  const made = await sdk(async c => (await loadRay(c, tre)).launchpad.createPlatformConfig({
    programId: prog, platformAdmin: tre, platformClaimFeeWallet: tre, platformLockNftWallet: tre, platformVestingWallet: tre,
    cpConfigId: rp.cpConfigId, migrateCpLockNftScale: { platformScale: new B(LP_PPM.platform), creatorScale: new B(0), burnScale: new B(LP_PPM.burn) },
    transferFeeExtensionAuth: tre, creatorFeeRate: new B(FEE_PPM.creator), feeRate: new B(FEE_PPM.platform),
    name: 'v01d', web: SITE, img: SITE + '/assets/img/mark-512.png', txVersion: R.TxVersion.LEGACY, feePayer: tre,
  }));
  return ixsOf(made);
}
async function ensureConfig() {
  if (await configExists()) return true;
  const { ComputeBudgetProgram } = w3(); const k = await keys();
  const ixs = [ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: await priorityFee() }), ...(await platformIxs())];
  const { blockhash } = await rpc(c => c.getLatestBlockhash('confirmed'));
  const tx = compile(k.treasury.publicKey, ixs, blockhash); tx.sign([k.treasury]);
  const sim = await rpc(c => c.simulateTransaction(tx, { sigVerify: false, commitment: 'processed' }));
  if (sim.value.err) throw L.err(503, 'v01d\'s launchpad on Raydium could not be opened yet.', { detail: JSON.stringify(sim.value.err), logs: (sim.value.logs || []).slice(-6) });
  const raw = Buffer.from(tx.serialize()), sig = b58enc(tx.signatures[0]);
  await rpc(c => c.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 3 }));
  for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 1500)); const st = await statusOf(sig).catch(() => null); if (st) { if (st.err) throw L.err(503, 'v01d\'s launchpad on Raydium could not be opened yet.', { detail: st.err }); break; } }
  platReady = false; return configExists();
}

// ---------- launch ----------
// payer pays the rent and fees; creator is the coin's creator on chain (it earns the creator fee) and does not sign the create
async function poolIxs(rec, { payer, creator, mint, buyLamports = 0, platform }) {
  const { R, prog, config, PublicKey } = ids(), B = BN();
  const { cfg } = await chainCfg(); const plat = platform || await platformId();
  const made = await sdk(async c => (await loadRay(c, new PublicKey(creator))).launchpad.createLaunchpad({
    programId: prog, mintA: new PublicKey(mint), decimals: BASE_DEC, name: rec.name, symbol: rec.symbol, uri: rec.uri, migrateType: 'cpmm',
    configId: config, configInfo: cfg, mintBDecimals: 9, platformId: plat, txVersion: R.TxVersion.LEGACY,
    slippage: new B(100), buyAmount: new B(String(Math.max(0, Math.round(buyLamports)))), createOnly: !(buyLamports > 0),
    supply: new B(SUPPLY_RAW), totalSellA: new B(SELL_RAW), totalFundRaisingB: new B(String(Math.round(RAISE_SOL * 1e9))),
    totalLockedAmount: new B(0), cliffPeriod: new B(0), unlockPeriod: new B(0), feePayer: new PublicKey(payer),
  }));
  return ixsOf(made);
}
// the richest existing wallet among the dry-run payers (cached 10 min)
let SIMP = null;
async function simPayer() {
  if (SIMP && Date.now() - SIMP.t < 600000) return SIMP.v;
  const { PublicKey } = w3(); const list = SIM_PAYERS.filter(isAddr).map(a => new PublicKey(a));
  const infos = await rpc(c => c.getMultipleAccountsInfo(list, 'confirmed'));
  let best = null; infos.forEach((inf, i) => { if (inf && inf.owner.toBase58() === '11111111111111111111111111111111' && (!best || inf.lamports > best.l)) best = { k: list[i], l: inf.lamports }; });
  if (!best) throw L.err(502, 'No dry-run payer could be read right now.');
  SIMP = { t: Date.now(), v: best.k }; return best.k;
}
// What the treasury pays for one launch, read off the payer's own balance after the simulated transaction.
// A dry run before v01d's platform exists simulates the very same create on Raydium's own platform (standIn).
async function simulateLaunch(rec, { dry = false } = {}) {
  if (MOCK) return { ok: true, need: 21_870_000, cu: 142_000, payer: dry ? SIM_PAYERS[0] || await treasury() : await treasury() };
  const { ComputeBudgetProgram } = w3(); const { rayPlatform } = ids();
  const k = await keys(rec.id);
  const live = await configExists();
  if (!live && !dry) await ensureConfig();
  const payer = dry ? await simPayer() : k.treasury.publicKey, standIn = dry && !live;
  const body = await poolIxs(rec, { payer, creator: rec.creator, mint: k.mint.publicKey, platform: standIn ? rayPlatform : undefined });
  const ixs = [ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }), ...body];
  const { blockhash } = await rpc(c => c.getLatestBlockhash('confirmed'));
  const tx = compile(payer, ixs, blockhash);
  const bytes = tx.serialize().length;
  const pre = await rpc(c => c.getBalance(payer, 'confirmed'));
  const sim = await rpc(c => c.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: 'processed', accounts: { encoding: 'base64', addresses: [payer.toBase58()] } }));
  const v = sim.value;
  if (v.err) return { ok: false, err: JSON.stringify(v.err), logs: (v.logs || []).slice(-8), payer: payer.toBase58(), standIn, bytes };
  const post = v.accounts && v.accounts[0] ? v.accounts[0].lamports : pre;
  return { ok: true, need: Math.max(0, pre - post), cu: v.unitsConsumed || 150000, bytes, payer: payer.toBase58(), standIn, pool: poolOf(k.mint.publicKey.toBase58()) };
}
async function sendLaunch(rec) {
  const sim = await simulateLaunch(rec);
  if (!sim.ok) throw L.err(400, 'Raydium would reject this launch right now.', { detail: sim.err, logs: sim.logs });
  const price = await priorityFee(), cu = Math.min(800000, Math.ceil(sim.cu * 1.15) + 5000);
  const cost = sim.need + BASE_FEE * 2 + Math.ceil(cu * price / 1e6);
  if (MOCK) {
    const sig = mockSig(); M.sigs.set(sig, { at: Date.now() }); M.bal.set('*treasury', M.bal.get('*treasury') - cost);
    return { sig, raw: Buffer.from('mock').toString('base64'), cost };
  }
  const { ComputeBudgetProgram } = w3();
  const k = await keys(rec.id);
  const ixs = [ComputeBudgetProgram.setComputeUnitLimit({ units: cu }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }),
    ...(await poolIxs(rec, { payer: k.treasury.publicKey, creator: rec.creator, mint: k.mint.publicKey }))];
  const { blockhash } = await rpc(c => c.getLatestBlockhash('confirmed'));
  const tx = compile(k.treasury.publicKey, ixs, blockhash); tx.sign([k.treasury, k.mint]);
  const raw = Buffer.from(tx.serialize()), sig = b58enc(tx.signatures[0]);
  return { sig, raw: raw.toString('base64'), cost };
}
async function broadcast(rawB64) {
  if (MOCK) return true;
  const raw = Buffer.from(rawB64, 'base64');
  await rpc(c => c.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 2 }));
  return true;
}
async function statusOf(sig) {
  if (MOCK) { const s = M.sigs.get(sig); if (!s) return null; return Date.now() - s.at > 1500 ? { done: true, err: null } : null; }
  const r = await rpc(c => c.getSignatureStatuses([sig], { searchTransactionHistory: true }));
  const s = r.value[0]; if (!s) return null;
  if (s.err) return { done: true, err: JSON.stringify(s.err) };
  if (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized') return { done: true, err: null };
  return null;
}

// ---------- curves: read straight from the chain ----------
async function readPools(mints) {
  if (!mints.length) return {};
  const { R, PublicKey } = ids(); const out = {};
  for (let i = 0; i < mints.length; i += 90) {
    const part = mints.slice(i, i + 90), pools = part.map(poolOf);
    const infos = await rpc(c => c.getMultipleAccountsInfo(pools.map(p => new PublicKey(p)), 'confirmed'));
    infos.forEach((inf, j) => { if (!inf) return; try { out[part[j]] = { pool: pools[j], p: R.LaunchpadPool.decode(inf.data) }; } catch {} });
  }
  return out;
}

// ---------- claims and withdrawals: we build the message, the browser signs, we co-sign only what we built ----------
// On LaunchLab a creator's fees from every coin they made sit in one vault per creator; the claim unwraps them to plain SOL.
function creatorVault(creator) { const { R, prog, wsol, PublicKey } = ids(); return R.getPdaCreatorVault(prog, new PublicKey(creator), wsol).publicKey; }
async function claimable(creator) {
  if (MOCK) return { vault: M.vault.has(creator) ? M.vault.get(creator) : 12_345_678, wallet: M.bal.get(creator) || 0, pools: [] };
  const { PublicKey } = w3(); const pk = new PublicKey(creator), v = creatorVault(creator);
  const [infos, wallet] = await Promise.all([rpc(c => c.getMultipleAccountsInfo([v], 'confirmed')), rpc(c => c.getBalance(pk, 'confirmed'))]);
  const inf = infos[0], fee = inf && inf.data.length >= 72 ? Number(inf.data.readBigUInt64LE(64)) : 0;
  return { vault: fee, wallet, pools: [], vaultAddress: v.toBase58() };
}
// wSOL lands in the creator's own token account, which closes straight back into SOL. When we pay (gasless), the
// creator hands back the account's rent in the same transaction, so a claim never costs the treasury more than its fee.
async function claimIxs(creator, payer) {
  const { R, prog, wsol, PublicKey } = ids(), S = spl(), { SystemProgram } = w3();
  const pk = new PublicKey(creator), ata = S.getAssociatedTokenAddressSync(wsol, pk, true);
  const had = await rpc(c => c.getAccountInfo(ata, 'confirmed'));
  const ixs = [];
  if (!had) ixs.push(S.createAssociatedTokenAccountIdempotentInstruction(payer, ata, pk, wsol));
  ixs.push(R.claimCreatorFee(prog, pk, R.getPdaCreatorFeeVaultAuth(prog).publicKey, creatorVault(creator), ata, wsol, S.TOKEN_PROGRAM_ID));
  ixs.push(S.createCloseAccountInstruction(ata, pk, pk));
  if (!had && !payer.equals(pk)) ixs.push(SystemProgram.transfer({ fromPubkey: pk, toPubkey: payer, lamports: ATA_RENT }));
  return ixs;
}
async function token(label, bytes) {
  const ts = Date.now().toString(36);
  return (await L.hmac(label, Buffer.concat([Buffer.from(bytes), Buffer.from(ts)]))).toString('hex') + '.' + ts;
}
async function checkToken(label, bytes, tok, maxAge = 100000) {
  const [h, ts] = String(tok || '').split('.'); if (!h || !ts) return false;
  if (Date.now() - parseInt(ts, 36) > maxAge) return false;
  const want = await L.hmac(label, Buffer.concat([Buffer.from(bytes), Buffer.from(ts)]));
  const got = Buffer.from(h, 'hex'); return got.length === want.length && crypto.timingSafeEqual(got, want);
}
async function buildClaim(creator) {
  if (MOCK) { const bytes = crypto.randomBytes(180); return { message: bytes.toString('base64'), token: await token('halo:claim', bytes), signer: creator }; }
  const { PublicKey, ComputeBudgetProgram } = w3(); const pk = new PublicKey(creator); const k = await keys();
  const c = await claimable(creator);
  if (!c.vault) throw L.err(400, 'Nothing to claim yet.');
  if (c.vault < MIN_CLAIM) throw L.err(400, `Claims open at ${MIN_CLAIM / 1e9} SOL. This key has ${(c.vault / 1e9).toFixed(6)} SOL so far.`);
  const ixs = await claimIxs(creator, k.treasury.publicKey);
  const all = [ComputeBudgetProgram.setComputeUnitLimit({ units: 120000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: await priorityFee() }), ...ixs];
  const { blockhash } = await rpc(c2 => c2.getLatestBlockhash('confirmed'));
  const tx = compile(k.treasury.publicKey, all, blockhash);
  const msg = tx.message, idx = msg.staticAccountKeys.findIndex(x => x.equals(pk));
  if (idx < 0 || idx >= msg.header.numRequiredSignatures) throw L.err(500, 'Unexpected claim layout.');
  const sim = await rpc(c2 => c2.simulateTransaction(tx, { sigVerify: false, commitment: 'processed' }));
  if (sim.value.err) throw L.err(400, 'This claim would fail right now.', { detail: JSON.stringify(sim.value.err), logs: (sim.value.logs || []).slice(-6) });
  const bytes = Buffer.from(msg.serialize());
  return { message: bytes.toString('base64'), token: await token('halo:claim', bytes), signer: creator };
}
async function buildWithdraw(from, to, lamports) {
  if (MOCK) { const bytes = crypto.randomBytes(150); return { message: bytes.toString('base64'), token: await token('halo:withdraw', bytes), signer: from, lamports }; }
  const { PublicKey, SystemProgram } = w3(); const f = new PublicKey(from), t = new PublicKey(to);
  const { blockhash } = await rpc(c => c.getLatestBlockhash('confirmed'));
  const tx = compile(f, [SystemProgram.transfer({ fromPubkey: f, toPubkey: t, lamports })], blockhash);
  const bytes = Buffer.from(tx.message.serialize());
  return { message: bytes.toString('base64'), token: await token('halo:withdraw', bytes), signer: from, lamports };
}
// Take back a message we built, the browser's signature for it, add ours when we are the fee payer, send.
async function finish(label, messageB64, signer, sigB58, cosign) {
  const bytes = Buffer.from(String(messageB64 || ''), 'base64');
  if (!bytes.length || !(await checkToken(label, bytes, cosign.token))) throw L.err(400, 'That request expired. Try again.');
  let sig; try { sig = b58dec(String(sigB58 || '')); } catch { sig = Buffer.alloc(0); }
  if (sig.length !== 64 || !edVerify(b58dec(signer), bytes, sig)) throw L.err(400, 'The signature does not match this wallet.');
  if (MOCK) { const s = mockSig(); M.sigs.set(s, { at: Date.now() }); if (label === 'halo:claim') { M.bal.set(signer, (M.bal.get(signer) || 0) + (M.vault.has(signer) ? M.vault.get(signer) : 12_345_678)); M.vault.set(signer, 0); } else { M.bal.set(signer, 0); } return s; }
  const { VersionedMessage, VersionedTransaction, PublicKey } = w3();
  const tx = new VersionedTransaction(VersionedMessage.deserialize(bytes));
  tx.addSignature(new PublicKey(signer), sig);
  if (cosign.treasury) tx.sign([(await keys()).treasury]);
  const raw = Buffer.from(tx.serialize());
  await rpc(c => c.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'processed', maxRetries: 3 }));
  return b58enc(tx.signatures[0]);
}

// ---------- launches paid and signed by the user's own wallet ----------
// The wallet pays and is the creator; the optional first buy sits in the same transaction, so nobody can buy before it.
// The browser made the mint key; the wallet signs first, the mint key signs last, and we only send what checks out.
async function buildWalletLaunch(rec, buyLamports) {
  const { PublicKey, ComputeBudgetProgram } = w3();
  const user = new PublicKey(rec.creator), mint = new PublicKey(rec.mint);
  if (!MOCK) await ensureConfig();
  const price = await priorityFee();
  const blockhash = MOCK ? b58enc(crypto.randomBytes(32)) : (await rpc(c => c.getLatestBlockhash('confirmed'))).blockhash;
  let ixs, cu = 300000;
  if (MOCK) { const { SystemProgram } = w3(); ixs = [SystemProgram.transfer({ fromPubkey: user, toPubkey: mint, lamports: 0 })]; }
  else {
    ixs = await poolIxs(rec, { payer: user, creator: user, mint, buyLamports });
    const probe = compile(user, [ComputeBudgetProgram.setComputeUnitLimit({ units: 900000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }), ...ixs], blockhash);
    if (probe.serialize().length > 1232) throw L.err(400, 'This launch is too big for one transaction. Shorten the name or skip the first buy.');
    const sim = await rpc(c => c.simulateTransaction(probe, { sigVerify: false, replaceRecentBlockhash: true, commitment: 'processed' }));
    const v = sim.value;
    if (v.err) {
      const txt = JSON.stringify(v.err) + ' ' + (v.logs || []).join(' ');
      if (/AccountNotFound|insufficient lamports|InsufficientFunds|0x1\b/i.test(txt)) throw L.err(402, `Your wallet needs about ${(0.03 + buyLamports / 1e9).toFixed(3)} SOL for this launch.`);
      throw L.err(400, 'Raydium would reject this launch right now.', { detail: JSON.stringify(v.err), logs: (v.logs || []).slice(-6) });
    }
    cu = Math.min(1200000, Math.ceil((v.unitsConsumed || 200000) * 1.2) + 10000);
  }
  const tx = compile(user, [ComputeBudgetProgram.setComputeUnitLimit({ units: cu }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }), ...ixs], blockhash);
  const keysList = tx.message.staticAccountKeys.map(k => k.toBase58()), n = tx.message.header.numRequiredSignatures;
  if (keysList[0] !== rec.creator || keysList.indexOf(rec.mint) < 0 || keysList.indexOf(rec.mint) >= n) throw L.err(500, 'Unexpected launch layout.');
  return { tx: Buffer.from(tx.serialize()).toString('base64'), cu, price };
}
async function sendWalletLaunch(row, rawB64) {
  const { VersionedTransaction } = w3();
  const raw = Buffer.from(String(rawB64 || ''), 'base64');
  let tx; try { tx = VersionedTransaction.deserialize(raw); } catch { throw L.err(400, 'That transaction could not be read.'); }
  const msg = tx.message, keysList = msg.staticAccountKeys.map(k => k.toBase58()), n = msg.header.numRequiredSignatures;
  if (keysList[0] !== row.creator) throw L.err(400, 'The paying wallet is not the creator you chose.');
  const mi = keysList.indexOf(row.mint); if (mi < 0 || mi >= n) throw L.err(400, 'That is not the coin you set up.');
  if (!MOCK && !keysList.includes(PROGRAM)) throw L.err(400, 'That is not a Raydium launch.');
  const mbytes = Buffer.from(msg.serialize());
  for (let i = 0; i < n; i++) if (!edVerify(b58dec(keysList[i]), mbytes, tx.signatures[i])) throw L.err(400, i === 0 ? 'Your wallet did not sign the launch.' : 'The coin key did not sign the launch.');
  const sig = b58enc(tx.signatures[0]);
  if (MOCK) { M.sigs.set(sig, { at: Date.now() }); return { sig, raw: raw.toString('base64') }; }
  await rpc(c => c.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'processed', maxRetries: 3 }));
  return { sig, raw: raw.toString('base64') };
}
// A claim the creator's own wallet signs and pays for: nothing of ours in it.
async function buildWalletClaim(creator) {
  const { PublicKey, ComputeBudgetProgram } = w3(); const pk = new PublicKey(creator);
  if (MOCK) {
    const blockhash = b58enc(crypto.randomBytes(32)), { SystemProgram } = w3();
    const tx = compile(pk, [ComputeBudgetProgram.setComputeUnitLimit({ units: 120000 }), SystemProgram.transfer({ fromPubkey: pk, toPubkey: pk, lamports: 0 })], blockhash);
    return { tx: Buffer.from(tx.serialize()).toString('base64') };
  }
  const c = await claimable(creator);
  if (!c.vault) throw L.err(400, 'Nothing to claim yet.');
  const ixs = await claimIxs(creator, pk);
  const { blockhash } = await rpc(c2 => c2.getLatestBlockhash('confirmed'));
  const tx = compile(pk, [ComputeBudgetProgram.setComputeUnitLimit({ units: 120000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: await priorityFee() }), ...ixs], blockhash);
  const sim = await rpc(c2 => c2.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: 'processed' }));
  if (sim.value.err) throw L.err(400, 'This claim would fail right now.', { detail: JSON.stringify(sim.value.err), logs: (sim.value.logs || []).slice(-6) });
  return { tx: Buffer.from(tx.serialize()).toString('base64') };
}
// Relay a wallet-signed claim: only LaunchLab, token and compute-budget programs, the creator pays, every signature valid.
async function relayWalletClaim(creator, rawB64) {
  const { VersionedTransaction } = w3();
  const raw = Buffer.from(String(rawB64 || ''), 'base64');
  let tx; try { tx = VersionedTransaction.deserialize(raw); } catch { throw L.err(400, 'That transaction could not be read.'); }
  const msg = tx.message, keysList = msg.staticAccountKeys.map(k => k.toBase58()), n = msg.header.numRequiredSignatures;
  if (keysList[0] !== creator) throw L.err(400, 'The paying wallet is not the creator.');
  const ok = new Set([PROGRAM, CB_PROGRAM, '11111111111111111111111111111111', 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']);
  for (const ix of msg.compiledInstructions) if (!ok.has(keysList[ix.programIdIndex] || '')) { if (!MOCK) throw L.err(400, 'That is not a plain claim.'); }
  const mbytes = Buffer.from(msg.serialize());
  for (let i = 0; i < n; i++) if (!edVerify(b58dec(keysList[i]), mbytes, tx.signatures[i])) throw L.err(400, 'The wallet did not sign the claim.');
  const sig = b58enc(tx.signatures[0]);
  if (MOCK) { M.sigs.set(sig, { at: Date.now() }); M.bal.set(creator, (M.bal.get(creator) || 0) + (M.vault.has(creator) ? M.vault.get(creator) : 12_345_678)); M.vault.set(creator, 0); return sig; }
  await rpc(c => c.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'processed', maxRetries: 3 }));
  return sig;
}

// ---------- coin stats straight from the curves ----------
async function coinStats(mints) {
  if (!mints.length) return {};
  if (MOCK) return Object.fromEntries(mints.map(m => { const h = crypto.createHash('sha256').update(m).digest(); return [m, { mcapLamports: 27_000_000_000 + h.readUInt32BE(0) % 60_000_000_000, progress: (h[4] % 100) / 100, complete: h[5] % 9 === 0 }]; }));
  return L.cached('stats:' + mints.join(','), 25000, async () => {
    const pools = await readPools(mints), out = {};
    for (const [mint, x] of Object.entries(pools)) {
      try {
        const p = x.p, vA = +p.virtualA.toString(), vB = +p.virtualB.toString(), rA = +p.realA.toString(), rB = +p.realB.toString();
        const price = (vB + rB) / (vA - rA);                       // lamports per smallest token unit
        const done = Number(p.status) > 0, goal = +p.totalFundRaisingB.toString();
        out[mint] = { mcapLamports: Math.round(price * +p.supply.toString()), progress: done ? 1 : Math.max(0, Math.min(1, rB / goal)), complete: done, pool: x.pool, raisedLamports: rB, goalLamports: goal };
      } catch {}
    }
    return out;
  });
}
async function solUsd() {
  if (MOCK) return 182.4;
  return L.cached('solusd', 60000, async () => {
    const r = await L.getJson('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {}, 5000);
    const v = r.json && r.json.solana && r.json.solana.usd; if (!v) throw new Error('no price'); return v;
  }).catch(() => null);
}

const TERMS = { venue: 'raydium launchlab', raiseSol: RAISE_SOL, supply: SUPPLY, sold: 793_100_000, feePct: { creator: FEE_PPM.creator / 1e4, v01d: FEE_PPM.platform / 1e4, raydium: 0.25 }, lp: { burnedPct: LP_PPM.burn / 1e4, lockedPct: LP_PPM.platform / 1e4 }, minClaimSol: MIN_CLAIM / 1e9 };
module.exports = { rpc, w3, MOCK, SIM_PAYERS, PROGRAM, TERMS, b58enc, b58dec, isAddr, keys, treasury, configAddress, configExists, ensureConfig, balance, simulateLaunch, sendLaunch, broadcast, statusOf, claimable, buildClaim, buildWithdraw, finish, coinStats, solUsd, edVerify, buildWalletLaunch, sendWalletLaunch, buildWalletClaim, relayWalletClaim, poolOf };
