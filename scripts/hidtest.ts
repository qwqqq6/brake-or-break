// 用假设备验证 DualSense 输出报告：长度、标志位、扳机/马达/灯条字节、蓝牙 CRC、长度回退
import { DualSenseHID, feedbackEffect } from '../src/input/dualsense-hid';

type Sent = { id: number; data: Uint8Array };
function fakeDevice(bt: boolean, declared: number, accept: (len: number) => boolean) {
  const sent: Sent[] = [];
  const dev = {
    opened: false, vendorId: 0x054c, productId: 0x0ce6, productName: 'DualSense',
    collections: [{ outputReports: [{ reportId: bt ? 0x31 : 0x02, items: [{ reportSize: 8, reportCount: declared }] }] }],
    async open() { dev.opened = true; },
    async close() {},
    async receiveFeatureReport() { return new DataView(new ArrayBuffer(41)); },
    async sendReport(id: number, data: Uint8Array) { if (!accept(data.length)) throw new Error('bad length'); sent.push({ id, data: new Uint8Array(data) }); },
  };
  return { dev, sent };
}

function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return (c ^ 0xffffffff) >>> 0;
}
const tick = () => new Promise((r) => setTimeout(r, 0));
let fail = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) fail++; };

Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { hid: { addEventListener() {}, getDevices: async () => [], requestDevice: async () => [] } } });

async function run(bt: boolean, declared: number, accept: (n: number) => boolean, label: string) {
  const { dev, sent } = fakeDevice(bt, declared, accept);
  const h = new DualSenseHID();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (h as any).open(dev);
  const fx = feedbackEffect([3, 3, 4, 4, 5, 5, 6, 7, 8, 8]);
  h.setLeft(fx); h.setMotor(1, 0.5); h.setLight(255, 0, 0);
  let now = 1000;
  for (let i = 0; i < 6 && !sent.length; i++) { h.flush(now); await tick(); await tick(); now += 20; h.setLight(i % 2 ? 255 : 0, 0, 0); }
  check(`${label}: 报告已发送`, sent.length > 0);
  if (!sent.length) return;
  const r = sent[0];
  const off = bt ? 2 : 0;
  check(`${label}: report id = ${bt ? '0x31' : '0x02'}`, r.id === (bt ? 0x31 : 0x02));
  check(`${label}: 标志位含扳机+马达`, (r.data[off] & 0x0f) === 0x0f);
  check(`${label}: 左扳机效果在偏移 21`, r.data.subarray(off + 21, off + 32).every((v, i) => v === fx[i]));
  check(`${label}: 马达字节`, r.data[off + 3] === 255 && r.data[off + 2] === 128);
  if (bt) {
    const buf = new Uint8Array(75); buf[0] = 0xa2; buf[1] = 0x31; buf.set(r.data.subarray(0, 73), 2);
    const c = crc32(buf);
    check(`${label}: 蓝牙 CRC 正确`, r.data[73] === (c & 0xff) && r.data[76] === (c >>> 24));
  }
  console.log(`      发送长度 = ${r.data.length}`);
}

await run(false, 47, () => true, 'USB 描述符 47');
await run(false, 63, (n) => n === 63, 'USB 描述符 63');
await run(false, 0, (n) => n === 62, 'USB 无描述符, 系统只收 62');
await run(true, 77, () => true, '蓝牙');
process.exit(fail ? 1 : 0);
