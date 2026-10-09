import { C, H, ROAD, VAN, W } from '../config';
import type { Road, Seg } from '../sim/road';
import type { Sky, Theme } from '../levels';
import { mix } from '../util';
import { drawSprite } from './sprites';

type Ctx = CanvasRenderingContext2D;

export interface Palette {
  skyTop: string; skyBot: string; fog: string;
  ground1: string; ground2: string;
  road1: string; road2: string;
  rumble1: string; rumble2: string; lane: string;
}

export function palette(theme: Theme, sky: Sky, rain: boolean): Palette {
  const skies: Record<Sky, [string, string, string]> = {
    day: rain ? ['#7a8a99', '#b8c4cc', '#c0c8cf'] : ['#3fb8f0', '#bfeaff', '#d6f1ff'],
    dusk: ['#ff6b6b', '#ffd166', '#ffd9a0'],
    night: rain ? ['#070b16', '#1e2638', '#1e2638'] : ['#0b1026', '#2a2f5a', '#2a2f5a'],
  };
  const grounds: Record<Theme, [string, string]> = {
    yard: ['#e8d8b0', '#dccb9f'],
    city: ['#b9b9c4', '#aeaeb9'],
  };
  const [skyTop, skyBot, fog] = skies[sky];
  const [ground1, ground2] = grounds[theme];
  return {
    skyTop, skyBot, fog, ground1, ground2,
    road1: rain ? '#3d414c' : '#4a4e5a', road2: rain ? '#3a3e49' : '#464a56',
    rumble1: C.RED, rumble2: C.WHITE,
    lane: theme === 'yard' ? C.YELLOW : C.WHITE,
  };
}

export interface Dyn { s: number; x: number; draw: (ctx: Ctx, sx: number, sy: number, ppm: number) => void }

const DEPTH = 1 / Math.tan(((ROAD.FOV / 2) * Math.PI) / 180);
const HALF = W / 2;
interface Proj { x1: number; y1: number; w1: number; s1: number; x2: number; y2: number; w2: number; s2: number; clip: number; seg: Seg | null; z1: number }
const projs: Proj[] = Array.from({ length: ROAD.DRAW }, () => ({ x1: 0, y1: 0, w1: 0, s1: 0, x2: 0, y2: 0, w2: 0, s2: 0, clip: 0, seg: null, z1: 0 }));

export interface RoadView {
  road: Road; camS: number; horizon: number; pal: Palette; dyns: Dyn[]; shakeX: number; night: boolean; t: number;
}

/** 伪 3D 道路渲染：由近到远画路面（带遮挡裁剪），再由远到近画精灵 */
export function drawRoad(ctx: Ctx, v: RoadView) {
  const { road, camS, horizon, pal } = v;
  const SEG = ROAD.SEG;
  const baseI = Math.floor(camS / SEG);
  const base = road.seg(baseI);
  const pct = (camS - base.z) / SEG;
  const camY = road.heightAt(camS) + VAN.EYE_H;
  let x = 0, dx = -base.curve * pct;
  let maxy = H;

  const buckets: Dyn[][] = [];
  for (const d of v.dyns) {
    const idx = Math.floor(d.s / SEG) - baseI;
    if (idx >= 0 && idx < ROAD.DRAW) (buckets[idx] ||= []).push(d);
  }

  for (let n = 0; n < ROAD.DRAW; n++) {
    const seg = road.seg(baseI + n);
    const p = projs[n];
    const z1 = seg.z - camS, z2 = z1 + SEG;
    const s1 = DEPTH / Math.max(z1, 0.4), s2 = DEPTH / Math.max(z2, 0.4);
    p.z1 = z1;
    p.x1 = HALF + s1 * x * HALF + v.shakeX; p.x2 = HALF + s2 * (x + dx) * HALF + v.shakeX;
    p.y1 = horizon - s1 * (seg.y1 - camY) * HALF; p.y2 = horizon - s2 * (seg.y2 - camY) * HALF;
    p.w1 = s1 * ROAD.HALF_W * HALF; p.w2 = s2 * ROAD.HALF_W * HALF;
    p.s1 = s1; p.s2 = s2; p.clip = maxy; p.seg = seg;
    x += dx; dx += seg.curve;
    if (p.y2 >= maxy || p.y2 >= p.y1 - 0.01) continue;

    let X1 = p.x1, Y1 = p.y1, W1 = p.w1;
    if (Y1 > maxy) {
      const tt = (maxy - p.y2) / (p.y1 - p.y2);
      X1 = p.x2 + (p.x1 - p.x2) * tt; W1 = p.w2 + (p.w1 - p.w2) * tt; Y1 = maxy;
    }
    const fogT = Math.pow(n / ROAD.DRAW, 1.4) * 0.85;
    const band = Math.floor(seg.i / 3) % 2;
    const f = (c: string) => (fogT > 0.02 ? mix(c, pal.fog, fogT) : c);
    drawSegment(ctx, X1, Y1, W1, p.x2, p.y2, p.w2, band, f, pal, n);

    for (const dc of seg.decals) {
      const fr = (dc.s - seg.z) / SEG, fr2 = fr + 0.7 / SEG;
      const ax = p.x1 + (p.x2 - p.x1) * fr, ay = p.y1 + (p.y2 - p.y1) * fr, aw = p.w1 + (p.w2 - p.w1) * fr;
      const bx = p.x1 + (p.x2 - p.x1) * fr2, by = p.y1 + (p.y2 - p.y1) * fr2, bw = p.w1 + (p.w2 - p.w1) * fr2;
      if (ay > maxy + 2 && by > maxy) continue;
      ctx.beginPath(); ctx.moveTo(ax - aw * 0.95, ay); ctx.lineTo(ax + aw * 0.95, ay); ctx.lineTo(bx + bw * 0.95, by); ctx.lineTo(bx - bw * 0.95, by); ctx.closePath();
      ctx.fillStyle = dc.kind === 'finish' ? C.YELLOW : C.WHITE; ctx.fill();
      ctx.lineWidth = Math.max(1, s1 * 2); ctx.strokeStyle = C.INK; ctx.stroke();
      if (dc.kind === 'finish' && ay - by > 3) {
        for (let k = 0; k < 10; k += 2) {
          const l = -0.95 + (k / 10) * 1.9, r = l + 0.19;
          ctx.fillStyle = C.INK;
          ctx.beginPath(); ctx.moveTo(ax + aw * l, ay); ctx.lineTo(ax + aw * r, ay); ctx.lineTo(bx + bw * r, by); ctx.lineTo(bx + bw * l, by); ctx.fill();
        }
      }
    }
    maxy = p.y2;
  }

  // 精灵：远 → 近
  for (let n = ROAD.DRAW - 1; n >= 0; n--) {
    const p = projs[n];
    const seg = p.seg!;
    const list = buckets[n];
    if (p.z1 < 1.2 && !list) continue;
    const ppm = p.s1 * HALF;
    const needClip = p.clip < H;
    if (needClip) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, p.clip); ctx.clip(); }
    if (p.z1 >= 1.2) {
      for (const sp of seg.sprites) {
        const sx = p.x1 + sp.x * ppm;
        const half = ((sp.w ?? 4) / 2 + 40) * ppm;
        if (sx + half < -50 || sx - half > W + 50) continue;
        drawSprite(ctx, sp, sx, p.y1, ppm, v.night, v.t);
      }
    }
    if (list) {
      for (const d of list) {
        const fr = (d.s - seg.z) / ROAD.SEG;
        const z = p.z1 + fr * ROAD.SEG;
        if (z < 0.6) continue;
        const sc = DEPTH / z;
        const sy = p.y1 + (p.y2 - p.y1) * fr;
        const ppm2 = sc * HALF;
        const sx = p.x1 + (p.x2 - p.x1) * fr + d.x * ppm2;
        d.draw(ctx, sx, sy, ppm2);
      }
    }
    if (needClip) ctx.restore();
  }
}

function drawSegment(ctx: Ctx, x1: number, y1: number, w1: number, x2: number, y2: number, w2: number, band: number,
  f: (c: string) => string, pal: Palette, n: number) {
  ctx.fillStyle = f(band ? pal.ground1 : pal.ground2);
  ctx.fillRect(0, y2, W, y1 - y2 + 1);
  const r1 = w1 * 1.12, r2 = w2 * 1.12;
  quad(ctx, x1 - r1, y1, x1 + r1, y1, x2 + r2, y2, x2 - r2, y2, f(band ? pal.rumble1 : pal.rumble2));
  quad(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, f(band ? pal.road1 : pal.road2));
  // 边线
  const e1 = w1 * 0.94, e2 = w2 * 0.94, ew1 = w1 * 0.025, ew2 = w2 * 0.025;
  quad(ctx, x1 - e1 - ew1, y1, x1 - e1 + ew1, y1, x2 - e2 + ew2, y2, x2 - e2 - ew2, y2, f(pal.lane));
  quad(ctx, x1 + e1 - ew1, y1, x1 + e1 + ew1, y1, x2 + e2 + ew2, y2, x2 + e2 - ew2, y2, f(pal.lane));
  if (band) {
    const l1 = w1 * 0.03, l2 = w2 * 0.03;
    quad(ctx, x1 - l1, y1, x1 + l1, y1, x2 + l2, y2, x2 - l2, y2, f(pal.lane));
  }
  // 墨线描边
  if (n < 120) {
    ctx.strokeStyle = C.INK;
    ctx.lineWidth = Math.max(1, Math.min(5, (w1 / ROAD.HALF_W) * 0.09));
    ctx.beginPath();
    ctx.moveTo(x1 - r1, y1); ctx.lineTo(x2 - r2, y2);
    ctx.moveTo(x1 + r1, y1); ctx.lineTo(x2 + r2, y2);
    ctx.stroke();
  }
}

function quad(ctx: Ctx, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath(); ctx.fill();
}

/** 天空 + 视差远景 */
export function drawSky(ctx: Ctx, pal: Palette, horizon: number, bgX: number, theme: Theme, sky: Sky, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, horizon + 40);
  g.addColorStop(0, pal.skyTop); g.addColorStop(1, pal.skyBot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon + 60);
  // 太阳 / 月亮
  const sunX = ((bgX * 0.2) % (W * 2) + W * 2) % (W * 2) - W * 0.3 + 900;
  if (sky === 'night') {
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath(); ctx.arc(sunX, 90, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.skyTop; ctx.beginPath(); ctx.arc(sunX + 14, 80, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) { const sx = (i * 137.5 + bgX * 0.1) % W; const sy = (i * 71.3) % (horizon - 60); if (Math.sin(t * 2 + i) > -0.6) ctx.fillRect((sx + W) % W, sy, 2, 2); }
  } else {
    ctx.fillStyle = sky === 'dusk' ? '#ff9f1c' : C.YELLOW;
    ctx.beginPath(); ctx.arc(sunX, horizon - (sky === 'dusk' ? 50 : 170), 46, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = C.INK; ctx.stroke();
  }
  // 远景
  const layer = (speed: number, color: string, gen: (x: number) => number, base: number) => {
    const off = ((bgX * speed) % W + W) % W;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(-10, horizon + 5);
    for (let x = -10; x <= W + 10; x += 8) ctx.lineTo(x, horizon - base - gen(x + off));
    ctx.lineTo(W + 10, horizon + 5); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(17,17,17,0.6)'; ctx.stroke();
  };
  const night = sky === 'night';
  if (theme === 'city') {
    layer(0.3, night ? '#1b2440' : mix(pal.skyBot, '#4a5a80', 0.45), (x) => skyline(x, 1), 0);
    layer(0.6, night ? '#141a30' : mix(pal.skyBot, '#2b3a5a', 0.6), (x) => skyline(x, 2) * 0.7, 0);
  } else {
    layer(0.3, night ? '#1b2a2a' : mix(pal.skyBot, '#4a7c59', 0.5), (x) => 40 + Math.sin(x * 0.008) * 22 + Math.sin(x * 0.03) * 8, 0);
  }
}

function skyline(x: number, seed: number) {
  const cell = Math.floor(x / 46);
  const r = Math.abs(Math.sin(cell * 12.9898 * seed + seed * 78.233)) % 1;
  return 30 + r * 110;
}
