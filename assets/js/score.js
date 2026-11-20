// v01d · the score: everything you hear, written in code, no files. Creepy on purpose: the hum of the lights, a drone that
// beats against itself, a music box that goes out of tune as the room dies, a heart, the keys, a chime that is not quite
// right, the fall, then the void breathing slow dark chords.
// The intro's sounds follow the intro's own clock, so they land on the picture even when audio only starts after a tap.
export function createScore() {
  const VOL = .58;
  const S = { on: false, mode: 'idle', t0: 0, cues: [], ci: 0, timer: 0, nextChord: 0, nextPing: 0, chordI: 0, onState: () => {} };
  let C = null, out, dry, send, humG, drone, droneLP, NOISE;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function impulse(sec, decay) {
    const len = Math.floor(C.sampleRate * sec), b = C.createBuffer(2, len, C.sampleRate), pre = C.sampleRate * .012;
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < pre ? i / pre : 1); }
    return b;
  }
  function build() {
    C = new (window.AudioContext || window.webkitAudioContext)();
    C.onstatechange = () => S.onState();
    out = C.createGain(); out.gain.value = 0;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = .01; comp.release.value = .3;
    out.connect(comp); comp.connect(C.destination);
    dry = C.createGain(); dry.connect(out);
    const verb = C.createConvolver(); verb.buffer = impulse(4.2, 2.6); send = C.createGain(); send.gain.value = .9; send.connect(verb);
    const vg = C.createGain(); vg.gain.value = .5; verb.connect(vg); vg.connect(out);
    NOISE = C.createBuffer(1, C.sampleRate * 2, C.sampleRate); { const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    // the lights: a fluorescent buzz
    humG = C.createGain(); humG.gain.value = 0; humG.connect(dry);
    const o1 = C.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 120; const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 6; o1.connect(bp); bp.connect(humG); o1.start();
    const o2 = C.createOscillator(); o2.frequency.value = 60; const g2 = C.createGain(); g2.gain.value = .3; o2.connect(g2); g2.connect(humG); o2.start();
    // the drone: D, and an E-flat a hair above it, beating; a growl under them; dark air
    drone = C.createGain(); drone.gain.value = 0; drone.connect(dry); const ds = C.createGain(); ds.gain.value = .35; drone.connect(ds); ds.connect(send);
    droneLP = C.createBiquadFilter(); droneLP.type = 'lowpass'; droneLP.frequency.value = 220; droneLP.Q.value = .8; droneLP.connect(drone);
    [[36.71, 'sawtooth', .15], [73.42, 'sine', .22], [77.78, 'sine', .13], [110, 'triangle', .05], [155.56, 'sine', .03]].forEach(([f, ty, v]) => {
      const o = C.createOscillator(); o.type = ty; o.frequency.value = f; const g = C.createGain(); g.gain.value = v; o.connect(g); g.connect(droneLP); o.start(); });
    const l1 = C.createOscillator(); l1.frequency.value = .045; const l1g = C.createGain(); l1g.gain.value = 90; l1.connect(l1g); l1g.connect(droneLP.frequency); l1.start();
    const air = C.createBufferSource(); air.buffer = NOISE; air.loop = true; const alp = C.createBiquadFilter(); alp.type = 'lowpass'; alp.frequency.value = 380;
    const ag = C.createGain(); ag.gain.value = .03; air.connect(alp); alp.connect(ag); ag.connect(drone); air.start();
  }

  // ---- voices
  // a music box tine: the note, its octave, a bell overtone, a little wow as if the spring were tired
  function box(m, t, v = .08, cents = 0, len = 2.6) {
    const f = mtof(m) * Math.pow(2, cents / 1200);
    const g = C.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + len);
    g.connect(dry); const s = C.createGain(); s.gain.value = .9; g.connect(s); s.connect(send);
    const wow = C.createOscillator(); wow.frequency.value = .6 + Math.random() * .4; const wg = C.createGain(); wg.gain.value = f * .006; wow.connect(wg);
    for (const [k, a] of [[1, 1], [2, .32], [4.17, .1]]) { const o = C.createOscillator(); o.frequency.value = f * k; wg.connect(o.frequency); const og = C.createGain(); og.gain.value = a; o.connect(og); og.connect(g); o.start(t); o.stop(t + len + .1); }
    wow.start(t); wow.stop(t + len + .1);
  }
  function heart(t, v = .4) {
    for (const [dt, k] of [[0, 1], [.27, .62]]) {
      const o = C.createOscillator(), g = C.createGain(); o.frequency.setValueAtTime(62, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + .16);
      g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime(v * k, t + dt + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dt + .34);
      o.connect(g); g.connect(dry); o.start(t + dt); o.stop(t + dt + .4);
    }
  }
  function key(t, v = .07) {
    const n = C.createBufferSource(); n.buffer = NOISE; const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2300 + Math.random() * 900; bp.Q.value = 1.4;
    const g = C.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + .035);
    n.connect(bp); bp.connect(g); g.connect(dry); n.start(t, Math.random() * 1.5, .05);
    const o = C.createOscillator(), og = C.createGain(); o.frequency.value = 150 + Math.random() * 40; og.gain.setValueAtTime(v * .5, t); og.gain.exponentialRampToValueAtTime(.0001, t + .05);
    o.connect(og); og.connect(dry); o.start(t); o.stop(t + .06);
  }
  function tone(f, t, dur, v = .04, type = 'sine', wet = .6) {
    const o = C.createOscillator(), g = C.createGain(); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .01); g.gain.setValueAtTime(v, t + dur * .5); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dry); const s = C.createGain(); s.gain.value = wet; g.connect(s); s.connect(send); o.start(t); o.stop(t + dur + .05);
  }
  function riser(t, dur) {
    const n = C.createBufferSource(); n.buffer = NOISE; n.loop = true; const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(180, t); bp.frequency.exponentialRampToValueAtTime(5200, t + dur);
    const g = C.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.15, t + dur * .92); g.gain.linearRampToValueAtTime(0, t + dur + .02);
    n.connect(bp); bp.connect(g); g.connect(dry); const s = C.createGain(); s.gain.value = .6; g.connect(s); s.connect(send); n.start(t); n.stop(t + dur + .1);
    const o = C.createOscillator(), og = C.createGain(), lp = C.createBiquadFilter(); o.type = 'sawtooth'; lp.type = 'lowpass';
    o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(880, t + dur);
    lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(3000, t + dur);
    og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(.045, t + dur * .92); og.gain.linearRampToValueAtTime(0, t + dur + .02);
    o.connect(lp); lp.connect(og); og.connect(dry); o.start(t); o.stop(t + dur + .1);
  }
  function boom(t) {
    const o = C.createOscillator(), g = C.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(26, t + 1.4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.7, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + 3.2);
    o.connect(g); g.connect(dry); o.start(t); o.stop(t + 3.3);
    const n = C.createBufferSource(); n.buffer = NOISE; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(90, t + 1.6);
    const ng = C.createGain(); ng.gain.setValueAtTime(.32, t); ng.gain.exponentialRampToValueAtTime(.0001, t + 2.2);
    n.connect(lp); lp.connect(ng); ng.connect(dry); const s = C.createGain(); s.gain.value = 1; ng.connect(s); s.connect(send); n.start(t); n.stop(t + 2.3);
  }
  function pad(ms, t, dur, v = .03) {
    const g = C.createGain(), lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 680;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * .4); g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g); g.connect(dry); const s = C.createGain(); s.gain.value = .8; g.connect(s); s.connect(send);
    for (const m of ms) for (const c of [-7, 7]) { const o = C.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m) * Math.pow(2, c / 1200); o.connect(lp); o.start(t); o.stop(t + dur + .1); }
  }

  // ---- the intro, cue by cue (seconds on the intro's clock)
  function introCues() {
    const L = [], add = (t, f) => L.push({ t, f });
    // power: the hum stutters on with the lights
    for (const [t, v] of [[.25, 0], [.32, .045], [.38, 0], [.5, .055], [.56, .01], [.8, .06], [.86, .03], [1.0, .06]]) add(t, at => humG.gain.setValueAtTime(v, at));
    add(.3, at => drone.gain.setTargetAtTime(.12, at, 1.5));
    // a lullaby while you walk, more and more out of tune as the panels die
    const MEL = [74, 77, 81, 80, 81, 77, 76, 74, 0, 72, 74, 77, 76, 73, 74, 0, 0, 69, 70, 69, 74, 0];
    for (let t = 1.3, i = 0; t < 12.8; i++) {
      const m = MEL[i % MEL.length], d = Math.min(1, Math.max(0, (t - 6.8) / 2.4)), late = t > 9.5;
      if (m) { const tt = t; add(tt, at => box(m, at, .08 * (1 - .3 * d), -d * 45 - (late ? 25 : 0), 2.6 + d)); }
      t += .55 + d * .3 + (late ? .2 : 0);
    }
    // the room dies around you: the hum goes, the drone comes up
    add(6.8, at => { humG.gain.setTargetAtTime(.012, at, 1); drone.gain.setTargetAtTime(.34, at, 1.6); droneLP.frequency.setTargetAtTime(320, at, 2); });
    // you sit: a heart you can hear
    [9.0, 10.1, 11.15, 12.15].forEach((tt, k) => add(tt, at => heart(at, .3 + k * .06)));
    // the computer: a beep, the keys, enter, the keys, enter, a chime that is not quite right, the drive reading
    add(9.58, at => tone(1320, at, .09, .025, 'square', .3));
    for (let k = 0; k < 4; k++) add(10 + (k + 1) * .125, at => key(at));
    add(10.62, at => key(at, .09));
    for (let k = 0; k < 8; k++) add(10.8 + (k + 1) * (.65 / 8), at => key(at));
    add(11.56, at => key(at, .1));
    add(11.65, at => { tone(1174.7, at, 1.4, .032); tone(1244.5, at + .14, 1.6, .022); });
    add(12.0, at => { for (let i = 0; i < 12; i++) key(at + i * .065 + Math.random() * .02, .028); });
    // through the glass: everything rises, a breath of nothing, then the fall into the world
    add(12.9, at => { riser(at, .78); drone.gain.setTargetAtTime(.55, at, .3); droneLP.frequency.setTargetAtTime(900, at, .3); });
    add(13.66, at => { drone.gain.setTargetAtTime(0, at, .015); humG.gain.setTargetAtTime(0, at, .01); });
    add(13.72, at => { boom(at); drone.gain.setTargetAtTime(.2, at + .4, 2.5); droneLP.frequency.setTargetAtTime(240, at, 1.5); S.mode = 'world'; S.nextChord = at + 1.4; S.nextPing = at + 5; });
    return L.sort((a, b) => a.t - b.t);
  }

  // ---- the world: slow dark chords, a far music box now and then
  const CH = [[50, 57, 64, 65], [46, 53, 57, 62, 64], [43, 50, 55, 58, 64], [45, 52, 55, 58, 61]];
  const PINGS = [74, 77, 81, 86, 89, 80];
  function tick() {
    if (!C || C.state !== 'running' || !S.on) return;
    const ct = C.currentTime;
    if (S.mode === 'intro') {
      const t = (performance.now() - S.t0) / 1000;
      while (S.ci < S.cues.length && S.cues[S.ci].t <= t + .25) {
        const q = S.cues[S.ci++]; if (q.t < t - .3) continue;      // long gone (sound only started now): skip it
        q.f(ct + Math.max(0, q.t - t));
      }
      if (S.ci >= S.cues.length && S.mode === 'intro') toWorld();
    }
    if (S.mode === 'world') {
      if (S.nextChord < ct + .5) { const at = Math.max(ct + .05, S.nextChord); pad(CH[S.chordI++ % CH.length], at, 10); S.nextChord = at + 8.5; }
      if (S.nextPing < ct + .5) { const at = Math.max(ct + .05, S.nextPing); box(PINGS[(Math.random() * PINGS.length) | 0], at, .03, -20, 4); S.nextPing = at + 6 + Math.random() * 8; }
    }
  }
  function toWorld() {
    S.mode = 'world';
    if (!C) return; const ct = C.currentTime;
    humG.gain.setTargetAtTime(0, ct, .4); drone.gain.setTargetAtTime(.2, ct, 1.5); droneLP.frequency.setTargetAtTime(240, ct, 1.5);
    S.nextChord = Math.max(S.nextChord, ct + .6); S.nextPing = Math.max(S.nextPing, ct + 4);
  }

  return {
    // on: make (or wake) the sound. without a tap first, browsers keep it waiting; any tap or key wakes it
    start() {
      S.on = true;
      if (!C) { try { build(); } catch { return; } }
      C.resume().catch(() => {});
      out.gain.cancelScheduledValues(C.currentTime); out.gain.setTargetAtTime(VOL, C.currentTime, .5);
      if (!S.timer) S.timer = setInterval(tick, 50);
      if (S.mode === 'idle') toWorld();
    },
    wake() { if (S.on && C && C.state !== 'running') C.resume().catch(() => {}); },
    mute() { S.on = false; if (C) { out.gain.cancelScheduledValues(C.currentTime); out.gain.setTargetAtTime(0, C.currentTime, .25); } },
    intro(t0) { S.mode = 'intro'; S.t0 = t0; S.cues = introCues(); S.ci = 0; },
    world() { if (S.mode !== 'world') toWorld(); },
    state() { return !S.on || !C ? 'off' : C.state === 'running' ? 'on' : 'waiting'; },
    onState(f) { S.onState = f; },
    // a coin is born somewhere: one far tine. a building opens: a low breath of air.
    ping() { if (S.on && C && C.state === 'running' && S.mode === 'world') box(PINGS[(Math.random() * 3) | 0] + 12, C.currentTime + .02, .02, -15, 3); },
    open() {
      if (!S.on || !C || C.state !== 'running') return; const t = C.currentTime + .01;
      const o = C.createOscillator(), g = C.createGain(); o.frequency.setValueAtTime(74, t); o.frequency.exponentialRampToValueAtTime(41, t + .35);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.14, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .7); o.connect(g); g.connect(dry); o.start(t); o.stop(t + .75);
    },
  };
}
