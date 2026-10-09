import { clamp } from '../util';

export type Btn = 'confirm' | 'back' | 'pause' | 'up' | 'down' | 'left' | 'right' | 'alt';

// 标准映射：0=✕ 1=○ 3=△ 9=OPTIONS 12-15=方向键
const PAD_BTNS: [number, Btn][] = [
  [0, 'confirm'], [1, 'back'], [3, 'alt'], [9, 'pause'],
  [12, 'up'], [13, 'down'], [14, 'left'], [15, 'right'],
];
const KEYS: Record<string, Btn[]> = {
  Enter: ['confirm'], NumpadEnter: ['confirm'],
  Escape: ['back', 'pause'], Backspace: ['back'], KeyP: ['pause'],
  ArrowUp: ['up'], ArrowDown: ['down'], ArrowLeft: ['left'], ArrowRight: ['right'],
  KeyU: ['alt'], KeyR: ['alt'],
};
const NAV: Btn[] = ['up', 'down', 'left', 'right'];
const BRAKE_KEYS = ['Space', 'ArrowDown', 'KeyS'];
const GAS_KEYS = ['ArrowUp', 'KeyW'];

const CALIB_KEY = 'bob_calib_v1';

/** 统一输入：手柄模拟扳机 + 键盘兜底 + 震动 */
export class Input {
  brake = 0;      // 0..1，已校准
  throttle = 0;
  rawBrake = 0;   // 手柄原始值
  rawThrottle = 0;
  padConnected = false;
  padName = '';
  source: 'pad' | 'kb' = 'kb';
  calib = { brakeMax: 1, throttleMax: 1 };

  private edges = new Set<Btn>();
  private held = new Set<string>();
  private prevPad = new Map<number, boolean>();
  private navHold = new Map<Btn, number>();
  private kbBrake = 0;
  private kbThrottle = 0;
  private rumbleBase = { s: 0, w: 0 };
  private pulses: { s: number; w: number; from: number; until: number }[] = [];
  private lastRumble = 0;
  private lastSent = 0;
  private holdUntil = 0;
  onUserGesture?: (code: string) => void;

  constructor() {
    try {
      const c = JSON.parse(localStorage.getItem(CALIB_KEY) || 'null');
      if (c && c.brakeMax > 0.3) this.calib = c;
    } catch { /* ignore */ }

    window.addEventListener('keydown', (e) => {
      const btns = KEYS[e.code] || [];
      if (!e.repeat || btns.some((b) => NAV.includes(b))) btns.forEach((b) => this.edges.add(b));
      if (e.code === 'Space' && !e.repeat) this.edges.add('confirm');
      this.held.add(e.code);
      this.source = 'kb';
      this.onUserGesture?.(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  saveCalib() { localStorage.setItem(CALIB_KEY, JSON.stringify(this.calib)); }

  pad(): Gamepad | null {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    let best: Gamepad | null = null;
    for (const g of list) {
      if (!g || !g.connected) continue;
      if (!best || g.mapping === 'standard') best = g;
    }
    return best;
  }

  update(dt: number, now: number) {
    // 键盘：按住时力度逐渐上升，松开回落
    const kbB = BRAKE_KEYS.some((k) => this.held.has(k));
    const kbG = GAS_KEYS.some((k) => this.held.has(k));
    this.kbBrake = clamp(this.kbBrake + (kbB ? 0.55 : -3) * dt, 0, 1);
    this.kbThrottle = clamp(this.kbThrottle + (kbG ? 2.5 : -4) * dt, 0, 1);

    const g = this.pad();
    this.padConnected = !!g;
    let pb = 0, pt = 0;
    if (g) {
      this.padName = g.id;
      const b6 = g.buttons[6], b7 = g.buttons[7];
      this.rawBrake = b6 ? b6.value : 0;
      this.rawThrottle = b7 ? b7.value : 0;
      pb = clamp((this.rawBrake - 0.02) / Math.max(0.1, this.calib.brakeMax - 0.02), 0, 1);
      pt = clamp((this.rawThrottle - 0.02) / Math.max(0.1, this.calib.throttleMax - 0.02), 0, 1);
      if (pb > 0 || pt > 0) this.source = 'pad';

      for (const [i, b] of PAD_BTNS) {
        const p = !!g.buttons[i]?.pressed;
        const was = this.prevPad.get(i) || false;
        if (p && !was) { this.edges.add(b); this.source = 'pad'; this.navHold.set(b, 0); }
        if (p && NAV.includes(b)) this.repeatNav(b, dt);
        this.prevPad.set(i, p);
      }
      // 左摇杆导航
      const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
      this.stick('left', ax < -0.6, dt, -1);
      this.stick('right', ax > 0.6, dt, -2);
      this.stick('up', ay < -0.6, dt, -3);
      this.stick('down', ay > 0.6, dt, -4);
    }
    this.brake = Math.max(pb, this.kbBrake);
    this.throttle = Math.max(pt, this.kbThrottle);
    this.flushRumble(now);
  }

  private repeatNav(b: Btn, dt: number) {
    const t = (this.navHold.get(b) || 0) + dt;
    this.navHold.set(b, t);
    if (t > 0.4) { this.edges.add(b); this.navHold.set(b, 0.28); }
  }
  private stick(b: Btn, on: boolean, dt: number, key: number) {
    const was = this.prevPad.get(key) || false;
    if (on && !was) { this.edges.add(b); this.navHold.set(b, 0); this.source = 'pad'; }
    if (on) this.repeatNav(b, dt);
    this.prevPad.set(key, on);
  }

  pressed(b: Btn) { return this.edges.has(b); }
  endFrame() { this.edges.clear(); }

  // ---- 震动 ----
  /** 启用 HID 后由它接管马达，不再走浏览器 vibrationActuator（两者的输出报告会互相覆盖扳机设置） */
  rumbleSink: ((strong: number, weak: number) => void) | null = null;

  setRumble(strong: number, weak: number) { this.rumbleBase.s = strong; this.rumbleBase.w = weak; }
  pulse(strong: number, weak: number, ms: number, delay = 0) {
    const t = performance.now() + delay;
    this.pulses.push({ s: strong, w: weak, from: t, until: t + ms });
  }
  /** 断裂"嘎巴"：嘎 = 高频小马达尖锐一下；停顿；巴 = 大马达重重一下；之后一段余震 */
  snap() {
    this.pulses = [];
    this.rumbleBase = { s: 0, w: 0 };
    this.holdUntil = performance.now() + 650;
    const steps: [number, number, number, number][] = [[0, 0.15, 1, 55], [85, 1, 1, 110], [200, 0.45, 0.15, 380]];
    if (this.rumbleSink) { for (const [d, s, w, ms] of steps) this.pulse(s, w, ms, d); return; }
    const g = this.pad();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const act = g && (g as any).vibrationActuator;
    if (!act || typeof act.playEffect !== 'function') return;
    for (const [d, s, w, ms] of steps) {
      setTimeout(() => act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: s, weakMagnitude: w }).catch(() => {}), d);
    }
  }
  private flushRumble(now: number) {
    this.pulses = this.pulses.filter((p) => p.until > now);
    let s = this.rumbleBase.s, w = this.rumbleBase.w;
    if (this.rumbleSink && now < this.holdUntil) { s = 0; w = 0; }
    for (const p of this.pulses) if (p.from <= now) { s = Math.max(s, p.s); w = Math.max(w, p.w); }
    if (this.rumbleSink) { this.rumbleSink(s, w); return; }
    if (now < this.holdUntil) return;
    if (now - this.lastRumble < 70) return;
    this.lastRumble = now;
    const g = this.pad();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const act = g && (g as any).vibrationActuator;
    if (!act || typeof act.playEffect !== 'function') return;
    if (s < 0.02 && w < 0.02) {
      if (this.lastSent > 0) { act.reset?.(); this.lastSent = 0; }
      return;
    }
    this.lastSent = s + w;
    act.playEffect('dual-rumble', { startDelay: 0, duration: 110, strongMagnitude: clamp(s, 0, 1), weakMagnitude: clamp(w, 0, 1) }).catch(() => {});
  }

  glyph(b: Btn) {
    const pad = this.source === 'pad' && this.padConnected;
    const m: Record<Btn, [string, string]> = {
      confirm: ['✕', 'Enter'], back: ['○', 'Esc'], pause: ['OPTIONS', 'Esc'], alt: ['△', 'R'],
      up: ['↑', '↑'], down: ['↓', '↓'], left: ['←', '←'], right: ['→', '→'],
    };
    return m[b][pad ? 0 : 1];
  }
  brakeName() { return this.source === 'pad' && this.padConnected ? 'L2' : '空格'; }
  gasName() { return this.source === 'pad' && this.padConnected ? 'R2' : '↑'; }
}
