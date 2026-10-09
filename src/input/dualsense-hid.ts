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
  private seq = 0;
  private left: Uint8Array = EFFECT_OFF;
  private right: Uint8Array = EFFECT_OFF;
  private rgb = [255, 200, 40];
  private dirty = true;
  private lastSend = 0;
  private setupDone = false;
  private sending = false;

  constructor() {
    if (!('hid' in navigator) || !navigator.hid) this.status = 'unsupported';
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
    } catch { /* ignore */ }
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
      this.status = 'error';
      return false;
    }
  }

  private async open(d: HIDDevice) {
    if (!d.opened) await d.open();
    this.device = d;
    this.bt = d.collections.some((c) => (c.outputReports || []).some((r) => r.reportId === 0x31));
    this.status = 'connected';
    this.setupDone = false;
    this.dirty = true;
    navigator.hid?.addEventListener('disconnect', (ev) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((ev as any).device === this.device) { this.device = null; this.status = 'idle'; }
    });
  }

  setLeft(e: Uint8Array) { if (!same(e, this.left)) { this.left = e; this.dirty = true; } }
  setRight(e: Uint8Array) { if (!same(e, this.right)) { this.right = e; this.dirty = true; } }
  setLight(r: number, g: number, b: number) {
    const n = [r | 0, g | 0, b | 0];
    if (Math.abs(n[0] - this.rgb[0]) + Math.abs(n[1] - this.rgb[1]) + Math.abs(n[2] - this.rgb[2]) > 12) { this.rgb = n; this.dirty = true; }
  }

  /** 每帧调用，内部限频 ~25Hz；force=true 时立即发送（用于断裂瞬间） */
  flush(now: number, force = false) {
    if (!this.device || !this.dirty || this.sending) return;
    if (!force && now - this.lastSend < 40) return;
    this.lastSend = now;
    this.dirty = false;
    const c = new Uint8Array(47);
    c[0] = 0x04 | 0x08;          // 右/左扳机效果有效
    c[1] = 0x04;                 // 灯条有效
    c.set(this.right, 10);
    c.set(this.left, 21);
    if (!this.setupDone) { c[38] = 0x02; c[41] = 0x02; this.setupDone = true; } // 释放默认蓝色呼吸灯
    c[44] = this.rgb[0]; c[45] = this.rgb[1]; c[46] = this.rgb[2];

    let id = 0x02, data: Uint8Array = c;
    if (!this.bt) {
      // USB 输出报告 0x02 总长 63 字节（含 report id），数据部分 62 字节，补齐避免部分系统丢弃
      data = new Uint8Array(62);
      data.set(c, 0);
    } else {
      id = 0x31;
      data = new Uint8Array(77);
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
      .catch((e) => { console.warn('HID 发送失败', e); })
      .finally(() => { this.sending = false; });
  }
}

function same(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
