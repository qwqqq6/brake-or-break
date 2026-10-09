import { C, ROAD } from '../config';
import type { SpriteDef } from '../sim/road';
import { hash } from '../util';
import { burst, dots, font, roundRect } from './comic';

type Ctx = CanvasRenderingContext2D;
const lwOf = (ppm: number, k = 0.08) => Math.max(1, Math.min(6, ppm * k));

/** 路边装饰。(sx, sy) = 底部中心屏幕坐标，ppm = 每米像素 */
export function drawSprite(ctx: Ctx, sp: SpriteDef, sx: number, sy: number, ppm: number, night: boolean, t: number) {
  const lw = lwOf(ppm);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.INK;
  ctx.lineWidth = lw;
  switch (sp.kind) {
    case 'building': {
      const w = (sp.w ?? 10) * ppm, h = (sp.h ?? 10) * ppm;
      const x0 = sx - w / 2, y0 = sy - h;
      ctx.fillStyle = sp.color ?? '#ccc';
      ctx.fillRect(x0, y0, w, h);
      if (ppm > 1.4) {
        const cols = Math.max(1, Math.floor((sp.w ?? 10) / 2.8)), rows = Math.max(1, Math.floor(((sp.h ?? 10) - 2) / 3.4));
        const ww = 1.3 * ppm, wh = 1.7 * ppm;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const lit = night ? hash(sp.seed ?? 1, r, c) > 0.45 : false;
          ctx.fillStyle = night ? (lit ? C.YELLOW : '#1c2340') : '#a9def5';
          const wx = x0 + ((c + 0.5) * w) / cols - ww / 2, wy = y0 + 1.6 * ppm + r * 3.4 * ppm;
          ctx.fillRect(wx, wy, ww, wh);
          if (ppm > 4) ctx.strokeRect(wx, wy, ww, wh);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x0, y0, w, Math.max(2, ppm * 0.8));
      ctx.strokeRect(x0, y0, w, h);
      break;
    }
    case 'lamp': {
      const side = sp.x > 0 ? 1 : -1, h = 7 * ppm;
      ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = Math.max(1, ppm * 0.22);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - h); ctx.lineTo(sx - side * 1.8 * ppm, sy - h); ctx.stroke();
      ctx.fillStyle = night ? C.YELLOW : '#ddd';
      ctx.fillRect(sx - side * 1.8 * ppm - 0.5 * ppm, sy - h, ppm, 0.35 * ppm);
      if (night && ppm > 0.6) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(sx - side * 1.8 * ppm, sy - h, 0, sx - side * 1.8 * ppm, sy - h, 3 * ppm);
        g.addColorStop(0, 'rgba(255,220,120,0.5)'); g.addColorStop(1, 'rgba(255,220,120,0)');
        ctx.fillStyle = g; ctx.fillRect(sx - side * 1.8 * ppm - 3 * ppm, sy - h - 3 * ppm, 6 * ppm, 6 * ppm);
        ctx.restore();
      }
      break;
    }
    case 'tree': {
      ctx.fillStyle = C.BROWN; ctx.fillRect(sx - 0.25 * ppm, sy - 2.4 * ppm, 0.5 * ppm, 2.4 * ppm);
      ctx.strokeRect(sx - 0.25 * ppm, sy - 2.4 * ppm, 0.5 * ppm, 2.4 * ppm);
      const circles = [[0, -4, 1.9], [-1.2, -3.1, 1.3], [1.2, -3.2, 1.4]];
      ctx.lineWidth = lw * 2;
      for (const [dx, dy, r] of circles) { ctx.beginPath(); ctx.arc(sx + dx * ppm, sy + dy * ppm, r * ppm, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = (sp.seed ?? 0) % 3 === 0 ? '#3f9b46' : '#4caf50';
      for (const [dx, dy, r] of circles) { ctx.beginPath(); ctx.arc(sx + dx * ppm, sy + dy * ppm, r * ppm, 0, Math.PI * 2); ctx.fill(); }
      if (ppm > 3) { ctx.fillStyle = dots(ctx, 'rgba(0,0,0,0.25)', 6, 1.2); ctx.beginPath(); ctx.arc(sx + 0.5 * ppm, sy - 3.4 * ppm, 1.4 * ppm, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'pine': {
      ctx.fillStyle = C.BROWN; ctx.fillRect(sx - 0.2 * ppm, sy - 1.2 * ppm, 0.4 * ppm, 1.2 * ppm);
      for (let i = 0; i < 3; i++) {
        const y = sy - (1 + i * 1.6) * ppm, r = (2 - i * 0.5) * ppm;
        ctx.beginPath(); ctx.moveTo(sx - r, y); ctx.lineTo(sx + r, y); ctx.lineTo(sx, y - 2.6 * ppm); ctx.closePath();
        ctx.fillStyle = i % 2 ? '#2d6a4f' : '#40916c'; ctx.fill(); ctx.stroke();
      }
      break;
    }
    case 'bush': {
      ctx.beginPath(); ctx.ellipse(sx, sy - 0.5 * ppm, 1.2 * ppm, 0.7 * ppm, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#52b788'; ctx.fill(); ctx.stroke();
      break;
    }
    case 'cone': {
      ctx.beginPath(); ctx.moveTo(sx - 0.3 * ppm, sy); ctx.lineTo(sx + 0.3 * ppm, sy); ctx.lineTo(sx, sy - 0.8 * ppm); ctx.closePath();
      ctx.fillStyle = C.ORANGE; ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.WHITE; ctx.fillRect(sx - 0.15 * ppm, sy - 0.45 * ppm, 0.3 * ppm, 0.12 * ppm);
      break;
    }
    case 'fence': {
      ctx.fillStyle = C.WHITE;
      ctx.fillRect(sx - 0.1 * ppm, sy - 1.3 * ppm, 0.2 * ppm, 1.3 * ppm);
      ctx.strokeRect(sx - 0.1 * ppm, sy - 1.3 * ppm, 0.2 * ppm, 1.3 * ppm);
      ctx.fillRect(sx - 2.5 * ppm, sy - 1.1 * ppm, 5 * ppm, 0.18 * ppm);
      break;
    }
    case 'cliff': {
      const seed = sp.seed ?? 0;
      ctx.beginPath();
      ctx.moveTo(sx, sy); ctx.lineTo(sx + 0.5 * ppm, sy - 6 * ppm);
      ctx.lineTo(sx - 4 * ppm, sy - (18 + hash(seed) * 8) * ppm); ctx.lineTo(sx - 40 * ppm, sy - 30 * ppm); ctx.lineTo(sx - 40 * ppm, sy);
      ctx.closePath();
      ctx.fillStyle = seed % 2 ? '#8d6e63' : '#7d5e53'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 0.5 * ppm, sy - 6 * ppm); ctx.lineTo(sx - 4 * ppm, sy - (18 + hash(seed) * 8) * ppm); ctx.stroke();
      break;
    }
    case 'rail': {
      ctx.fillStyle = '#ddd';
      ctx.fillRect(sx - 0.1 * ppm, sy - 0.9 * ppm, 0.2 * ppm, 0.9 * ppm);
      ctx.fillStyle = '#c0c4cc'; ctx.fillRect(sx - 0.15 * ppm, sy - 0.85 * ppm, 0.3 * ppm, 0.35 * ppm);
      ctx.strokeRect(sx - 0.15 * ppm, sy - 0.85 * ppm, 0.3 * ppm, 0.35 * ppm);
      ctx.fillStyle = C.RED; ctx.fillRect(sx - 0.06 * ppm, sy - 0.75 * ppm, 0.12 * ppm, 0.12 * ppm);
      break;
    }
    case 'chevron': {
      const dir = sp.dir ?? 1;
      ctx.fillStyle = C.INK; ctx.fillRect(sx - 0.05 * ppm, sy - 1.2 * ppm, 0.1 * ppm, 1.2 * ppm);
      ctx.fillStyle = C.YELLOW; ctx.fillRect(sx - 0.5 * ppm, sy - 1.9 * ppm, ppm, 0.8 * ppm); ctx.strokeRect(sx - 0.5 * ppm, sy - 1.9 * ppm, ppm, 0.8 * ppm);
      ctx.beginPath(); ctx.moveTo(sx - dir * 0.25 * ppm, sy - 1.8 * ppm); ctx.lineTo(sx + dir * 0.2 * ppm, sy - 1.5 * ppm); ctx.lineTo(sx - dir * 0.25 * ppm, sy - 1.2 * ppm);
      ctx.lineWidth = Math.max(1, ppm * 0.12); ctx.stroke();
      break;
    }
    case 'stopsign': drawPost(ctx, sx, sy, ppm, 2.4); octagon(ctx, sx, sy - 2.6 * ppm, 0.55 * ppm, '停'); break;
    case 'finishsign': drawPost(ctx, sx, sy, ppm, 2.6); board(ctx, sx, sy - 2.9 * ppm, ppm, 2.2, 0.8, C.GREEN, '终点 →', C.WHITE); break;
    case 'ducksign': drawPost(ctx, sx, sy, ppm, 2.2); diamond(ctx, sx, sy - 2.6 * ppm, 0.6 * ppm, () => duckIcon(ctx, sx, sy - 2.6 * ppm, 0.32 * ppm)); break;
    case 'curvesign': {
      drawPost(ctx, sx, sy, ppm, 2.2);
      const dir = sp.dir ?? 1;
      diamond(ctx, sx, sy - 3.6 * ppm, 0.6 * ppm, () => {
        ctx.lineWidth = Math.max(1, ppm * 0.12); ctx.beginPath();
        ctx.moveTo(sx - dir * 0.15 * ppm, sy - 3.3 * ppm); ctx.lineTo(sx - dir * 0.15 * ppm, sy - 3.7 * ppm); ctx.lineTo(sx + dir * 0.2 * ppm, sy - 3.9 * ppm); ctx.stroke();
      });
      ctx.beginPath(); ctx.arc(sx, sy - 2.5 * ppm, 0.45 * ppm, 0, Math.PI * 2); ctx.fillStyle = C.WHITE; ctx.fill();
      ctx.lineWidth = Math.max(1, ppm * 0.1); ctx.strokeStyle = C.RED; ctx.stroke();
      if (ppm > 6) { ctx.fillStyle = C.INK; ctx.font = `${Math.round(0.45 * ppm)}px Bangers, Impact`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(sp.limit ?? 30), sx, sy - 2.48 * ppm); }
      break;
    }
    case 'billboard': {
      drawPost(ctx, sx - 1.5 * ppm, sy, ppm, 4); drawPost(ctx, sx + 1.5 * ppm, sy, ppm, 4);
      board(ctx, sx, sy - 5.2 * ppm, ppm, 5.4, 2.6, C.YELLOW, sp.text ?? '', C.INK);
      break;
    }
  }
}

function drawPost(ctx: Ctx, sx: number, sy: number, ppm: number, h: number) {
  ctx.fillStyle = '#6c757d';
  ctx.fillRect(sx - 0.06 * ppm, sy - h * ppm, 0.12 * ppm, h * ppm);
}
function octagon(ctx: Ctx, x: number, y: number, r: number, label: string) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath(); ctx.fillStyle = C.RED; ctx.fill(); ctx.lineWidth = Math.max(1, r * 0.12); ctx.stroke();
  if (r > 6) { ctx.fillStyle = C.WHITE; ctx.font = font(label, r); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y + 1); }
}
function diamond(ctx: Ctx, x: number, y: number, r: number, inner: () => void) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
  ctx.fillStyle = C.YELLOW; ctx.fill(); ctx.lineWidth = Math.max(1, r * 0.1); ctx.strokeStyle = C.INK; ctx.stroke();
  if (r > 5) inner();
}
function board(ctx: Ctx, x: number, y: number, ppm: number, w: number, h: number, bg: string, text: string, fg: string) {
  const bw = w * ppm, bh = h * ppm;
  ctx.fillStyle = bg; ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
  ctx.lineWidth = lwOf(ppm, 0.1); ctx.strokeStyle = C.INK; ctx.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
  if (ppm > 3 && text) {
    const size = Math.min(bh * 0.55, (bw * 0.9) / Math.max(2, text.length * 0.9));
    ctx.font = font(text, size); ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }
}
export function duckIcon(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = C.INK;
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.3, s, s * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.7, y - s * 0.4, s * 0.45, 0, Math.PI * 2); ctx.fill();
}

// ---------------- 动态物体 ----------------

/** 前车尾部 */
export function drawCarRear(ctx: Ctx, sx: number, sy: number, ppm: number, kind: 'car' | 'truck', color: string, braking: boolean, t: number) {
  const truck = kind === 'truck';
  const w = (truck ? 2.3 : 1.85) * ppm, h = (truck ? 3.1 : 1.45) * ppm;
  const lw = Math.max(1.5, ppm * 0.06);
  const x0 = sx - w / 2, y0 = sy - h - 0.25 * ppm;
  // 阴影
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.6, 0.18 * ppm, 0, 0, Math.PI * 2); ctx.fill();
  // 轮子
  ctx.fillStyle = C.INK;
  ctx.fillRect(x0 + 0.08 * ppm, sy - 0.55 * ppm, 0.32 * ppm, 0.55 * ppm);
  ctx.fillRect(x0 + w - 0.4 * ppm, sy - 0.55 * ppm, 0.32 * ppm, 0.55 * ppm);
  ctx.lineWidth = lw; ctx.strokeStyle = C.INK; ctx.lineJoin = 'round';
  if (truck) {
    ctx.fillStyle = color; ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 1; i < 5; i++) ctx.fillRect(x0 + (w * i) / 5 - lw / 2, y0 + 0.2 * ppm, lw, h - 0.6 * ppm);
    ctx.strokeRect(x0, y0, w, h);
    if (ppm > 8) { ctx.fillStyle = C.WHITE; ctx.font = font('货运', 0.4 * ppm); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('慢 · 货运', sx, y0 + h * 0.35); }
  } else {
    roundRect(ctx, x0, y0 + h * 0.35, w, h * 0.65, 0.2 * ppm);
    ctx.fillStyle = color; ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.12, y0 + h * 0.4); ctx.lineTo(x0 + w * 0.22, y0); ctx.lineTo(x0 + w * 0.78, y0); ctx.lineTo(x0 + w * 0.88, y0 + h * 0.4); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.2, y0 + h * 0.36); ctx.lineTo(x0 + w * 0.27, y0 + h * 0.07); ctx.lineTo(x0 + w * 0.73, y0 + h * 0.07); ctx.lineTo(x0 + w * 0.8, y0 + h * 0.36); ctx.closePath();
    ctx.fillStyle = '#243b55'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.moveTo(x0 + w * 0.32, y0 + h * 0.32); ctx.lineTo(x0 + w * 0.38, y0 + h * 0.1); ctx.lineTo(x0 + w * 0.46, y0 + h * 0.1); ctx.lineTo(x0 + w * 0.4, y0 + h * 0.32); ctx.fill();
  }
  // 保险杠 & 车牌
  ctx.fillStyle = '#2b2d42'; ctx.fillRect(x0 - 0.04 * ppm, sy - 0.62 * ppm, w + 0.08 * ppm, 0.24 * ppm);
  ctx.fillStyle = C.YELLOW; ctx.fillRect(sx - 0.26 * ppm, sy - 0.95 * ppm, 0.52 * ppm, 0.2 * ppm);
  ctx.lineWidth = Math.max(1, lw * 0.6); ctx.strokeRect(sx - 0.26 * ppm, sy - 0.95 * ppm, 0.52 * ppm, 0.2 * ppm);
  if (ppm > 14) { ctx.fillStyle = C.INK; ctx.font = `${0.15 * ppm}px Bangers, Impact`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('B·1600N', sx, sy - 0.85 * ppm); }
  // 尾灯
  const ly = truck ? sy - 1.0 * ppm : y0 + h * 0.5;
  const lc = braking ? '#ff2030' : '#8a1c24';
  ctx.fillStyle = lc;
  ctx.fillRect(x0 + 0.05 * ppm, ly, 0.38 * ppm, 0.2 * ppm);
  ctx.fillRect(x0 + w - 0.43 * ppm, ly, 0.38 * ppm, 0.2 * ppm);
  ctx.lineWidth = Math.max(1, lw * 0.6);
  ctx.strokeRect(x0 + 0.05 * ppm, ly, 0.38 * ppm, 0.2 * ppm);
  ctx.strokeRect(x0 + w - 0.43 * ppm, ly, 0.38 * ppm, 0.2 * ppm);
  if (braking) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const lx of [x0 + 0.24 * ppm, x0 + w - 0.24 * ppm]) {
      const r = 1.1 * ppm;
      const g = ctx.createRadialGradient(lx, ly + 0.1 * ppm, 0, lx, ly + 0.1 * ppm, r);
      g.addColorStop(0, 'rgba(255,60,60,0.85)'); g.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(lx - r, ly - r, r * 2, r * 2);
    }
    ctx.restore();
    if (ppm > 10 && Math.floor(t * 6) % 2 === 0) burst(ctx, sx, y0 - 0.4 * ppm, 0.5 * ppm, 0.3 * ppm, 8, C.RED, 2, 0, 2);
  }
}

/** 鸭子过马路：p 0..1 从右到左 */
export function drawDucks(ctx: Ctx, sx: number, sy: number, ppm: number, p: number, t: number) {
  const span = ROAD.HALF_W * 2 + 3;
  const baseX = (ROAD.HALF_W + 1.5) - p * span;
  const list = [[0, 0.5, '#ffffff'], [0.9, 0.3, C.YELLOW], [1.5, 0.3, C.YELLOW], [2.1, 0.3, C.YELLOW]] as const;
  for (const [off, size, col] of list) {
    const x = sx + (baseX + off) * ppm;
    const bob = Math.abs(Math.sin(t * 10 + off * 3)) * 0.06 * ppm;
    const s = size * ppm;
    ctx.lineWidth = Math.max(1, ppm * 0.04); ctx.strokeStyle = C.INK;
    ctx.fillStyle = C.ORANGE; ctx.fillRect(x - s * 0.2, sy - s * 0.3, s * 0.1, s * 0.3); ctx.fillRect(x + s * 0.1, sy - s * 0.3, s * 0.1, s * 0.3);
    ctx.beginPath(); ctx.ellipse(x, sy - s * 0.75 - bob, s * 0.7, s * 0.45, 0, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x - s * 0.45, sy - s * 1.35 - bob, s * 0.33, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.ORANGE; ctx.beginPath(); ctx.moveTo(x - s * 0.75, sy - s * 1.38 - bob); ctx.lineTo(x - s * 1.05, sy - s * 1.3 - bob); ctx.lineTo(x - s * 0.75, sy - s * 1.22 - bob); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.INK; ctx.beginPath(); ctx.arc(x - s * 0.52, sy - s * 1.42 - bob, Math.max(1, s * 0.06), 0, Math.PI * 2); ctx.fill();
  }
}

/** 货箱：p 0..1 下落，1..2 被移走 */
export function drawCrate(ctx: Ctx, sx: number, sy: number, ppm: number, p: number) {
  const s = 1.3 * ppm;
  const fall = p < 1 ? (1 - p * p) * 6 * ppm : 0;
  const slide = p > 1 ? (p - 1) * 6 * ppm : 0;
  const x = sx - s / 2 + slide, y = sy - s - fall;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx + slide, sy, s * 0.7, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c68642'; ctx.fillRect(x, y, s, s);
  ctx.lineWidth = Math.max(1.5, ppm * 0.07); ctx.strokeStyle = C.INK; ctx.strokeRect(x, y, s, s);
  ctx.strokeStyle = '#8a5a2b';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y); ctx.lineTo(x, y + s); ctx.stroke();
  ctx.strokeStyle = C.INK; ctx.strokeRect(x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.84);
  if (ppm > 10) { ctx.fillStyle = C.RED; ctx.font = font('易碎', s * 0.22); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('易碎', x + s / 2, y + s / 2); }
}

/** 红绿灯（悬臂式，立在右侧） */
export function drawLight(ctx: Ctx, sx: number, sy: number, ppm: number, state: 'green' | 'yellow' | 'red', t: number) {
  const px = sx + (ROAD.HALF_W + 0.8) * ppm;
  const top = sy - 6 * ppm;
  ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = Math.max(1.5, 0.22 * ppm);
  ctx.beginPath(); ctx.moveTo(px, sy); ctx.lineTo(px, top); ctx.lineTo(sx + 0.5 * ppm, top); ctx.stroke();
  const bx = sx + 1.2 * ppm, bw = 0.6 * ppm, bh = 1.6 * ppm;
  ctx.fillStyle = '#222'; ctx.fillRect(bx - bw / 2, top, bw, bh);
  ctx.lineWidth = Math.max(1, 0.06 * ppm); ctx.strokeStyle = C.INK; ctx.strokeRect(bx - bw / 2, top, bw, bh);
  const cols: ['red' | 'yellow' | 'green', string][] = [['red', '#ff3b3b'], ['yellow', '#ffd23f'], ['green', '#3ddc84']];
  cols.forEach(([k, c], i) => {
    const cy = top + (0.3 + i * 0.5) * ppm, on = k === state && (k !== 'yellow' || Math.floor(t * 4) % 2 === 0);
    ctx.beginPath(); ctx.arc(bx, cy, 0.19 * ppm, 0, Math.PI * 2);
    ctx.fillStyle = on ? c : '#444'; ctx.fill();
    if (on) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(bx, cy, 0, bx, cy, 1.4 * ppm);
      g.addColorStop(0, c + 'aa'); g.addColorStop(1, c + '00');
      ctx.fillStyle = g; ctx.fillRect(bx - 1.4 * ppm, cy - 1.4 * ppm, 2.8 * ppm, 2.8 * ppm);
      ctx.restore();
    }
  });
}

/** 终点仓库墙 */
export function drawWall(ctx: Ctx, sx: number, sy: number, ppm: number) {
  const w = (ROAD.HALF_W * 2 + 14) * ppm, h = 9 * ppm;
  const x0 = sx - w / 2, y0 = sy - h;
  ctx.fillStyle = '#e9c46a'; ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = hatchOrDots(ctx); ctx.fillRect(x0, y0, w, h);
  const dw = ROAD.HALF_W * 1.6 * ppm, dh = 5 * ppm;
  ctx.fillStyle = '#adb5bd'; ctx.fillRect(sx - dw / 2, sy - dh, dw, dh);
  ctx.strokeStyle = C.INK; ctx.lineWidth = lwOf(ppm, 0.08);
  for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(sx - dw / 2, sy - (dh * i) / 8); ctx.lineTo(sx + dw / 2, sy - (dh * i) / 8); ctx.stroke(); }
  ctx.strokeRect(sx - dw / 2, sy - dh, dw, dh);
  // 黄黑警示条
  const stripeH = 0.6 * ppm;
  for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? C.INK : C.YELLOW; ctx.fillRect(sx - dw / 2 + (dw * i) / 16, sy - dh - stripeH, dw / 16 + 1, stripeH); }
  ctx.strokeRect(x0, y0, w, h);
  if (ppm > 2) {
    ctx.fillStyle = C.RED; ctx.font = font('仓库', 1.4 * ppm); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('终点 · 仓库', sx, y0 + 1.6 * ppm);
  }
}
function hatchOrDots(ctx: Ctx) { return dots(ctx, 'rgba(0,0,0,0.12)', 8, 1.6); }
