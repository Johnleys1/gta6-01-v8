// Aurora Falls — sound: a tiny WebAudio synth for engine, sirens, gunfire
// and three procedural radio stations. No audio files, no network.
// One clear job: everything the player hears.
import { RADIOS } from './config.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.radioIndex = 0;
    this.radioOn = true;
    this.engineOsc = null;
    this.engineGain = null;
    this.musicTimer = null;
    this.step = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Engine: two detuned saws through a lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 55.7;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
    this.startRadio();
  }

  setEngine(speedNorm, inCar) {
    if (!this.ctx) return;
    const target = inCar ? 0.05 + speedNorm * 0.11 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    const freq = 48 + speedNorm * 130;
    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(freq * 1.012, this.ctx.currentTime, 0.08);
  }

  blip(freq, dur, type = 'sine', gain = 0.2) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  gunshot() {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 0.14;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
  }

  explosion() {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 0.9;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0.8;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    this.blip(52, 0.7, 'sine', 0.5);
  }

  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.55;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      lfo.start();
      this.sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null;
    }
  }

  // Three stations, three moods, all synthesized: a bass line, a pad and a
  // hat pattern stepped from the station tempo. Aurora FM is synthwave,
  // PASS 94 is cold rock, LAKE LOUNGE is slow jazz.
  startRadio() {
    if (!this.ctx || this.musicTimer) return;
    const scales = {
      aurora: [55, 65.41, 82.41, 98, 110, 130.81],
      pass: [41.2, 55, 61.74, 82.41, 98, 110],
      lake: [65.41, 77.78, 87.31, 98, 116.54, 130.81],
    };
    this.musicTimer = setInterval(() => {
      if (!this.ctx || !this.radioOn) return;
      const st = RADIOS[this.radioIndex];
      const scale = scales[st.id];
      const beat = 60 / st.tempo / 2;
      this.step++;
      const root = scale[this.step % scale.length];
      // Bass on the beat.
      this.note(root / 2, beat * 1.8, 'triangle', 0.16);
      // Pad every four steps.
      if (this.step % 4 === 0) {
        this.note(root * 2, beat * 3.6, 'sine', 0.05);
        this.note(root * 2 * 1.5, beat * 3.6, 'sine', 0.04);
      }
      // Lead sparkle on the off-beat for aurora, riff for pass, sparse for lake.
      const chance = st.id === 'lake' ? 0.25 : 0.55;
      if (Math.random() < chance) {
        const n = scale[Math.floor(Math.random() * scale.length)] * 4;
        this.note(n, beat * 0.9, st.id === 'pass' ? 'square' : 'sine', 0.05);
      }
    }, 240);
  }

  note(freq, dur, type, gain) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  cycleRadio() {
    this.radioIndex = (this.radioIndex + 1) % RADIOS.length;
    return RADIOS[this.radioIndex];
  }

  toggleRadio() {
    this.radioOn = !this.radioOn;
    return this.radioOn;
  }
}
