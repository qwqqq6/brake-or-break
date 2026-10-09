import { clamp } from './util';

/** Web Audio 合成音效，不依赖任何素材文件 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  muted = false;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private engOsc!: OscillatorNode;
  private engOsc2!: OscillatorNode;
  private engGain!: GainNode;
  private engFilter!: BiquadFilterNode;
  private sqOsc!: OscillatorNode;
  private sqGain!: GainNode;
  private skidGain!: GainNode;
  private rainGain!: GainNode;

  /** 需在用户手势中调用 */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // 发动机
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 600;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engOsc = ctx.createOscillator(); this.engOsc.type = 'sawtooth'; this.engOsc.frequency.value = 40;
    this.engOsc2 = ctx.createOscillator(); this.engOsc2.type = 'square'; this.engOsc2.frequency.value = 20;
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    this.engOsc.connect(this.engFilter); this.engOsc2.connect(g2).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.engOsc.start(); this.engOsc2.start();

    // 刹车片啸叫
    this.sqOsc = ctx.createOscillator(); this.sqOsc.type = 'triangle'; this.sqOsc.frequency.value = 2200;
    this.sqGain = ctx.createGain(); this.sqGain.gain.value = 0;
    this.sqOsc.connect(this.sqGain).connect(this.master); this.sqOsc.start();

    // 轮胎抱死
    const skid = ctx.createBufferSource(); skid.buffer = this.noise; skid.loop = true;
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1800; sf.Q.value = 3;
    this.skidGain = ctx.createGain(); this.skidGain.gain.value = 0;
    skid.connect(sf).connect(this.skidGain).connect(this.master); skid.start();

    // 雨声
    const rain = ctx.createBufferSource(); rain.buffer = this.noise; rain.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1200;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    rain.connect(rf).connect(this.rainGain).connect(this.master); rain.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.55;
  }

  /** 每帧更新持续音 */
  drive(p: { speed: number; throttle: number; force: number; locked: boolean; temp: number; rain: boolean; active: boolean }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = p.active ? 1 : 0;
    const rpm = 30 + Math.abs(p.speed) * 3.2 + p.throttle * 35;
    this.engOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engOsc2.frequency.setTargetAtTime(rpm / 2, t, 0.08);
    this.engFilter.frequency.setTargetAtTime(300 + p.throttle * 900 + Math.abs(p.speed) * 15, t, 0.1);
    this.engGain.gain.setTargetAtTime(on * (0.07 + p.throttle * 0.08), t, 0.1);
    const moving = Math.abs(p.speed) > 0.8;
    const sq = on * (moving ? clamp((p.force - 900) / 900, 0, 1) * 0.05 + clamp(p.temp - 0.6, 0, 1) * 0.08 * clamp(p.force / 400, 0, 1) : 0);
    this.sqGain.gain.setTargetAtTime(sq, t, 0.05);
    this.sqOsc.frequency.setTargetAtTime(1900 + p.force * 0.5, t, 0.05);
    this.skidGain.gain.setTargetAtTime(on * (p.locked && moving ? 0.35 : 0), t, 0.03);
    this.rainGain.gain.setTargetAtTime(on * (p.rain ? 0.07 : 0), t, 0.3);
  }

  silence() { this.drive({ speed: 0, throttle: 0, force: 0, locked: false, temp: 0, rain: false, active: false }); }

  // ---- 单次音效 ----
  private env(node: AudioNode, gain: number, attack: number, decay: number, at = 0) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const t = ctx.currentTime + at;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g).connect(this.master);
    return t;
  }
  private osc(type: OscillatorType, f0: number, f1: number, gain: number, dur: number, at = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = type;
    const t = this.env(o, gain, 0.005, dur, at);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  private burst(type: BiquadFilterType, f0: number, f1: number, gain: number, dur: number, q = 1, at = 0) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    s.connect(f);
    const t = this.env(f, gain, 0.005, dur, at);
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  creak() {
    const f = 70 + Math.random() * 60;
    this.osc('sawtooth', f, f * 1.6, 0.12, 0.35);
    this.burst('bandpass', 400, 900, 0.08, 0.3, 8);
  }
  crack() {
    this.burst('highpass', 3000, 1500, 0.9, 0.18);
    this.osc('square', 900, 60, 0.4, 0.25);
    this.osc('sine', 120, 40, 0.6, 0.4);
  }
  crash() {
    this.burst('lowpass', 5000, 200, 1.0, 1.4, 0.7);
    this.osc('sine', 110, 30, 0.9, 0.9);
    this.osc('square', 340, 120, 0.15, 0.5, 0.05);
    this.burst('highpass', 6000, 3000, 0.4, 0.8, 1, 0.1); // 碎玻璃
    for (let i = 0; i < 5; i++) this.osc('triangle', 1800 + Math.random() * 2500, 900, 0.08, 0.2, 0.15 + i * 0.09);
  }
  horn() {
    this.osc('square', 350, 345, 0.12, 0.55);
    this.osc('square', 440, 436, 0.12, 0.55);
  }
  ding() {
    this.osc('sine', 1320, 1318, 0.25, 0.35);
    this.osc('sine', 1980, 1975, 0.15, 0.5, 0.08);
  }
  coin() {
    this.osc('square', 990, 990, 0.08, 0.08);
    this.osc('square', 1320, 1320, 0.08, 0.25, 0.08);
  }
  buzz() { this.osc('sawtooth', 160, 120, 0.2, 0.4); }
  beep(high = false) { this.osc('square', high ? 1046 : 523, high ? 1046 : 523, 0.12, high ? 0.5 : 0.18); }
  quack() {
    this.osc('sawtooth', 700, 380, 0.12, 0.12);
    this.osc('sawtooth', 650, 340, 0.12, 0.14, 0.18);
  }
  splash() { this.burst('bandpass', 1200, 400, 0.35, 0.35, 2); }
  whoosh() { this.burst('bandpass', 300, 2500, 0.4, 0.5, 1.5); }
  thud() { this.osc('sine', 90, 40, 0.6, 0.3); this.burst('lowpass', 800, 100, 0.3, 0.2); }
  select() { this.osc('square', 660, 660, 0.06, 0.05); }
}
