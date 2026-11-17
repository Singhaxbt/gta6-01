// audio.js — WebAudio synthesized sounds only. No audio files, no network.
// Everything is guarded: in headless browsers (or with no audio device) it
// silently becomes a no-op instead of throwing.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this._unlocked = false;
  }

  /** Create/resume the context. Call from a user gesture (or a test poke). */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
        this._startEngineHum();
        this._startSiren();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      this._unlocked = true;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    try {
      if (this.master && this.ctx) this.master.gain.value = m ? 0 : 0.5;
    } catch {
      /* ignore */
    }
  }

  _startEngineHum() {
    const ctx = this.ctx;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.master);
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc.connect(this.engineGain);
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    this.engineOsc2.connect(g2);
    g2.connect(this.engineGain);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  _startSiren() {
    const ctx = this.ctx;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenGain.connect(this.master);
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 720;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenOsc.start();
  }

  /** Called every frame: engine pitch follows speed, siren wails while wanted. */
  update(speedNorm, wanted, dt) {
    if (!this.ctx || !this._unlocked) return;
    try {
      const t = this.ctx.currentTime;
      if (this.engineOsc && this.engineGain) {
        const target = 0.02 + speedNorm * 0.06;
        this.engineGain.gain.setTargetAtTime(target, t, 0.08);
        this.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 130, t, 0.08);
        this.engineOsc2.frequency.setTargetAtTime(28 + speedNorm * 65, t, 0.08);
      }
      if (this.sirenOsc && this.sirenGain) {
        this.sirenTimer += dt;
        if (this.sirenTimer > 0.42) {
          this.sirenTimer = 0;
          this.sirenHigh = !this.sirenHigh;
          this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 700, t, 0.05);
        }
        this.sirenGain.gain.setTargetAtTime(wanted > 0 ? 0.035 : 0, t, 0.1);
      }
    } catch {
      /* ignore */
    }
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    return buf;
  }

  _blip(freq, dur, type, vol, when = 0) {
    if (!this.ctx || !this._unlocked) return;
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      /* ignore */
    }
  }

  gunshot() {
    if (!this.ctx || !this._unlocked) return;
    try {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(0.16);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 2400;
      src.connect(filt);
      filt.connect(g);
      g.connect(this.master);
      src.start();
    } catch {
      /* ignore */
    }
  }

  blip() {
    this._blip(880, 0.07, 'square', 0.12);
  }

  missionStart() {
    this._blip(523, 0.12, 'triangle', 0.2);
    this._blip(659, 0.12, 'triangle', 0.2, 0.12);
    this._blip(784, 0.2, 'triangle', 0.22, 0.24);
  }

  fanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this._blip(f, 0.22, 'triangle', 0.22, i * 0.13));
  }

  fail() {
    this._blip(392, 0.2, 'sawtooth', 0.15);
    this._blip(311, 0.35, 'sawtooth', 0.15, 0.18);
  }

  wasted() {
    const notes = [440, 415, 392, 370, 349];
    notes.forEach((f, i) => this._blip(f, 0.4, 'sawtooth', 0.16, i * 0.28));
  }
}
