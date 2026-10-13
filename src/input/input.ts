import { clamp } from '../util';
import { H, W } from '../config';

export type Btn = 'confirm' | 'back' | 'pause' | 'up' | 'down' | 'left' | 'right' | 'alt';

/** 屏幕触摸按钮区域（画布坐标系 1280×720） */
export const TOUCH_BRAKE = { x: 980, y: 150, w: 290, h: 300, r: 30 };
export const TOUCH_GAS = { x: 20, y: 150, w: 150, h: 150, r: 28 };
export const TOUCH_PAUSE = { x: W - 70, y: 20, w: 50, h: 50 };

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
  source: 'pad' | 'kb' | 'touch' = 'kb';
  isTouch = false;
  calib = { brakeMax: 1, throttleMax: 1 };

  // 触摸状态（画布坐标）
  private touchBrake = 0;
  private touchGas = 0;
  private tapQueue: { x: number; y: number }[] = [];
  private canvas: HTMLCanvasElement | null = null;

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

  /** 绑定触摸：整块 BRAKE 区按压力度随距离/时长上升，GAS 区常开，其余区域点按=确认 */
  attachTouch(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const active = new Map<number, { zone: 'brake' | 'gas' | 'tap'; x: number; y: number; depth: number }>();
    const toCanvas = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((cx - r.left) / r.width) * W, y: ((cy - r.top) / r.height) * H };
    };
    const inRect = (p: { x: number; y: number }, z: { x: number; y: number; w: number; h: number }) =>
      p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h;

    const onDown = (id: number, cx: number, cy: number) => {
      this.isTouch = true; this.source = 'touch';
      this.onUserGesture?.('touch');
      const p = toCanvas(cx, cy);
      let zone: 'brake' | 'gas' | 'tap' = 'tap';
      if (inRect(p, TOUCH_BRAKE)) zone = 'brake';
      else if (inRect(p, TOUCH_GAS)) zone = 'gas';
      active.set(id, { zone, x: p.x, y: p.y, depth: zone === 'brake' ? brakeDepth(p.y) : 0 });
      if (zone === 'tap') this.tapQueue.push(p);
    };
    const onMove = (id: number, cx: number, cy: number) => {
      const t = active.get(id);
      if (!t || t.zone !== 'brake') return;
      const p = toCanvas(cx, cy);
      t.depth = Math.max(t.depth, brakeDepth(p.y)); // 往上拖 = 踩深；也可直接按住
    };
    const onUp = (id: number) => active.delete(id);
    // 制动区：按下即给基础力，往上拖增加；y 越小（越靠顶）越深
    const brakeDepth = (y: number) => clamp((TOUCH_BRAKE.y + TOUCH_BRAKE.h - y) / TOUCH_BRAKE.h, 0.35, 1);

    this.touchStep = (dt: number) => {
      let b = 0, g = false;
      for (const t of active.values()) {
        if (t.zone === 'brake') b = Math.max(b, t.depth);
        if (t.zone === 'gas') g = true;
      }
      // 平滑：按下快速上升、松开回落，手感接近扳机
      this.touchBrake = b > 0
        ? clamp(this.touchBrake + (b - this.touchBrake) * Math.min(1, dt * 12), 0, 1)
        : clamp(this.touchBrake - 8 * dt, 0, 1);
      this.touchGas = clamp(this.touchGas + (g ? 4 : -5) * dt, 0, 1);
    };

    const opt = { passive: false } as AddEventListenerOptions;
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); for (const t of e.changedTouches) onDown(t.identifier, t.clientX, t.clientY); }, opt);
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) onMove(t.identifier, t.clientX, t.clientY); }, opt);
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); for (const t of e.changedTouches) onUp(t.identifier); }, opt);
    canvas.addEventListener('touchcancel', (e) => { for (const t of e.changedTouches) onUp(t.identifier); }, opt);
  }
  private touchStep: (dt: number) => void = () => {};

  /** 取出一次点按（画布坐标），供菜单命中测试；无则返回 null */
  takeTap() { return this.tapQueue.shift() || null; }
  hasTap() { return this.tapQueue.length > 0; }

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
    this.touchStep(dt);
    this.brake = Math.max(pb, this.kbBrake, this.touchBrake);
    this.throttle = Math.max(pt, this.kbThrottle, this.touchGas);
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
  private flushRumble(now: number) {
    this.pulses = this.pulses.filter((p) => p.until > now);
    let s = this.rumbleBase.s, w = this.rumbleBase.w;
    for (const p of this.pulses) if (p.from <= now) { s = Math.max(s, p.s); w = Math.max(w, p.w); }
    if (this.rumbleSink) { this.rumbleSink(s, w); return; }
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
    if (this.source === 'touch') {
      const tm: Partial<Record<Btn, string>> = { confirm: '点击', back: '点击', up: '点', down: '点', alt: '点击' };
      if (tm[b]) return tm[b]!;
    }
    return m[b][pad ? 0 : 1];
  }
  brakeName() { return this.source === 'touch' ? '按住 BRAKE' : this.source === 'pad' && this.padConnected ? 'L2' : '空格'; }
  gasName() { return this.source === 'touch' ? '按住 GAS' : this.source === 'pad' && this.padConnected ? 'R2' : '↑'; }
}
