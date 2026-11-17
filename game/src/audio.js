// Solmar Heat — all sound is synthesized with WebAudio. No audio files.
// Engine hum, sirens, gunshots, crashes, chimes and a light cruise-music loop.
import { W, clamp } from './world.js';

export function createAudio() {
  const A = {
    ctx: null, master: null, engineOsc: null, engineGain: null, engineFilter: null,
    sirenOsc: null, sirenGain: null, sirenOn: false, musicTimer: null, musicOn: false,
    skidSrc: null, skidGain: null,
  };

  A.init = () => {
    if (A.ctx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.5;
      A.master.connect(A.ctx.destination);
      // engine: sawtooth through a lowpass
      A.engineOsc = A.ctx.createOscillator();
      A.engineOsc.type = 'sawtooth';
      A.engineOsc.frequency.value = 55;
      A.engineFilter = A.ctx.createBiquadFilter();
      A.engineFilter.type = 'lowpass';
      A.engineFilter.frequency.value = 420;
      A.engineGain = A.ctx.createGain();
      A.engineGain.gain.value = 0;
      A.engineOsc.connect(A.engineFilter);
      A.engineFilter.connect(A.engineGain);
      A.engineGain.connect(A.master);
      A.engineOsc.start();
      // police siren: two-tone triangle
      A.sirenOsc = A.ctx.createOscillator();
      A.sirenOsc.type = 'triangle';
      A.sirenOsc.frequency.value = 700;
      A.sirenGain = A.ctx.createGain();
      A.sirenGain.gain.value = 0;
      A.sirenOsc.connect(A.sirenGain);
      A.sirenGain.connect(A.master);
      A.sirenOsc.start();
      // skid: looping filtered noise
      const buf = A.noiseBuffer(1);
      A.skidSrc = A.ctx.createBufferSource();
      A.skidSrc.buffer = buf;
      A.skidSrc.loop = true;
      const bf = A.ctx.createBiquadFilter();
      bf.type = 'bandpass';
      bf.frequency.value = 900;
      A.skidGain = A.ctx.createGain();
      A.skidGain.gain.value = 0;
      A.skidSrc.connect(bf);
      bf.connect(A.skidGain);
      A.skidGain.connect(A.master);
      A.skidSrc.start();
    } catch (e) { A.ctx = null; }
  };

  A.resume = () => { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); };

  A.noiseBuffer = (seconds) => {
    const len = Math.floor(A.ctx.sampleRate * seconds);
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  };

  A.tone = (freq, dur, type, vol, slideTo, delay = 0) => {
    if (!A.ctx) return;
    const t0 = A.ctx.currentTime + delay;
    const o = A.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(A.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  };

  A.noise = (dur, vol, filterFreq, type = 'lowpass', delay = 0) => {
    if (!A.ctx) return;
    const t0 = A.ctx.currentTime + delay;
    const src = A.ctx.createBufferSource();
    src.buffer = A.noiseBuffer(dur + 0.1);
    const f = A.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  };

  A.setEngine = (speedNorm, on) => {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    A.engineGain.gain.setTargetAtTime(on ? 0.05 + speedNorm * 0.09 : 0, t, 0.08);
    A.engineOsc.frequency.setTargetAtTime(48 + speedNorm * 130, t, 0.06);
    A.engineFilter.frequency.setTargetAtTime(320 + speedNorm * 900, t, 0.1);
  };
  A.setSkid = (on) => {
    if (!A.ctx) return;
    A.skidGain.gain.setTargetAtTime(on ? 0.05 : 0, A.ctx.currentTime, 0.05);
  };
  A.setSiren = (on) => {
    if (!A.ctx) return;
    A.sirenOn = on;
    A.sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, A.ctx.currentTime, 0.15);
    if (on && !A.sirenOsc._wobble) {
      A.sirenOsc._wobble = true;
      const lfo = A.ctx.createOscillator();
      lfo.frequency.value = 1.6;
      const lg = A.ctx.createGain();
      lg.gain.value = 260;
      lfo.connect(lg); lg.connect(A.sirenOsc.frequency);
      lfo.start();
    }
  };

  A.gunshot = () => { A.noise(0.16, 0.5, 1800, 'lowpass'); A.tone(160, 0.1, 'square', 0.25, 60); };
  A.punch = () => { A.noise(0.12, 0.4, 300); A.tone(90, 0.12, 'sine', 0.4, 45); };
  A.crash = (hard) => { A.noise(hard ? 0.5 : 0.25, hard ? 0.6 : 0.3, 700); A.tone(70, 0.3, 'sine', 0.4, 35); };
  A.pickup = () => { A.tone(880, 0.12, 'sine', 0.3); A.tone(1318, 0.18, 'sine', 0.3, 0, 0.09); };
  A.click = () => A.tone(700, 0.06, 'square', 0.15);
  A.horn = () => { A.tone(370, 0.35, 'square', 0.18); A.tone(466, 0.35, 'square', 0.12); };
  A.missionStart = () => { [523, 659, 784].forEach((f, i) => A.tone(f, 0.16, 'triangle', 0.28, 0, i * 0.1)); };
  A.missionDone = () => { [523, 659, 784, 1046, 1318].forEach((f, i) => A.tone(f, 0.22, 'triangle', 0.3, 0, i * 0.11)); };
  A.busted = () => { [440, 415, 392, 370].forEach((f, i) => A.tone(f, 0.3, 'sawtooth', 0.2, 0, i * 0.16)); };
  A.wasted = () => { [330, 262, 196, 131].forEach((f, i) => A.tone(f, 0.4, 'sawtooth', 0.22, 0, i * 0.2)); };

  // Light cruise loop: bass line + soft pad, scheduled in 8th notes.
  const BASS = [55, 0, 65.4, 0, 49, 0, 58.3, 0, 55, 0, 65.4, 0, 73.4, 0, 82.4, 0];
  let step = 0;
  A.startMusic = () => {
    if (!A.ctx || A.musicOn) return;
    A.musicOn = true;
    A.musicTimer = setInterval(() => {
      if (!A.ctx || W.mode !== 'play') return;
      const f = BASS[step % BASS.length];
      if (f) A.tone(f, 0.42, 'triangle', 0.16);
      if (step % 8 === 0) A.tone(220, 1.6, 'sine', 0.05);
      if (step % 8 === 4) A.tone(277, 1.6, 'sine', 0.04);
      step++;
    }, 300);
  };
  A.stopMusic = () => { if (A.musicTimer) clearInterval(A.musicTimer); A.musicTimer = null; A.musicOn = false; };

  return A;
}
