// DualSense WebHID 输出：自适应扳机阻力 + 灯条
// 报告格式参考 Linux hid-playstation 驱动 (dualsense_output_report_common, 47 字节)

const VID = 0x054c;
const PIDS = [0x0ce6, 0x0df2]; // DualSense / DualSense Edge

let CRC_TABLE: Uint32Array | null = null;
function crc32(bytes: Uint8Array) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 10 段位置反馈（模式 0x21）：strengths[i] 0=无阻力, 1..8 */
export function feedbackEffect(strengths: number[]): Uint8Array {
  const e = new Uint8Array(11);
  let active = 0, forces = 0;
  for (let i = 0; i < 10; i++) {
    const s = Math.round(strengths[i] || 0);
    if (s > 0) {
      active |= 1 << i;
      forces |= ((Math.min(8, s) - 1) & 7) << (3 * i);
    }
  }
  e[0] = 0x21;
  e[1] = active & 0xff; e[2] = (active >> 8) & 0xff;
  e[3] = forces & 0xff; e[4] = (forces >>> 8) & 0xff; e[5] = (forces >>> 16) & 0xff; e[6] = (forces >>> 24) & 0xff;
  return e;
}
export const EFFECT_OFF = (() => { const e = new Uint8Array(11); e[0] = 0x05; return e; })();

/**
 * 武器模式（0x25）：start..end 区间有阻力，越过 end 后阻力瞬间消失 → "咔嗒"一下。
 * start 2..7, end start+1..8, strength 1..8
 */
export function weaponEffect(start: number, end: number, strength: number): Uint8Array {
  const s = Math.max(2, Math.min(7, Math.round(start)));
  const en = Math.max(s + 1, Math.min(8, Math.round(end)));
  const zones = (1 << s) | (1 << en);
  const e = new Uint8Array(11);
  e[0] = 0x25;
  e[1] = zones & 0xff; e[2] = (zones >> 8) & 0xff;
  e[3] = (Math.max(1, Math.min(8, Math.round(strength))) - 1) & 7;
  return e;
}

/** 振动模式（0x26）：从 position 往后的行程上振动。amplitude 1..8，frequency Hz（1..255） */
export function vibrationEffect(position: number, amplitude: number, frequency: number): Uint8Array {
  const e = new Uint8Array(11);
  const p = Math.max(0, Math.min(9, Math.round(position)));
  const a = (Math.max(1, Math.min(8, Math.round(amplitude))) - 1) & 7;
  let active = 0, amps = 0;
  for (let i = p; i < 10; i++) { active |= 1 << i; amps |= a << (3 * i); }
  e[0] = 0x26;
  e[1] = active & 0xff; e[2] = (active >> 8) & 0xff;
  e[3] = amps & 0xff; e[4] = (amps >>> 8) & 0xff; e[5] = (amps >>> 16) & 0xff; e[6] = (amps >>> 24) & 0xff;
  e[9] = Math.max(1, Math.min(255, Math.round(frequency)));
  return e;
}

export class DualSenseHID {
  device: HIDDevice | null = null;
  bt = false;
  status: 'unsupported' | 'idle' | 'connected' | 'error' = 'idle';
  /** 最近一次发送是否成功（调试用：window.game.hid.lastError） */
  lastError: unknown = null;
  sentOk = 0;
  private seq = 0;
  private left: Uint8Array = EFFECT_OFF;
  private right: Uint8Array = EFFECT_OFF;
  private rgb = [255, 200, 40];
  private motor = [0, 0]; // [大马达(低频), 小马达(高频)] 0..255
  private dirty = true;
  private lastSend = 0;
  private lastKeep = 0;
  private setupDone = false;
  private sending = false;
  private lens: number[] = [];   // 候选数据长度（不含 report id），发送失败时依次尝试
  private lenIdx = 0;

  constructor() {
    if (!('hid' in navigator) || !navigator.hid) this.status = 'unsupported';
    navigator.hid?.addEventListener('disconnect', (ev) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((ev as any).device === this.device) { this.device = null; this.status = 'idle'; }
    });
  }
  get supported() { return this.status !== 'unsupported'; }
  get connected() { return this.status === 'connected'; }

  /** 已授权过的设备自动重连（无需用户手势） */
  async autoConnect() {
    if (!navigator.hid) return;
    try {
      const devs = await navigator.hid.getDevices();
      const d = devs.find((x) => x.vendorId === VID && PIDS.includes(x.productId));
      if (d) await this.open(d);
    } catch (e) { this.lastError = e; }
  }

  /** 必须在点击/按键事件中调用 */
  async request() {
    if (!navigator.hid) return false;
    try {
      const devs = await navigator.hid.requestDevice({ filters: PIDS.map((p) => ({ vendorId: VID, productId: p })) });
      if (!devs.length) return false;
      await this.open(devs[0]);
      return true;
    } catch (e) {
      console.warn('WebHID 连接失败', e);
      this.lastError = e;
      this.status = 'error';
      return false;
    }
  }

  private async open(d: HIDDevice) {
    if (!d.opened) await d.open();
    this.device = d;
    const outs = d.collections.flatMap((c) => c.outputReports || []);
    const rep = (id: number) => outs.find((r) => r.reportId === id);
    this.bt = !!rep(0x31);
    // 按设备描述符里声明的输出报告长度发送（Windows 对长度很严格）
    const declared = rep(this.bt ? 0x31 : 0x02);
    const bytes = declared?.items?.reduce((a, it) => a + ((it.reportSize ?? 0) * (it.reportCount ?? 0)) / 8, 0) ?? 0;
    const fallback = this.bt ? [77] : [47, 62, 63];
    this.lens = [...new Set([bytes, ...fallback].filter((n) => n >= (this.bt ? 77 : 47)))];
    this.lenIdx = 0;
    if (this.bt) {
      // 蓝牙默认是精简模式；读一次特性报告 0x05 让手柄切到完整模式，才会接受 0x31 输出报告
      try { await d.receiveFeatureReport(0x05); } catch { /* ignore */ }
    }
    this.status = 'connected';
    this.setupDone = false;
    this.dirty = true;
  }

  setLeft(e: Uint8Array) { if (!same(e, this.left)) { this.left = e; this.dirty = true; } }
  setRight(e: Uint8Array) { if (!same(e, this.right)) { this.right = e; this.dirty = true; } }
  setLight(r: number, g: number, b: number) {
    const n = [r | 0, g | 0, b | 0];
    if (Math.abs(n[0] - this.rgb[0]) + Math.abs(n[1] - this.rgb[1]) + Math.abs(n[2] - this.rgb[2]) > 12) { this.rgb = n; this.dirty = true; }
  }
  /** 马达震动 0..1（启用 HID 后由这里统一驱动，避免和浏览器自带震动的报告互相覆盖） */
  setMotor(strong: number, weak: number) {
    const n = [Math.round(Math.max(0, Math.min(1, strong)) * 255), Math.round(Math.max(0, Math.min(1, weak)) * 255)];
    if (Math.abs(n[0] - this.motor[0]) > 6 || Math.abs(n[1] - this.motor[1]) > 6 || ((n[0] === 0) !== (this.motor[0] === 0)) || ((n[1] === 0) !== (this.motor[1] === 0))) {
      this.motor = n; this.dirty = true;
    }
  }

  /** 每帧调用，约 60Hz 上限；每 1 秒强制重发一次，防止被其他报告覆盖 */
  flush(now: number) {
    if (!this.device || this.sending) return;
    if (now - this.lastKeep > 1000) { this.dirty = true; this.lastKeep = now; }
    if (!this.dirty || now - this.lastSend < 15) return;
    this.lastSend = now;
    this.dirty = false;
    const c = new Uint8Array(47);
    c[0] = 0x01 | 0x02 | 0x04 | 0x08; // 兼容震动 + 马达 + 右/左扳机效果
    c[1] = 0x04;                      // 灯条
    c[2] = this.motor[1];             // 右马达（高频）
    c[3] = this.motor[0];             // 左马达（低频）
    c.set(this.right, 10);
    c.set(this.left, 21);
    if (!this.setupDone) { c[38] = 0x02; c[41] = 0x02; } // 释放默认蓝色呼吸灯
    c[44] = this.rgb[0]; c[45] = this.rgb[1]; c[46] = this.rgb[2];

    const len = this.lens[this.lenIdx] ?? (this.bt ? 77 : 47);
    let id = 0x02;
    const data = new Uint8Array(len);
    if (!this.bt) {
      data.set(c, 0);
    } else {
      id = 0x31;
      data[0] = (this.seq << 4) & 0xf0; this.seq = (this.seq + 1) & 0x0f;
      data[1] = 0x10;
      data.set(c, 2);
      const crcBuf = new Uint8Array(75);
      crcBuf[0] = 0xa2; crcBuf[1] = 0x31; crcBuf.set(data.subarray(0, 73), 2);
      const crc = crc32(crcBuf);
      data[73] = crc & 0xff; data[74] = (crc >>> 8) & 0xff; data[75] = (crc >>> 16) & 0xff; data[76] = (crc >>> 24) & 0xff;
    }
    this.sending = true;
    this.device.sendReport(id, data)
      .then(() => { this.sentOk++; this.setupDone = true; this.lastError = null; })
      .catch((e) => {
        this.lastError = e;
        console.warn(`HID 发送失败 (len=${len})`, e);
        if (this.lenIdx < this.lens.length - 1) this.lenIdx++;
        this.dirty = true;
      })
      .finally(() => { this.sending = false; });
  }
}


function same(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
