import { C, FONT_CN, FONT_EN } from '../config';

type Ctx = CanvasRenderingContext2D;
const CJK = /[\u3000-\u9fff\uff00-\uffef]/;

export function font(text: string, size: number) {
  return CJK.test(text) ? `900 ${size}px ${FONT_CN}` : `${size}px ${FONT_EN}`;
}

const patCache = new Map<string, CanvasPattern>();
/** 美漫网点图案 */
export function dots(ctx: Ctx, color: string, step = 8, r = 1.6, bg?: string): CanvasPattern {
  const key = `${color}|${step}|${r}|${bg}`;
  let p = patCache.get(key);
  if (!p) {
    const c = document.createElement('canvas');
    c.width = step; c.height = step;
    const g = c.getContext('2d')!;
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, step, step); }
    g.fillStyle = color;
    for (const [x, y] of [[step / 4, step / 4], [(step * 3) / 4, (step * 3) / 4]]) {
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    p = ctx.createPattern(c, 'repeat')!;
    patCache.set(key, p);
  }
  return p;
}

const linePat = new Map<string, CanvasPattern>();
export function hatch(ctx: Ctx, color: string, step = 7, lw = 1.5): CanvasPattern {
  const key = `${color}|${step}|${lw}`;
  let p = linePat.get(key);
  if (!p) {
    const c = document.createElement('canvas');
    c.width = step; c.height = step;
    const g = c.getContext('2d')!;
    g.strokeStyle = color; g.lineWidth = lw;
    g.beginPath(); g.moveTo(0, step); g.lineTo(step, 0); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(step - 1, step + 1); g.lineTo(step + 1, step - 1); g.stroke();
    p = ctx.createPattern(c, 'repeat')!;
    linePat.set(key, p);
  }
  return p;
}

export function poly(ctx: Ctx, pts: number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

export function inkPoly(ctx: Ctx, pts: number[], fill: string | CanvasPattern, lw = 4, stroke = C.INK) {
  poly(ctx, pts);
  ctx.fillStyle = fill; ctx.fill();
  if (lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function starPath(ctx: Ctx, x: number, y: number, rOut: number, rIn: number, n: number, rot = 0, seed = 1) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const j = 1 + Math.sin(seed * 13.7 + i * 7.3) * 0.12;
    const r = (i % 2 === 0 ? rOut : rIn) * j;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function burst(ctx: Ctx, x: number, y: number, rOut: number, rIn: number, n: number, fill: string, lw = 5, rot = 0, seed = 1) {
  starPath(ctx, x, y, rOut, rIn, n, rot, seed);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = C.INK; ctx.lineJoin = 'miter'; ctx.stroke();
}

/** 拟声字：粗描边 + 投影 */
export function sfx(ctx: Ctx, text: string, x: number, y: number, size: number, fill: string,
  o: { rot?: number; stroke?: string; lw?: number; align?: CanvasTextAlign; shadow?: boolean; skew?: number } = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  if (o.skew) ctx.transform(1, 0, o.skew, 1, 0, 0);
  ctx.font = font(text, size);
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const lw = o.lw ?? Math.max(3, size * 0.16);
  if (o.shadow !== false) {
    ctx.fillStyle = C.INK; ctx.strokeStyle = C.INK; ctx.lineWidth = lw;
    ctx.strokeText(text, size * 0.06, size * 0.08); ctx.fillText(text, size * 0.06, size * 0.08);
  }
  ctx.strokeStyle = o.stroke ?? C.INK; ctx.lineWidth = lw;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** 漫画旁白框 */
export function caption(ctx: Ctx, text: string, x: number, y: number,
  o: { size?: number; bg?: string; fg?: string; align?: 'left' | 'center' | 'right'; rot?: number; pad?: number; minW?: number } = {}) {
  const size = o.size ?? 22, pad = o.pad ?? 10;
  ctx.save();
  ctx.font = font(text, size);
  const tw = Math.max(o.minW ?? 0, ctx.measureText(text).width);
  const w = tw + pad * 2, h = size + pad * 1.3;
  let bx = x;
  if (o.align === 'center' || !o.align) bx = x - w / 2;
  else if (o.align === 'right') bx = x - w;
  ctx.translate(bx + w / 2, y + h / 2);
  if (o.rot) ctx.rotate(o.rot);
  ctx.fillStyle = C.INK;
  ctx.fillRect(-w / 2 + 4, -h / 2 + 4, w, h);
  ctx.fillStyle = o.bg ?? C.YELLOW;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.lineWidth = 3; ctx.strokeStyle = C.INK;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = o.fg ?? C.INK;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 2);
  ctx.restore();
  return { w, h };
}

/** 集中线 / 速度线 */
export function speedLines(ctx: Ctx, cx: number, cy: number, rIn: number, rOut: number, n: number, color: string, seed = 1, lw = 3) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.sin(seed + i * 12.9898) * 0.05;
    const r0 = rIn * (1 + Math.abs(Math.sin(seed * 3 + i * 78.233)) * 0.5);
    ctx.lineWidth = lw * (0.5 + Math.abs(Math.sin(i * 4.1 + seed)));
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut);
    ctx.stroke();
  }
  ctx.restore();
}

/** 对白气泡 */
export function bubble(ctx: Ctx, text: string, x: number, y: number, size: number, tailX: number, tailY: number, shout = false) {
  ctx.save();
  ctx.font = font(text, size);
  const tw = ctx.measureText(text).width;
  const w = tw * 1.2 + size * 1.6, h = size * 2.2;
  if (shout) {
    starPath(ctx, x, y, w * 0.62, w * 0.5, 14, 0, 3);
  } else {
    ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
  }
  ctx.fillStyle = C.WHITE; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = C.INK; ctx.stroke();
  // 尾巴
  ctx.beginPath();
  ctx.moveTo(x - size * 0.4, y + h * 0.3); ctx.lineTo(tailX, tailY); ctx.lineTo(x + size * 0.3, y + h * 0.36);
  ctx.fillStyle = C.WHITE; ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.WHITE; ctx.beginPath(); ctx.ellipse(x, y + h * 0.25, size * 0.6, size * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 2);
  ctx.restore();
}

/** 漫画分格：白边 + 黑框 */
export function panel(ctx: Ctx, pts: number[], draw: () => void) {
  ctx.save();
  poly(ctx, pts);
  ctx.lineWidth = 16; ctx.strokeStyle = C.WHITE; ctx.lineJoin = 'miter'; ctx.stroke();
  ctx.save();
  poly(ctx, pts);
  ctx.clip();
  draw();
  ctx.restore();
  poly(ctx, pts);
  ctx.lineWidth = 6; ctx.strokeStyle = C.INK; ctx.stroke();
  ctx.restore();
}
