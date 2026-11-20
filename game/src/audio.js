// audio.js — synthesized WebAudio only, no audio files. Engine hum tracks
// speed, gunshots are noise bursts, sirens are two-tone oscillators, the city
// hums with filtered noise, mission stingers are short note runs.
export class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null;
    this.engineOsc = null; this.engineGain = null; this.engineFilter = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenOn = false;
    this.ambientOn = false; this.started = false;
  }
  init() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      // Engine: sawtooth through a low-pass, pitch + loudness follow speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 320;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
      // Siren: two alternating tones.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.0;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
      this.started = true;
      this.startAmbient();
    } catch (e) { /* audio unavailable — game plays silent */ }
  }
  startAmbient() {
    if (!this.ctx || this.ambientOn) return;
    this.ambientOn = true;
    try {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 240; filt.Q.value = 0.6;
      const g = this.ctx.createGain(); g.gain.value = 0.045;
      src.connect(filt).connect(g).connect(this.master);
      src.start();
      // Slow gull-like chirps: a sine that sweeps down, every few seconds.
      const chirp = () => {
        if (!this.ctx) return;
        const o = this.ctx.createOscillator(); o.type = 'sine';
        const t = this.ctx.currentTime;
        o.frequency.setValueAtTime(1400, t);
        o.frequency.exponentialRampToValueAtTime(700, t + 0.35);
        const gg = this.ctx.createGain();
        gg.gain.setValueAtTime(0.05, t);
        gg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.connect(gg).connect(this.master);
        o.start(t); o.stop(t + 0.45);
        setTimeout(chirp, 5000 + Math.random() * 9000);
      };
      setTimeout(chirp, 2500);
    } catch (e) { /* ignore */ }
  }
  setEngine(speedNorm, inVehicle) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const target = inVehicle ? 0.05 + speedNorm * 0.11 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speedNorm * 165, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(280 + speedNorm * 900, t, 0.1);
  }
  setSiren(on, wanted) {
    if (!this.ctx || !this.sirenGain) return;
    const t = this.ctx.currentTime;
    if (on && !this.sirenOn) {
      this.sirenOn = true;
      this.sirenGain.gain.setTargetAtTime(0.05 + wanted * 0.012, t, 0.2);
      const wail = () => {
        if (!this.sirenOn || !this.ctx) return;
        const now = this.ctx.currentTime;
        this.sirenOsc.frequency.setTargetAtTime(720, now, 0.05);
        setTimeout(() => { if (this.sirenOn) this.sirenOsc.frequency.setTargetAtTime(980, this.ctx.currentTime, 0.05); }, 450);
        setTimeout(wail, 900);
      };
      wail();
    } else if (!on && this.sirenOn) {
      this.sirenOn = false;
      this.sirenGain.gain.setTargetAtTime(0.0, t, 0.2);
    }
  }
  noiseBurst(dur, freq, vol) {
    if (!this.ctx) return;
    try {
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = freq;
      const g = this.ctx.createGain(); g.gain.value = vol;
      src.connect(filt).connect(g).connect(this.master);
      src.start();
    } catch (e) { /* ignore */ }
  }
  gunshot(kind) {
    if (kind === 'shotgun') this.noiseBurst(0.28, 900, 0.5);
    else if (kind === 'smg') this.noiseBurst(0.09, 1800, 0.3);
    else this.noiseBurst(0.14, 1400, 0.38);
  }
  impact() { this.noiseBurst(0.18, 500, 0.4); }
  pickup() { this.tone(880, 0.12, 0.18); this.tone(1320, 0.14, 0.18); }
  tone(freq, dur, vol) {
    if (!this.ctx) return;
    try {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const g = this.ctx.createGain(); const t = this.ctx.currentTime;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  stinger(win) {
    if (!this.ctx) return;
    const notes = win ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 0.22), i * 130));
  }
  cash() { this.tone(1047, 0.1, 0.2); setTimeout(() => this.tone(1568, 0.16, 0.2), 90); }
}
