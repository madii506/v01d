// v01d · the score: everything you hear, written in code, no files. Creepy on purpose: the hum of the lights, a drone that
// beats against itself, a music box that goes out of tune as the room dies, a heart, the keys, a chime that is not quite
// right, the fall, then the void breathing slow dark chords.
// The intro's sounds follow the intro's own clock, so they land on the picture even when audio only starts after a tap.
export function createScore() {
  const VOL = .58;
  const S = { on: false, mode: 'idle', t0: 0, cues: [], ci: 0, timer: 0, nextChord: 0, nextPing: 0, chordI: 0, onState: () => {} };
  let C = null, out, dry, send, humG, drone, droneLP, NOISE, staticG;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function impulse(sec, decay) {
    const len = Math.floor(C.sampleRate * sec), b = C.createBuffer(2, len, C.sampleRate), pre = C.sampleRate * .012;
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < pre ? i / pre : 1); }
    return b;
  }
  function build(ctx) {
    C = ctx || new (window.AudioContext || window.webkitAudioContext)();
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
    // the snow on the screen: a thin hiss that grows as you come closer
    staticG = C.createGain(); staticG.gain.value = 0; staticG.connect(dry);
    const sn = C.createBufferSource(); sn.buffer = NOISE; sn.loop = true; const sbp = C.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = 5200; sbp.Q.value = .6;
    sn.connect(sbp); sbp.connect(staticG); sn.start();
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
  // a burst of filtered noise: a starter clicking, a camera feed cutting in, a relay
  function burst(t, dur, f, q = 1.2, v = .1, wet = .2) {
    const n = C.createBufferSource(); n.buffer = NOISE; const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = C.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    n.connect(bp); bp.connect(g); g.connect(dry); if (wet) { const s2 = C.createGain(); s2.gain.value = wet; g.connect(s2); s2.connect(send); }
    n.start(t, Math.random() * 1.5, dur + .05);
  }
  // a fluorescent tube striking: the starter ticks, the tube pings on, a breath of ballast buzz
  function strike(t, v) {
    burst(t, .014, 3600, 2, v * .9); burst(t + .05 + Math.random() * .03, .012, 3100, 2, v * .6);
    const o = C.createOscillator(), g = C.createGain(); o.type = 'sawtooth'; o.frequency.value = 120;
    const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 500; bp.Q.value = 5;
    g.gain.setValueAtTime(0, t + .1); g.gain.linearRampToValueAtTime(v * .5, t + .12); g.gain.exponentialRampToValueAtTime(.0001, t + .5);
    o.connect(bp); bp.connect(g); g.connect(dry); o.start(t + .1); o.stop(t + .55);
    tone(2900 + Math.random() * 600, t + .1, .18, v * .12, 'sine', .5);
  }
  // a tube dying: a pop, a low knock, two stutters
  function die(t, v) {
    burst(t, .03, 2400, 1.4, v); const o = C.createOscillator(), g = C.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(48, t + .12);
    g.gain.setValueAtTime(v * 1.6, t); g.gain.exponentialRampToValueAtTime(.0001, t + .22); o.connect(g); g.connect(dry); o.start(t); o.stop(t + .25);
    burst(t + .09, .01, 3200, 2, v * .4); burst(t + .17, .01, 3000, 2, v * .25);
  }
  // a low thud with a sweep (the breaker, the screen dying to a dot, the tube coming on)
  function thud(t, f0, f1, dur, v) {
    const o = C.createOscillator(), g = C.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .05);
    o.connect(g); g.connect(dry); o.start(t); o.stop(t + dur + .1);
  }
  // the degauss: a coil's buzz that swells and dies, wobbling
  function degauss(t) {
    const o = C.createOscillator(), g = C.createGain(), lp = C.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(52, t); o.frequency.linearRampToValueAtTime(61, t + .7);
    const w = C.createOscillator(), wg = C.createGain(); w.frequency.value = 9; wg.gain.value = 4; w.connect(wg); wg.connect(o.frequency);
    lp.type = 'lowpass'; lp.frequency.value = 700; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .05); g.gain.exponentialRampToValueAtTime(.0001, t + .85);
    o.connect(lp); lp.connect(g); g.connect(dry); o.start(t); o.stop(t + .9); w.start(t); w.stop(t + .9);
    tone(15600, t, 2.2, .004, 'sine', 0);                         // the tube's whine (if your ears still hear it)
  }
  // a rush of air: down a tunnel of light
  function whoosh(t, dur, v = .16) {
    const n = C.createBufferSource(); n.buffer = NOISE; n.loop = true; const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(350, t); bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = C.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * .7); g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(bp); bp.connect(g); g.connect(dry); const s2 = C.createGain(); s2.gain.value = .5; g.connect(s2); s2.connect(send); n.start(t); n.stop(t + dur + .05);
  }
  function pad(ms, t, dur, v = .03) {
    const g = C.createGain(), lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 680;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * .4); g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g); g.connect(dry); const s = C.createGain(); s.gain.value = .8; g.connect(s); s.connect(send);
    for (const m of ms) for (const c of [-7, 7]) { const o = C.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m) * Math.pow(2, c / 1200); o.connect(lp); o.start(t); o.stop(t + dur + .1); }
  }

  // ---- the intro, cue by cue (seconds on the intro's clock; the picture's own marks are in v01d3d.js)
  function introCues() {
    const L = [], add = (t, f) => L.push({ t, f });
    // the dark: a breaker throws. the lights strike on in a wave, near ones loud, far ones a long way off
    add(.42, at => { thud(at, 90, 40, .25, .32); burst(at, .03, 1800, 1, .12); });
    [[.52, .2], [.6, .17], [.78, .16], [.86, .13], [.98, .12], [1.08, .1], [1.2, .09], [1.33, .08], [1.42, .07], [1.6, .06], [1.74, .05], [1.9, .045], [2.1, .035], [2.3, .03], [2.55, .022], [2.8, .016]]
      .forEach(([t, v]) => add(t, at => strike(at, v * 1.5)));
    for (const [t, v] of [[.6, .02], [.75, .0], [.82, .03], [1.0, .04], [1.1, .02], [1.3, .05], [1.6, .055], [2.2, .06]]) add(t, at => humG.gain.setValueAtTime(v, at));
    add(.3, at => drone.gain.setTargetAtTime(.1, at, 1.5));
    // the snow on the screen far ahead: you hear it more the closer you get
    add(1.2, at => { staticG.gain.setValueAtTime(.002, at); staticG.gain.linearRampToValueAtTime(.022, at + 7.2); });
    // a lullaby while you walk, more and more out of tune as the panels die
    const MEL = [74, 77, 81, 80, 81, 77, 76, 74, 0, 72, 74, 77, 76, 73, 74, 0, 0, 69, 70, 69, 74, 0];
    for (let t = 1.3, i = 0; t < 12.8; i++) {
      const m = MEL[i % MEL.length], d = Math.min(1, Math.max(0, (t - 6.45) / 2.4)), late = t > 9.5;
      if (m) { const tt = t; add(tt, at => box(m, at, .08 * (1 - .3 * d), -d * 45 - (late ? 25 : 0), 2.6 + d)); }
      t += .55 + d * .3 + (late ? .2 : 0);
    }
    // cut to the watchers' feeds: the switch, a servo turning, the switch back
    for (const [a, b] of [[3.5, 4.02], [6.3, 6.8], [8.6, 9.08]]) {
      add(a, at => { burst(at, .06, 2600, .8, .1, .05); tone(880, at + .05, .3, .008, 'triangle', 0); });
      add(b, at => burst(at, .04, 2200, .8, .07, .05));
    }
    // the room dies around you: far tubes pop out, then nearer ones, faster, until only the one over the desk is left
    add(6.45, at => { humG.gain.setTargetAtTime(.014, at, 1.2); drone.gain.setTargetAtTime(.34, at, 1.6); droneLP.frequency.setTargetAtTime(320, at, 2); });
    [6.5, 6.86, 7.15, 7.42, 7.64, 7.85, 8.02, 8.18, 8.33, 8.46, 8.58, 8.7, 8.8].forEach((t, k) => add(t, at => die(at, .05 + k * .006)));
    // you sit: the chair turns, the gas lift sighs; a heart you can hear
    add(8.75, at => { const n = C.createBufferSource(); n.buffer = NOISE; const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9; bp.frequency.setValueAtTime(900, at); bp.frequency.linearRampToValueAtTime(1500, at + .3);
      const g = C.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(.05, at + .1); g.gain.linearRampToValueAtTime(0, at + .32); n.connect(bp); bp.connect(g); g.connect(dry); n.start(at, 0, .4); });
    add(9.15, at => burst(at, .35, 3400, .5, .025, .1));
    [9.0, 10.1, 11.15, 12.15].forEach((tt, k) => add(tt, at => heart(at, .3 + k * .06)));
    // the screen: the snow collapses to a line and a dot, dark, then it comes on with a thunk and the coil's buzz
    add(9.42, at => { staticG.gain.setTargetAtTime(0, at + .1, .02); thud(at + .08, 220, 60, .12, .14); });
    add(9.62, at => { thud(at, 95, 52, .3, .3); degauss(at + .04); });
    add(9.98, at => tone(1320, at, .09, .025, 'square', .3));
    for (let k = 0; k < 4; k++) add(10 + (k + 1) * .125, at => key(at));
    add(10.62, at => key(at, .09));
    for (let k = 0; k < 8; k++) add(10.8 + (k + 1) * (.65 / 8), at => key(at));
    add(11.56, at => key(at, .1));
    add(11.65, at => { tone(1174.7, at, 1.4, .032); tone(1244.5, at + .14, 1.6, .022); });
    // in: the cameras stop watching, one after another out from the desk, each with the tick of a relay
    add(11.7, at => { for (let i = 0; i < 10; i++) burst(at + i * .085 + i * i * .006, .012, 2700 - i * 110, 2, .055 * (1 - i / 11), .35); thud(at, 150, 62, .4, .06); });
    add(12.0, at => { for (let i = 0; i < 12; i++) key(at + i * .065 + Math.random() * .02, .028); });
    // into the glass: everything rises; right up close the phosphor sings; then the rush down the tunnel, a breath of nothing
    add(12.9, at => { riser(at, .95); drone.gain.setTargetAtTime(.55, at, .3); droneLP.frequency.setTargetAtTime(900, at, .3); });
    add(13.2, at => { tone(2349, at, .5, .01, 'sine', .8); tone(3520, at + .03, .45, .006, 'sine', .8); });
    add(13.34, at => { whoosh(at, .56); thud(at, 70, 28, .5, .22); });
    add(13.86, at => { drone.gain.setTargetAtTime(0, at, .015); humG.gain.setTargetAtTime(0, at, .01); });
    // the fall into the world, and the world putting itself together under you: islands landing, the beacon at the end
    add(13.92, at => { boom(at); drone.gain.setTargetAtTime(.2, at + .4, 2.5); droneLP.frequency.setTargetAtTime(240, at, 1.5); S.mode = 'world'; S.nextChord = at + 1.4; S.nextPing = at + 5; });
    [15.09, 15.28, 15.3, 15.49, 15.51, 15.71, 15.72, 15.92, 15.93].forEach((t, k) => add(t, at => { thud(at, 62 + k * 3, 38, .4, .12); burst(at, .02, 1400, 1, .03, .3); }));
    add(14.6, at => whoosh(at, 1.8, .035));
    add(16.25, at => { box(86, at, .05, -10, 4); box(93, at + .12, .03, -10, 4); });
    return L.sort((a, b) => a.t - b.t);
  }

  // ---- the world: slow dark chords, a far music box now and then
  const CH = [[50, 57, 64, 65], [46, 53, 57, 62, 64], [43, 50, 55, 58, 64], [45, 52, 55, 58, 61]];
  const PINGS = [74, 77, 81, 86, 89, 80];
  function tick() {
    if (!C || C.state !== 'running' || !S.on) return;
    const ct = C.currentTime;
    if (S.ci < S.cues.length) {                                     // the intro's cues run to their end (the last ones land in the world)
      const t = (performance.now() - S.t0) / 1000;
      while (S.ci < S.cues.length && S.cues[S.ci].t <= t + .25) {
        const q = S.cues[S.ci++]; if (q.t < t - .3) continue;      // long gone (sound only started now): skip it
        q.f(ct + Math.max(0, q.t - t));
      }
    }
    if (S.mode === 'intro' && S.ci >= S.cues.length) toWorld();
    if (S.mode === 'world') {
      if (S.nextChord < ct + .5) { const at = Math.max(ct + .05, S.nextChord); pad(CH[S.chordI++ % CH.length], at, 10); S.nextChord = at + 8.5; }
      if (S.nextPing < ct + .5) { const at = Math.max(ct + .05, S.nextPing); box(PINGS[(Math.random() * PINGS.length) | 0], at, .03, -20, 4); S.nextPing = at + 6 + Math.random() * 8; }
    }
  }
  function toWorld() {
    S.mode = 'world';
    if (!C) return; const ct = C.currentTime;
    humG.gain.setTargetAtTime(0, ct, .4); staticG.gain.setTargetAtTime(0, ct, .1); drone.gain.setTargetAtTime(.2, ct, 1.5); droneLP.frequency.setTargetAtTime(240, ct, 1.5);
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
    // for films: the intro's whole sound (and the world's first chords after it), rendered offline so every cue is exactly
    // on time whatever the frame rate. resolves to an AudioBuffer. never used by the page itself.
    async render(sec = 22, sr = 48000) {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      build(new OAC(2, Math.ceil(sr * sec), sr)); out.gain.value = VOL; S.on = true;
      for (const q of introCues()) q.f(q.t);
      for (let at = 13.92 + 1.4, i = 0; at < sec; at += 8.5, i++) pad(CH[i % CH.length], at, 10);
      for (let at = 13.92 + 5; at < sec; at += 6 + Math.random() * 8) box(PINGS[(Math.random() * PINGS.length) | 0], at, .03, -20, 4);
      const buf = await C.startRendering(); C = null; S.on = false; return buf;
    },
    mute() { S.on = false; if (C) { out.gain.cancelScheduledValues(C.currentTime); out.gain.setTargetAtTime(0, C.currentTime, .25); } },
    intro(t0) { S.mode = 'intro'; S.t0 = t0; S.cues = introCues(); S.ci = 0; },
    world() { S.cues = []; S.ci = 0; if (S.mode !== 'world') toWorld(); },        // skipped or over: whatever the intro had left is dropped
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
