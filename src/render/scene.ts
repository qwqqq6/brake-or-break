import { C, H, HORIZON, ROAD, VAN, W } from '../config';
import type { Session } from '../sim/session';
import type { Input } from '../input/input';
import { clamp, easeOutBack, fmtTime, hash } from '../util';
import { burst, caption, sfx } from './comic';
import { drawCockpit, PEDAL_CAM } from './cockpit';
import { drawPedalCam } from './pedalcam';
import { drawRoad, drawSky, palette, type Dyn, type Palette } from './road3d';
import { drawCarRear, drawCrate, drawDucks, drawLight, drawWall } from './sprites';

type Ctx = CanvasRenderingContext2D;
const DEPTH = 1 / Math.tan(((ROAD.FOV / 2) * Math.PI) / 180);

let palCache: { key: string; pal: Palette } | null = null;

export function renderSession(ctx: Ctx, s: Session, t: number, input: Input) {
  const d = s.def;
  const key = `${d.theme}|${d.sky}|${d.rain}`;
  if (!palCache || palCache.key !== key) palCache = { key, pal: palette(d.theme, d.sky, d.rain) };
  const pal = palCache.pal;
  const van = s.van;
  const night = d.sky === 'night';

  const shake = s.shake * 6;
  const shX = (hash(Math.floor(t * 60)) - 0.5) * shake, shY = (hash(Math.floor(t * 60), 3) - 0.5) * shake;
  const grade = s.road.gradeAt(van.s + 10);
  const horizon = HORIZON + grade * DEPTH * (W / 2) * 0.5 + van.a * 3.2 + shY;

  ctx.save();
  // 世界
  drawSky(ctx, pal, horizon, s.bgX, d.theme, d.sky, t);
  drawRoad(ctx, { road: s.road, camS: van.s - VAN.EYE_BACK, horizon, pal, dyns: dynamics(s, t), shakeX: shX, night, t });

  if (night) {
    ctx.fillStyle = 'rgba(8,10,30,0.42)'; ctx.fillRect(0, 0, W, 520);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(640, 470, 20, 640, 430, 420);
    g.addColorStop(0, 'rgba(255,240,190,0.28)'); g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 200, W, 320);
    ctx.restore();
  }
  if (d.rain) drawRain(ctx, t, van.v);
  // 咖啡渍
  for (const st of s.stains) {
    ctx.fillStyle = 'rgba(111,69,24,0.55)';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = st.r * (0.7 + hash(st.seed, i) * 0.5); i ? ctx.lineTo(st.x + Math.cos(a) * r, st.y + Math.sin(a) * r) : ctx.moveTo(st.x + Math.cos(a) * r, st.y + Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
  }
  // 热衰退冒烟
  if (van.temp > 0.6) {
    ctx.fillStyle = `rgba(220,220,220,${clamp((van.temp - 0.6) * 1.2, 0, 0.45)})`;
    for (let i = 0; i < 5; i++) { const px = 120 + i * 260 + Math.sin(t * 2 + i) * 30, py = 470 - ((t * 60 + i * 50) % 120); ctx.beginPath(); ctx.arc(px, py, 26 + i * 4, 0, Math.PI * 2); ctx.fill(); }
  }

  // 驾驶舱
  drawCockpit(ctx, {
    force: s.pedal.force, threshold: s.pedal.threshold, peak: s.peak, speed: van.v, temp: van.temp, fatigue: s.pedal.fatigue,
    coffee: s.coffee, diceLon: s.dice.lon, diceLat: s.dice.lat, wheel: -s.road.curveAt(van.s) * 2.5, t,
    locked: van.locked && Math.abs(van.v) > 1, fade: van.fade, tailgater: !!s.tailgater, honk: !!s.tailgater && s.tailgater.honk > 1.6, mass: van.mass,
  });
  // 咖啡飞溅
  ctx.fillStyle = '#6f4518';
  for (const p of s.drops) { ctx.beginPath(); ctx.arc(p.x, p.y, 4 + p.life * 3, 0, Math.PI * 2); ctx.fill(); }

  drawPedalCam(ctx, PEDAL_CAM.x, PEDAL_CAM.y, PEDAL_CAM.w, PEDAL_CAM.h, {
    travel: s.pedal.travel, force: s.pedal.force, threshold: s.pedal.threshold, fatigue: s.pedal.fatigue, t,
  });

  drawHud(ctx, s, t);
  ctx.restore();

  if (s.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${s.flash})`; ctx.fillRect(0, 0, W, H); }
}

function dynamics(s: Session, t: number): Dyn[] {
  const list: Dyn[] = [];
  const l = s.lead;
  if (l) list.push({ s: l.s, x: l.x, draw: (c, x, y, p) => drawCarRear(c, x, y, p, l.kind, l.color, l.braking, t) });
  for (const st of s.stops) {
    if (st.light) { const L = st.light; list.push({ s: st.s + 1, x: 0, draw: (c, x, y, p) => drawLight(c, x, y, p, L.state, t) }); }
    if (st.final) list.push({ s: st.s + 11, x: 0, draw: (c, x, y, p) => drawWall(c, x, y, p) });
  }
  for (const hz of s.hazards) {
    if (hz.state === 'idle' || hz.state === 'clear') continue;
    if (hz.kind === 'ducks') list.push({ s: hz.s, x: 0, draw: (c, x, y, p) => drawDucks(c, x, y, p, hz.p, t) });
    else list.push({ s: hz.s, x: 0, draw: (c, x, y, p) => drawCrate(c, x, y, p, hz.p) });
  }
  return list;
}

function drawRain(ctx: Ctx, t: number, v: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(200,220,255,0.45)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  const slant = 0.15 + v * 0.01;
  for (let i = 0; i < 140; i++) {
    const x = (hash(i) * W + t * 60) % W;
    const y = (hash(i, 2) * 520 + t * (900 + hash(i, 3) * 300)) % 520;
    ctx.moveTo(x, y); ctx.lineTo(x - 22 * slant, y + 22);
  }
  ctx.stroke();
  // 挡风玻璃水滴
  ctx.fillStyle = 'rgba(220,235,255,0.35)'; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const life = (t * 0.4 + hash(i, 9)) % 1;
    const x = 140 + hash(i, 5) * 1000, y = 60 + hash(i, 6) * 380 + life * 40;
    ctx.beginPath(); ctx.arc(x, y, 3 + hash(i, 7) * 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawHud(ctx: Ctx, s: Session, t: number) {
  const d = s.def;
  caption(ctx, `${d.code} · ${d.name}`, 136, 58, { size: 16, align: 'left', bg: C.WHITE });
  caption(ctx, `SCORE ${Math.floor(s.score).toLocaleString()}`, 136, 92, { size: 26, align: 'left' });
  if (s.combo > 1) caption(ctx, `COMBO x${s.combo}`, 136, 136, { size: 18, align: 'left', bg: C.CYAN });
  caption(ctx, `TIME ${fmtTime(s.time)}${d.par ? `  /  PAR ${fmtTime(d.par)}` : ''}`, W - 136, 58, { size: 18, align: 'right', bg: C.WHITE });

  const ob = s.objective();
  const warnBlink = ob.warn && Math.floor(t * 4) % 2 === 0;
  if (ob.text) caption(ctx, ob.text, W / 2, 112, { size: 22, bg: warnBlink ? C.RED : C.YELLOW, fg: warnBlink ? C.WHITE : C.INK });

  // 弹出字
  s.popups.forEach((p, i) => {
    const k = Math.min(1, p.t / 0.25);
    const sc = easeOutBack(k);
    const fade = p.t > p.life - 0.3 ? (p.life - p.t) / 0.3 : 1;
    ctx.save();
    ctx.globalAlpha = clamp(fade, 0, 1);
    const y = 200 + i * 62 - p.t * 14;
    ctx.translate(W / 2, y); ctx.scale(sc, sc);
    sfx(ctx, p.text, 0, 0, p.size * 0.8, p.color, { rot: p.rot });
    if (p.sub) sfx(ctx, p.sub, 0, p.size * 0.55, 20, C.WHITE, { lw: 5 });
    ctx.restore();
  });

  // 倒计时
  if (s.status === 'countdown') {
    const n = Math.ceil(s.countdown);
    const fr = s.countdown - Math.floor(s.countdown);
    const label = n > 3 ? '' : n >= 1 ? String(n) : 'GO!';
    if (label) {
      ctx.save(); ctx.translate(W / 2, 270); const sc = 0.6 + (1 - fr) * 0.1 + easeOutBack(clamp((1 - fr) * 3, 0, 1)) * 0.4; ctx.scale(sc, sc);
      burst(ctx, 0, 0, 120, 80, 14, n >= 1 ? C.YELLOW : C.GREEN, 6, t, 3);
      sfx(ctx, label, 0, 4, 110, n >= 1 ? C.RED : C.WHITE);
      ctx.restore();
    }
  }
  if (s.status === 'run' && s.time < 0.8) {
    ctx.save(); ctx.translate(W / 2, 270); burst(ctx, 0, 0, 130, 90, 14, C.GREEN, 6, 0, 3); sfx(ctx, 'GO!', 0, 4, 110, C.WHITE); ctx.restore();
  }
  if (s.status === 'done') {
    ctx.save(); ctx.translate(W / 2, 260); const sc = easeOutBack(clamp(s.doneT * 3, 0, 1)); ctx.scale(sc, sc);
    burst(ctx, 0, 0, 220, 150, 18, C.YELLOW, 6, 0.1, 5);
    sfx(ctx, d.endless ? 'NICE!' : '到站!', 0, -10, 96, C.RED, { rot: -0.06 });
    sfx(ctx, 'DELIVERED', 0, 70, 40, C.WHITE);
    ctx.restore();
  }
}
