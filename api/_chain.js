// v01d chain side: derived keys, Meteora dynamic-bonding-curve launches, gasless creator-fee claims, withdrawals
// and coin stats. The official Meteora DBC SDK builds every Meteora instruction; web3.js compiles, simulates and sends.
//
// One curve for every coin (a DBC "config", created once by the treasury and then shared): SOL-quoted, 1B supply,
// born at ~30 SOL market cap, graduating at ~420 SOL into a Meteora DAMM v2 pool whose liquidity is locked forever
// (80% of the LP to the coin's creator, 20% to v01d). Trading fee on the curve: 1%. Of what Meteora leaves, 80% is the
// creator's and 20% goes to the treasury that pays for free launches.
const crypto = require('crypto');
const L = require('./_lib');
const MOCK = !!process.env.HALO_MOCK;          // local dev only: no network, fake chain answers
let W3, DB, CL;
const w3 = () => W3 || (W3 = require('@solana/web3.js'));
const dbc = () => DB || (DB = require('@meteora-ag/dynamic-bonding-curve-sdk'));

const RPCS = [process.env.RPC_URL, 'https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'].filter(Boolean);
const SIM_PAYER = process.env.HALO_SIM_PAYER || process.env.HALO_OWNER || '89icvDABaRMoSg5x3kSZm3oDaUMHU5ELp8YUfRiDKAGj'; // a large public wallet, only for dry runs
const BASE_FEE = 5000;
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SUPPLY = 1_000_000_000, BASE_DEC = 6;
const CURVE_VERSION = process.env.V01D_CURVE || '1';   // a new version makes a new shared config (only if the curve ever changes)
const PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';

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
const CLS = new Map();
const clientFor = c => { let cl = CLS.get(c); if (!cl) { cl = new (dbc().DynamicBondingCurveClient)(c, 'confirmed'); CLS.set(c, cl); } return cl; };
const client = () => CL || (CL = clientFor(connections()[0]));
// Meteora SDK builders read the chain too (the quote mint, the epoch, a config): on a network failure try the next RPC.
const NETERR = /fetch|network|timed? ?out|abort|429|50[234]|ECONN|socket|rate.?limit|too many|failed to get|ENOTFOUND|EAI_AGAIN/i;
async function sdk(fn) {
  let last;
  for (const c of connections()) { try { return await fn(clientFor(c)); } catch (e) { last = e; if (!NETERR.test(String(e && e.message || e))) throw e; } }
  throw L.err(502, 'Solana RPC is busy right now. Try again in a moment.', { detail: String(last && last.message || last).slice(0, 160) });
}

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
    const o = { treasury: fake('halo:treasury'), config: fake('v01d:dbc:config:' + CURVE_VERSION) }; if (id) { o.launcher = o.treasury; o.mint = fake('halo:mint:' + id); } return o;
  }
  const { Keypair } = w3();
  const o = { treasury: Keypair.fromSeed(seed('halo:treasury')), config: Keypair.fromSeed(seed('v01d:dbc:config:' + CURVE_VERSION)) };
  if (id) { o.launcher = o.treasury; o.mint = Keypair.fromSeed(seed('halo:mint:' + id)); }
  return o;
}
async function treasury() { return (await keys()).treasury.publicKey.toBase58(); }
async function configAddress() { return (await keys()).config.publicKey.toBase58(); }

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

// ---------- the curve ----------
let CURVE = null;
function curve() {
  if (CURVE) return CURVE;
  const D = dbc();
  return (CURVE = D.buildCurveWithMarketCap({
    token: { tokenType: D.TokenType.SPLToken, tokenBaseDecimal: BASE_DEC, tokenQuoteDecimal: 9, tokenAuthorityOption: D.TokenAuthorityOption.Immutable, totalTokenSupply: SUPPLY, leftover: 0 },
    fee: { baseFeeParams: { baseFeeMode: D.BaseFeeMode.FeeSchedulerLinear, feeSchedulerParam: { startingFeeBps: 100, endingFeeBps: 100, numberOfPeriod: 0, totalDuration: 0 } }, dynamicFeeEnabled: false, collectFeeMode: D.CollectFeeMode.QuoteToken, creatorTradingFeePercentage: 80, poolCreationFee: 0, enableFirstSwapWithMinFee: true },
    migration: { migrationOption: D.MigrationOption.MET_DAMM_V2, migrationFeeOption: D.MigrationFeeOption.FixedBps100, migrationFee: { feePercentage: 0, creatorFeePercentage: 0 } },
    liquidityDistribution: { partnerLiquidityPercentage: 0, partnerPermanentLockedLiquidityPercentage: 20, creatorLiquidityPercentage: 0, creatorPermanentLockedLiquidityPercentage: 80 },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: D.ActivationType.Timestamp, initialMarketCap: 30, migrationMarketCap: 420,
  }));
}
const noCb = tx => tx.instructions.filter(ix => ix.programId.toBase58() !== 'ComputeBudget111111111111111111111111111111');
function compile(payer, ixs, blockhash) {
  const { TransactionMessage, VersionedTransaction } = w3();
  return new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());
}
function poolOf(mint, cfg) { const { PublicKey } = w3(); return dbc().deriveDbcPoolAddress(new PublicKey(SOL_MINT), new PublicKey(mint), new PublicKey(cfg)).toBase58(); }

// the shared config: made once by the treasury, then every launch points at it
let cfgReady = false;
async function configExists() {
  if (MOCK || cfgReady) return true;
  const { PublicKey } = w3(); const k = await keys();
  const inf = await rpc(c => c.getAccountInfo(k.config.publicKey, 'confirmed'));
  cfgReady = !!inf && inf.owner.equals(new PublicKey(PROGRAM));
  return cfgReady;
}
async function configIxs(payer) {
  const { PublicKey } = w3(); const k = await keys();
  const tre = k.treasury.publicKey;
  const tx = await sdk(cl => cl.partner.createConfig({ ...curve(), config: k.config.publicKey, feeClaimer: tre, leftoverReceiver: tre, quoteMint: new PublicKey(SOL_MINT), payer }));
  return noCb(tx);
}
async function ensureConfig() {
  if (await configExists()) return true;
  const { ComputeBudgetProgram } = w3(); const k = await keys();
  const ixs = [ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: await priorityFee() }), ...(await configIxs(k.treasury.publicKey))];
  const { blockhash } = await rpc(c => c.getLatestBlockhash('confirmed'));
  const tx = compile(k.treasury.publicKey, ixs, blockhash); tx.sign([k.treasury, k.config]);
  const sim = await rpc(c => c.simulateTransaction(tx, { sigVerify: false, commitment: 'processed' }));
  if (sim.value.err) throw L.err(503, 'The launch curve could not be set up yet.', { detail: JSON.stringify(sim.value.err), logs: (sim.value.logs || []).slice(-6) });
  const raw = Buffer.from(tx.serialize()), sig = b58enc(tx.signatures[0]);
  await rpc(c => c.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 3 }));
  for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 1500)); const st = await statusOf(sig).catch(() => null); if (st) { if (st.err) throw L.err(503, 'The launch curve could not be set up yet.', { detail: st.err }); break; } }
  cfgReady = false; return configExists();
}

// ---------- launch ----------
async function poolIxs(rec, { payer, poolCreator, mint, buyLamports = 0 }) {
  const BN = require('bn.js'); const k = await keys();
  const createPoolParam = { name: rec.name, symbol: rec.symbol, uri: rec.uri, payer, poolCreator, config: k.config.publicKey, baseMint: mint };
  const tx = buyLamports > 0
    ? await sdk(cl => cl.pool.createPoolWithFirstBuy({ createPoolParam, firstBuyParam: { buyer: poolCreator, buyAmount: new BN(String(buyLamports)), minimumAmountOut: new BN(1), referralTokenAccount: null } }))
    : await sdk(cl => cl.pool.createPool(createPoolParam));
  return noCb(tx);
}
// Dry run: what the treasury pays for one launch, read off its own balance after the simulated transaction.
async function simulateLaunch(rec, { dry = false } = {}) {
  if (MOCK) return { ok: true, need: 21_870_000, cu: 142_000, payer: dry ? SIM_PAYER : await treasury() };
  const { PublicKey, ComputeBudgetProgram } = w3();
  const k = await keys(rec.id);
  const payer = dry ? new PublicKey(SIM_PAYER) : k.treasury.publicKey;
  const withCfg = !(await configExists());
  if (withCfg && !dry) await ensureConfig();
  let body;
  if (withCfg && dry) {          // no curve on chain yet: simulate making it and the first coin together
    const tre = k.treasury.publicKey;
    // one Transaction holding both instructions (config, then pool): ~1,190 bytes, inside the 1,232 limit
    const built = await sdk(cl => cl.partner.createConfigAndPool({ ...curve(), config: k.config.publicKey, feeClaimer: tre, leftoverReceiver: tre, quoteMint: new PublicKey(SOL_MINT), payer,
      preCreatePoolParam: { name: rec.name, symbol: rec.symbol, uri: rec.uri, poolCreator: new PublicKey(rec.creator), baseMint: k.mint.publicKey } }));
    body = noCb(built);
  } else body = await poolIxs(rec, { payer, poolCreator: new PublicKey(rec.creator), mint: k.mint.publicKey });
  const ixs = [ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }), ...body];
  const { blockhash } = await rpc(c => c.getLatestBlockhash('confirmed'));
  const tx = compile(payer, ixs, blockhash);
  const pre = await rpc(c => c.getBalance(payer, 'confirmed'));
  const sim = await rpc(c => c.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: 'processed', accounts: { encoding: 'base64', addresses: [payer.toBase58()] } }));
  const v = sim.value;
  if (v.err) return { ok: false, err: JSON.stringify(v.err), logs: (v.logs || []).slice(-8), payer: payer.toBase58(), withConfig: withCfg };
  const post = v.accounts && v.accounts[0] ? v.accounts[0].lamports : pre;
  return { ok: true, need: Math.max(0, pre - post), cu: v.unitsConsumed || 250000, bytes: tx.serialize().length, payer: payer.toBase58(), withConfig: withCfg && dry, pool: poolOf(k.mint.publicKey.toBase58(), k.config.publicKey.toBase58()) };
}
async function sendLaunch(rec) {
  const sim = await simulateLaunch(rec);
  if (!sim.ok) throw L.err(400, 'Meteora would reject this launch right now.', { detail: sim.err, logs: sim.logs });
  const price = await priorityFee(), cu = Math.min(800000, Math.ceil(sim.cu * 1.15) + 5000);
  const cost = sim.need + BASE_FEE * 2 + Math.ceil(cu * price / 1e6);
  if (MOCK) {
    const sig = mockSig(); M.sigs.set(sig, { at: Date.now() }); M.bal.set('*treasury', M.bal.get('*treasury') - cost);
    return { sig, raw: Buffer.from('mock').toString('base64'), cost };
  }
  const { PublicKey, ComputeBudgetProgram } = w3();
  const k = await keys(rec.id);
  const ixs = [ComputeBudgetProgram.setComputeUnitLimit({ units: cu }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }),
    ...(await poolIxs(rec, { payer: k.treasury.publicKey, poolCreator: new PublicKey(rec.creator), mint: k.mint.publicKey }))];
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

// ---------- pools: read straight from the chain ----------
async function readPools(mints) {
  if (!mints.length) return {};
  const { PublicKey } = w3(); const cfg = await configAddress();
  const cl = client(), coder = cl.state.program.coder.accounts;
  const out = {};
  for (let i = 0; i < mints.length; i += 90) {
    const part = mints.slice(i, i + 90), pools = part.map(m => poolOf(m, cfg));
    const infos = await rpc(c => c.getMultipleAccountsInfo(pools.map(p => new PublicKey(p)), 'confirmed'));
    infos.forEach((inf, j) => {
      if (!inf) return;
      try { const vp = coder.decode('virtualPool', inf.data); out[part[j]] = { pool: pools[j], vp: vp.poolState || vp }; } catch {}
    });
  }
  return out;
}
let CFGSTATE = null;
async function threshold() {
  if (CFGSTATE) return CFGSTATE;
  const st = await client().state.getPoolConfig(await configAddress()).catch(() => null);
  if (st) CFGSTATE = Number(st.migrationQuoteThreshold.toString());
  return CFGSTATE || Number(curve().migrationQuoteThreshold.toString());
}

// ---------- claims and withdrawals: we build the message, the browser signs, we co-sign only what we built ----------
// On Meteora, creator fees sit in each coin's pool. A creator key can have several coins here; we sum them.
async function claimable(creator, mints = []) {
  if (MOCK) return { vault: M.vault.has(creator) ? M.vault.get(creator) : 12_345_678, wallet: M.bal.get(creator) || 0, pools: [] };
  const { PublicKey } = w3(); const pk = new PublicKey(creator);
  const [pools, wallet] = await Promise.all([readPools(mints), rpc(c => c.getBalance(pk, 'confirmed'))]);
  const list = Object.entries(pools).filter(([, x]) => x.vp.creator && x.vp.creator.toBase58() === creator)
    .map(([mint, x]) => ({ mint, pool: x.pool, fee: Number((x.vp.creatorQuoteFee || 0).toString()), migrated: !!(x.vp.isMigrated && Number(x.vp.isMigrated)) }));
  return { vault: list.reduce((s, x) => s + x.fee, 0), wallet, pools: list };
}
async function claimIxs(creator, payer, list) {
  const BN = require('bn.js'); const { PublicKey } = w3();
  const MAX = new BN('18446744073709551615'), out = [];
  for (const p of list.filter(x => x.fee > 0).sort((a, b) => b.fee - a.fee).slice(0, 3)) {
    const tx = await sdk(cl => cl.creator.claimCreatorTradingFee({ creator: new PublicKey(creator), payer, pool: new PublicKey(p.pool), maxBaseAmount: MAX, maxQuoteAmount: MAX }));
    out.push(...noCb(tx));
  }
  return out;
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
async function buildClaim(creator, mints = []) {
  if (MOCK) { const bytes = crypto.randomBytes(180); return { message: bytes.toString('base64'), token: await token('halo:claim', bytes), signer: creator }; }
  const { PublicKey, ComputeBudgetProgram } = w3(); const pk = new PublicKey(creator); const k = await keys();
  const c = await claimable(creator, mints);
  const ixs = await claimIxs(creator, k.treasury.publicKey, c.pools);
  if (!ixs.length) throw L.err(400, 'Nothing to claim yet.');
  const all = [ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: await priorityFee() }), ...ixs];
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
  let ixs, cu = 400000;
  if (MOCK) { const { SystemProgram } = w3(); ixs = [SystemProgram.transfer({ fromPubkey: user, toPubkey: mint, lamports: 0 })]; }
  else {
    ixs = await poolIxs(rec, { payer: user, poolCreator: user, mint, buyLamports });
    const probe = compile(user, [ComputeBudgetProgram.setComputeUnitLimit({ units: 900000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }), ...ixs], blockhash);
    const sim = await rpc(c => c.simulateTransaction(probe, { sigVerify: false, replaceRecentBlockhash: true, commitment: 'processed' }));
    const v = sim.value;
    if (v.err) {
      const txt = JSON.stringify(v.err) + ' ' + (v.logs || []).join(' ');
      if (/AccountNotFound|insufficient lamports|InsufficientFunds|0x1\b/i.test(txt)) throw L.err(402, `Your wallet needs about ${(0.03 + buyLamports / 1e9).toFixed(3)} SOL for this launch.`);
      throw L.err(400, 'Meteora would reject this launch right now.', { detail: JSON.stringify(v.err), logs: (v.logs || []).slice(-6) });
    }
    cu = Math.min(1200000, Math.ceil((v.unitsConsumed || 300000) * 1.2) + 10000);
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
  if (!MOCK && !keysList.includes(PROGRAM)) throw L.err(400, 'That is not a Meteora launch.');
  const mbytes = Buffer.from(msg.serialize());
  for (let i = 0; i < n; i++) if (!edVerify(b58dec(keysList[i]), mbytes, tx.signatures[i])) throw L.err(400, i === 0 ? 'Your wallet did not sign the launch.' : 'The coin key did not sign the launch.');
  const sig = b58enc(tx.signatures[0]);
  if (MOCK) { M.sigs.set(sig, { at: Date.now() }); return { sig, raw: raw.toString('base64') }; }
  await rpc(c => c.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'processed', maxRetries: 3 }));
  return { sig, raw: raw.toString('base64') };
}
// A claim the creator's own wallet signs and pays for: nothing of ours in it.
async function buildWalletClaim(creator, mints = []) {
  const { PublicKey, ComputeBudgetProgram } = w3(); const pk = new PublicKey(creator);
  if (MOCK) {
    const blockhash = b58enc(crypto.randomBytes(32)), { SystemProgram } = w3();
    const tx = compile(pk, [ComputeBudgetProgram.setComputeUnitLimit({ units: 120000 }), SystemProgram.transfer({ fromPubkey: pk, toPubkey: pk, lamports: 0 })], blockhash);
    return { tx: Buffer.from(tx.serialize()).toString('base64') };
  }
  const c = await claimable(creator, mints);
  const ixs = await claimIxs(creator, pk, c.pools);
  if (!ixs.length) throw L.err(400, 'Nothing to claim yet.');
  const { blockhash } = await rpc(c2 => c2.getLatestBlockhash('confirmed'));
  const tx = compile(pk, [ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: await priorityFee() }), ...ixs], blockhash);
  const sim = await rpc(c2 => c2.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: 'processed' }));
  if (sim.value.err) throw L.err(400, 'This claim would fail right now.', { detail: JSON.stringify(sim.value.err), logs: (sim.value.logs || []).slice(-6) });
  return { tx: Buffer.from(tx.serialize()).toString('base64') };
}
// Relay a wallet-signed claim: only Meteora, token and compute-budget programs, the creator pays, every signature valid.
async function relayWalletClaim(creator, rawB64) {
  const { VersionedTransaction } = w3();
  const raw = Buffer.from(String(rawB64 || ''), 'base64');
  let tx; try { tx = VersionedTransaction.deserialize(raw); } catch { throw L.err(400, 'That transaction could not be read.'); }
  const msg = tx.message, keysList = msg.staticAccountKeys.map(k => k.toBase58()), n = msg.header.numRequiredSignatures;
  if (keysList[0] !== creator) throw L.err(400, 'The paying wallet is not the creator.');
  const ok = new Set([PROGRAM, 'ComputeBudget111111111111111111111111111111', '11111111111111111111111111111111', 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']);
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
    const pools = await readPools(mints), thr = await threshold(), D = dbc();
    const out = {};
    for (const [mint, x] of Object.entries(pools)) {
      try {
        const price = Number(D.getPriceFromSqrtPrice(x.vp.sqrtPrice, BASE_DEC, 9).toString());       // SOL per token
        const reserve = Number(x.vp.quoteReserve.toString()), migrated = !!(x.vp.isMigrated && Number(x.vp.isMigrated));
        out[mint] = { mcapLamports: Math.round(price * SUPPLY * 1e9), progress: migrated ? 1 : Math.max(0, Math.min(1, reserve / thr)), complete: migrated, pool: x.pool };
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

module.exports = { rpc, w3, MOCK, SIM_PAYER, PROGRAM, b58enc, b58dec, isAddr, keys, treasury, configAddress, configExists, ensureConfig, balance, simulateLaunch, sendLaunch, broadcast, statusOf, claimable, buildClaim, buildWithdraw, finish, coinStats, solUsd, edVerify, buildWalletLaunch, sendWalletLaunch, buildWalletClaim, relayWalletClaim, poolOf };
