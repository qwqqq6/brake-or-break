import { C, H, PEDAL, W } from '../config';
import { clamp } from '../util';
import { caption, dots, font, hatch, roundRect, sfx } from './comic';

type Ctx = CanvasRenderingContext2D;

export const GAUGE = { x: 640, y: 694, r: 124 };
export const SPEEDO = { x: 150, y: 632, r: 72 };
export const CUP = { x: 330, y: 482 };
export const PEDAL_CAM = { x: 905, y: 452, w: 368, h: 262 };

export interface CockpitView {
  force: number; threshold: number; peak: number; speed: number; temp: number; fatigue: number;
  coffee: number; diceLon: number; diceLat: number; wheel: number; t: number;
  locked: boolean; fade: number; tailgater: boolean; honk: boolean; mass: number;
}

let staticLayer: HTMLCanvasElement | null = null;

function buildStatic(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.lineJoin = 'round';
  // 车顶 + 遮阳板
  g.fillStyle = '#22304f';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, 30); g.quadraticCurveTo(W / 2, 46, 0, 30); g.closePath(); g.fill();
  g.lineWidth = 5; g.strokeStyle = C.INK; g.stroke();
  g.fillStyle = '#34466e';
  roundRect(g, 120, 18, 300, 34, 10); g.fill(); g.stroke();
  roundRect(g, 860, 18, 300, 34, 10); g.fill(); g.stroke();
  g.fillStyle = dots(g, 'rgba(0,0,0,0.25)', 6, 1.3);
  roundRect(g, 120, 18, 300, 34, 10); g.fill();
  roundRect(g, 860, 18, 300, 34, 10); g.fill();
  // A 柱
  for (const side of [0, 1]) {
    const pts = side === 0 ? [0, 0, 128, 0, 40, 520, 0, 520] : [W, 0, W - 128, 0, W - 40, 520, W, 520];
    g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < 8; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath();
    g.fillStyle = '#1e2a47'; g.fill();
    g.fillStyle = hatch(g, 'rgba(0,0,0,0.35)', 7, 1.5); g.fill();
    g.lineWidth = 6; g.strokeStyle = C.INK; g.stroke();
    g.strokeStyle = '#3d5285'; g.lineWidth = 4;
    g.beginPath(); side === 0 ? (g.moveTo(112, 6), g.lineTo(30, 500)) : (g.moveTo(W - 112, 6), g.lineTo(W - 30, 500)); g.stroke();
  }
  // 后视镜支架
  g.fillStyle = '#2b2d42'; g.fillRect(632, 26, 16, 22); g.strokeStyle = C.INK; g.lineWidth = 3; g.strokeRect(632, 26, 16, 22);
  // 仪表台
  g.beginPath();
  g.moveTo(0, H); g.lineTo(0, 505);
  g.bezierCurveTo(180, 462, 360, 468, 640, 470);
  g.bezierCurveTo(920, 468, 1100, 462, W, 505);
  g.lineTo(W, H); g.closePath();
  const dg = g.createLinearGradient(0, 460, 0, H);
  dg.addColorStop(0, '#3c5179'); dg.addColorStop(0.12, '#2b3a5a'); dg.addColorStop(1, '#1b2640');
  g.fillStyle = dg; g.fill();
  g.fillStyle = dots(g, 'rgba(0,0,0,0.28)', 7, 1.6); g.fill();
  g.lineWidth = 6; g.strokeStyle = C.INK; g.stroke();
  // 仪表台高光
  g.strokeStyle = '#5c75a8'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(30, 500); g.bezierCurveTo(200, 470, 360, 476, 640, 478); g.bezierCurveTo(920, 476, 1080, 470, W - 30, 500); g.stroke();
  // 速度表底座
  g.fillStyle = '#141b2e'; g.beginPath(); g.arc(SPEEDO.x, SPEEDO.y, SPEEDO.r + 12, 0, Math.PI * 2); g.fill();
  g.lineWidth = 5; g.strokeStyle = C.INK; g.stroke();
  // 温度/疲劳条底座
  g.fillStyle = '#141b2e'; roundRect(g, 238, 560, 92, 150, 10); g.fill(); g.stroke();
  // 踏板力表底座
  g.fillStyle = '#141b2e'; g.beginPath(); g.arc(GAUGE.x, GAUGE.y, GAUGE.r + 16, Math.PI, Math.PI * 2); g.closePath(); g.fill(); g.stroke();
  // 警示贴纸
  g.save(); g.translate(205, 440); g.rotate(-0.12);
  g.fillStyle = C.YELLOW; g.fillRect(-58, -22, 116, 44); g.lineWidth = 3; g.strokeStyle = C.INK; g.strokeRect(-58, -22, 116, 44);
  g.fillStyle = C.INK; g.font = font('最大', 15); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('⚠ 踏板最大', 0, -8); g.font = `22px 'Bangers', Impact`; g.fillText('1600N!', 0, 11);
  g.restore();
  return c;
}

export function drawCockpit(ctx: Ctx, v: CockpitView) {
  if (!staticLayer) staticLayer = buildStatic();
  ctx.drawImage(staticLayer, 0, 0);
  drawMirror(ctx, v);
  drawDiceTop(ctx, v);
  drawCup(ctx, v);
  drawSpeedo(ctx, v);
  drawBars(ctx, v);
  drawWheel(ctx, v);
  drawForceGauge(ctx, v);
}

function drawMirror(ctx: Ctx, v: CockpitView) {
  ctx.save();
  roundRect(ctx, 530, 44, 220, 54, 12);
  ctx.fillStyle = '#2b2d42'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = C.INK; ctx.stroke();
  roundRect(ctx, 538, 50, 204, 42, 8); ctx.clip();
  const g = ctx.createLinearGradient(0, 50, 0, 92); g.addColorStop(0, '#9fd8ef'); g.addColorStop(1, '#6c7a89');
  ctx.fillStyle = g; ctx.fillRect(538, 50, 204, 42);
  ctx.fillStyle = '#555b66'; ctx.beginPath(); ctx.moveTo(600, 92); ctx.lineTo(680, 92); ctx.lineTo(648, 72); ctx.lineTo(632, 72); ctx.fill();
  if (v.tailgater) {
    // 后车车头
    ctx.fillStyle = '#e9ecef'; roundRect(ctx, 590, 62, 100, 34, 8); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = C.INK; ctx.stroke();
    ctx.fillStyle = '#243b55'; ctx.fillRect(602, 54, 76, 14); ctx.strokeRect(602, 54, 76, 14);
    ctx.fillStyle = C.YELLOW; ctx.beginPath(); ctx.arc(604, 78, 7, 0, Math.PI * 2); ctx.arc(676, 78, 7, 0, Math.PI * 2); ctx.fill();
    if (v.honk) sfx(ctx, 'HONK!', 640, 70, 26, C.RED, { rot: -0.1 });
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(545, 52, 60, 4);
}

function dicePos(v: CockpitView) {
  const ax = 640, ay = 98;
  const ang = v.diceLat * 0.9;
  const len = 70 - v.diceLon * 22;
  return { ax, ay, x: ax + Math.sin(ang) * len, y: ay + Math.cos(ang) * len, scale: 1 - v.diceLon * 0.18, ang };
}
function drawDiceTop(ctx: Ctx, v: CockpitView) {
  const p = dicePos(v);
  ctx.strokeStyle = C.INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(p.ax, p.ay); ctx.lineTo(p.x - 8, p.y - 10); ctx.moveTo(p.ax, p.ay); ctx.lineTo(p.x + 10, p.y - 6); ctx.stroke();
  for (const [dx, dy, rot, col] of [[-12, 0, 0.3, C.RED], [12, 6, -0.4, C.WHITE]] as const) {
    ctx.save(); ctx.translate(p.x + dx * p.scale, p.y + dy * p.scale); ctx.rotate(rot + p.ang * 0.8); ctx.scale(p.scale, p.scale);
    roundRect(ctx, -12, -12, 24, 24, 5); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = col === C.RED ? C.WHITE : C.INK;
    for (const [px, py] of [[-5, -5], [5, 5], [0, 0], [5, -5], [-5, 5]]) { ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}

function drawCup(ctx: Ctx, v: CockpitView) {
  const { x, y } = CUP;
  const tilt = clamp(v.diceLon * 0.6, -0.5, 0.5);
  ctx.save();
  ctx.translate(x, y);
  // 杯身
  ctx.beginPath(); ctx.moveTo(-26, -52); ctx.lineTo(26, -52); ctx.lineTo(20, 0); ctx.lineTo(-20, 0); ctx.closePath();
  ctx.fillStyle = C.WHITE; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = C.INK; ctx.stroke();
  ctx.fillStyle = C.RED; ctx.beginPath(); ctx.moveTo(-24, -34); ctx.lineTo(24, -34); ctx.lineTo(22, -18); ctx.lineTo(-22, -18); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.WHITE; ctx.font = `13px 'Bangers', Impact`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('COFFEE', 0, -26);
  ctx.beginPath(); ctx.arc(30, -30, 10, -Math.PI / 2, Math.PI / 2); ctx.lineWidth = 5; ctx.stroke();
  // 液面
  ctx.beginPath(); ctx.ellipse(0, -52, 26, 7, 0, 0, Math.PI * 2); ctx.fillStyle = '#f0e6d2'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
  if (v.coffee > 0) {
    const lvl = 1 - v.coffee / 100;
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, -52, 24, 6, 0, 0, Math.PI * 2); ctx.clip();
    ctx.translate(0, -52 + lvl * 8); ctx.rotate(tilt);
    ctx.fillStyle = '#6f4518'; ctx.fillRect(-30, -2, 60, 20);
    ctx.restore();
  }
  ctx.restore();
}

function drawSpeedo(ctx: Ctx, v: CockpitView) {
  const { x, y, r } = SPEEDO;
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = C.PAPER; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = C.INK; ctx.stroke();
  ctx.fillStyle = dots(ctx, 'rgba(0,0,0,0.12)', 6, 1.2); ctx.fill();
  ctx.lineWidth = 2;
  for (let k = 0; k <= 12; k++) {
    const a = a0 + ((a1 - a0) * k) / 12;
    const r0 = k % 2 === 0 ? r - 14 : r - 8;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * (r - 3), y + Math.sin(a) * (r - 3)); ctx.stroke();
    if (k % 2 === 0) { ctx.fillStyle = C.INK; ctx.font = `14px 'Bangers', Impact`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(k * 10), x + Math.cos(a) * (r - 26), y + Math.sin(a) * (r - 26)); }
  }
  const kmh = Math.abs(v.speed) * 3.6;
  const a = a0 + (a1 - a0) * clamp(kmh / 120, 0, 1);
  ctx.strokeStyle = C.RED; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (r - 12), y + Math.sin(a) * (r - 12)); ctx.stroke();
  ctx.fillStyle = C.INK; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
  ctx.font = `26px 'Bangers', Impact`; ctx.fillStyle = C.INK; ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(kmh)), x, y + 34);
  ctx.font = `11px 'Bangers', Impact`; ctx.fillText('KM/H', x, y + 52);
  ctx.restore();
}

function drawBars(ctx: Ctx, v: CockpitView) {
  const bars: [string, number, string][] = [['温度', v.temp, v.temp > 0.55 ? C.RED : C.ORANGE], ['疲劳', v.fatigue, v.fatigue > 0.5 ? C.RED : C.YELLOW]];
  bars.forEach(([label, val, col], i) => {
    const x = 252 + i * 40, y = 574, h = 108;
    ctx.fillStyle = '#0b0f1a'; ctx.fillRect(x, y, 24, h);
    ctx.fillStyle = col; ctx.fillRect(x, y + h * (1 - val), 24, h * val);
    ctx.fillStyle = dots(ctx, 'rgba(0,0,0,0.35)', 5, 1); ctx.fillRect(x, y + h * (1 - val), 24, h * val);
    ctx.lineWidth = 2.5; ctx.strokeStyle = C.INK; ctx.strokeRect(x, y, 24, h);
    ctx.fillStyle = C.WHITE; ctx.font = font(label, 13); ctx.textAlign = 'center'; ctx.fillText(label, x + 12, y + h + 16);
  });
  if (v.fade < 0.95 && Math.floor(v.t * 3) % 2 === 0) caption(ctx, '刹车过热!', 290, 528, { size: 14, bg: C.RED, fg: C.WHITE });
  if (v.mass > 2000) { ctx.fillStyle = C.ORANGE; ctx.font = font('载重', 12); ctx.textAlign = 'center'; ctx.fillText(`载重 ${Math.round(v.mass)}kg`, 150, 712); }
}

function drawWheel(ctx: Ctx, v: CockpitView) {
  const cx = 640, cy = 910, r = 300;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(v.wheel);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 1.05, Math.PI * 1.95);
  ctx.lineWidth = 50; ctx.strokeStyle = C.INK; ctx.stroke();
  ctx.lineWidth = 40; ctx.strokeStyle = '#2b2b2b'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r - 8, Math.PI * 1.15, Math.PI * 1.4); ctx.lineWidth = 6; ctx.strokeStyle = '#5a5a5a'; ctx.stroke();
  // 握把
  for (const s of [-1, 1]) {
    ctx.save(); ctx.rotate(s * 0.62);
    ctx.fillStyle = C.RED; roundRect(ctx, -22, -r - 24, 44, 48, 10); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = C.INK; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawForceGauge(ctx: Ctx, v: CockpitView) {
  const { x, y, r } = GAUGE;
  const thr = v.threshold;
  const toA = (f: number) => Math.PI + (clamp(f, 0, PEDAL.FMAX) / PEDAL.FMAX) * Math.PI;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, Math.PI, Math.PI * 2); ctx.closePath();
  ctx.fillStyle = C.PAPER; ctx.fill();
  ctx.fillStyle = dots(ctx, 'rgba(0,0,0,0.1)', 6, 1.2); ctx.fill();
  // 色区
  const zone = (f0: number, f1: number, col: string) => {
    ctx.beginPath(); ctx.arc(x, y, r - 12, toA(f0), toA(f1)); ctx.lineWidth = 20; ctx.strokeStyle = col; ctx.stroke();
  };
  zone(0, PEDAL.FATIGUE_START, C.GREEN);
  zone(PEDAL.FATIGUE_START, thr, C.YELLOW);
  zone(thr, PEDAL.FMAX, C.RED);
  ctx.fillStyle = hatch(ctx, 'rgba(0,0,0,0.5)', 6, 2);
  ctx.beginPath(); ctx.arc(x, y, r - 2, toA(thr), toA(PEDAL.FMAX)); ctx.arc(x, y, r - 22, toA(PEDAL.FMAX), toA(thr), true); ctx.closePath(); ctx.fill();
  // 刻度
  ctx.strokeStyle = C.INK; ctx.fillStyle = C.INK;
  for (let f = 0; f <= PEDAL.FMAX; f += 100) {
    const a = toA(f), major = f % 400 === 0;
    const r0 = major ? r - 34 : r - 26;
    ctx.lineWidth = major ? 3 : 1.5;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * (r - 22), y + Math.sin(a) * (r - 22)); ctx.stroke();
    if (major) { ctx.font = `15px 'Bangers', Impact`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(f), x + Math.cos(a) * (r - 48), y + Math.sin(a) * (r - 48)); }
  }
  // 断点标记
  const ta = toA(thr);
  ctx.strokeStyle = C.RED; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x + Math.cos(ta) * (r - 40), y + Math.sin(ta) * (r - 40)); ctx.lineTo(x + Math.cos(ta) * (r + 6), y + Math.sin(ta) * (r + 6)); ctx.stroke();
  // 峰值幽灵指针
  if (v.peak > 50) {
    const pa = toA(v.peak);
    ctx.strokeStyle = 'rgba(230,57,70,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(pa) * (r - 20), y + Math.sin(pa) * (r - 20)); ctx.stroke();
  }
  // 指针（进入黄区开始抖）
  const stress = clamp((v.force - PEDAL.FATIGUE_START) / (thr - PEDAL.FATIGUE_START), 0, 1);
  const jit = stress > 0 ? Math.sin(v.t * 70) * 0.025 * stress : 0;
  const na = toA(v.force) + jit;
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.INK; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(na) * (r - 16), y + Math.sin(na) * (r - 16)); ctx.stroke();
  ctx.strokeStyle = stress > 0.6 ? C.RED : C.ORANGE; ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = C.INK; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, Math.PI, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = C.INK; ctx.stroke();
  // 读数
  const fcol = v.force > thr - 150 ? C.RED : v.force > PEDAL.FATIGUE_START ? C.ORANGE : C.INK;
  ctx.font = font('踏板力', 12); ctx.fillStyle = C.INK; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('踏板力 PEDAL FORCE', x, y - 64);
  ctx.font = `40px 'Bangers', Impact`; ctx.fillStyle = fcol;
  ctx.fillText(`${Math.round(v.force)}N`, x, y - 22);
  ctx.restore();
  if (v.locked) caption(ctx, 'LOCK! 抱死', x + 150, 520, { size: 16, bg: C.RED, fg: C.WHITE, rot: 0.06 });
}

