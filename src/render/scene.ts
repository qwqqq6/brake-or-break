import { AUTO, C, H, HORIZON, ROAD, VAN, W } from '../config';
import type { Session } from '../sim/session';
import type { Input } from '../input/input';
import { TOUCH_BRAKE, TOUCH_GAS, TOUCH_PAUSE } from '../input/input';
import { clamp, easeOutBack, fmtTime, hash } from '../util';
import { burst, caption, dots, panel, roundRect, sfx, speedLines } from './comic';
import { drawCockpit, PEDAL_CAM } from './cockpit';
import { drawPedalCam } from './pedalcam';
import { drawRoad, drawSky, palette, type Dyn, type Palette } from './road3d';
import { drawCarRear, drawDog, drawWall, drawWorker } from './sprites';

type Ctx = CanvasRenderingContext2D;
const DEPTH = 1 / Math.tan(((ROAD.FOV / 2) * Math.PI) / 180);

let palCache: { key: string; pal: Palette } | null = null;

export function renderSession(ctx: Ctx, s: Session, t: number, input: Input) {
  const d = s.def;
  const key = `${d.theme}|${d.sky}`;
  if (!palCache || palCache.key !== key) palCache = { key, pal: palette(d.theme, d.sky, false) };
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
    locked: van.locked && Math.abs(van.v) > 1, fade: van.fade, mass: van.mass, auto: s.auto, inCurve: s.sharpCurve,
  });
  // 咖啡飞溅
  ctx.fillStyle = '#6f4518';
  for (const p of s.drops) { ctx.beginPath(); ctx.arc(p.x, p.y, 4 + p.life * 3, 0, Math.PI * 2); ctx.fill(); }

  drawPedalCam(ctx, PEDAL_CAM.x, PEDAL_CAM.y, PEDAL_CAM.w, PEDAL_CAM.h, {
    travel: s.pedal.travel, force: s.pedal.force, threshold: s.pedal.threshold, fatigue: s.pedal.fatigue, t,
  });

  drawHud(ctx, s, t);
  if (input.source === 'touch') drawTouchControls(ctx, s, input, t);
  ctx.restore();

  if (s.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${s.flash})`; ctx.fillRect(0, 0, W, H); }
}

function drawTouchControls(ctx: Ctx, s: Session, input: Input, t: number) {
  const B = TOUCH_BRAKE, G = TOUCH_GAS, P = TOUCH_PAUSE;
  const bk = clamp(input.brake, 0, 1), gk = clamp(input.throttle, 0, 1);
  // BRAKE 大踏板
  const stress = clamp((s.pedal.force - 1100) / (s.pedal.threshold - 1100), 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.9;
  roundRect(ctx, B.x, B.y, B.w, B.h, B.r);
  ctx.fillStyle = bk > 0.02 ? `rgba(230,57,70,${0.3 + bk * 0.5})` : 'rgba(230,57,70,0.18)';
  ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = stress > 0.6 && Math.floor(t * 10) % 2 ? C.YELLOW : C.RED; ctx.stroke();
  // 力度柱：从底部往上涨
  const fh = B.h * bk;
  roundRect(ctx, B.x + 10, B.y + B.h - fh, B.w - 20, Math.max(0, fh - 4), B.r * 0.6);
  ctx.fillStyle = `rgba(255,210,63,${0.25 + bk * 0.4})`; ctx.fill();
  ctx.fillStyle = C.WHITE;
  sfx(ctx, 'BRAKE', B.x + B.w / 2, B.y + 56, 48, C.YELLOW, { lw: 10 });
  sfx(ctx, '按住 · 往上拖更用力', B.x + B.w / 2, B.y + 100, 20, C.WHITE, { lw: 5 });
  ctx.restore();
  // GAS 按钮
  ctx.save();
  ctx.globalAlpha = 0.85;
  roundRect(ctx, G.x, G.y, G.w, G.h, G.r);
  ctx.fillStyle = gk > 0.02 ? `rgba(95,191,74,${0.35 + gk * 0.45})` : 'rgba(95,191,74,0.2)';
  ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = C.GREEN; ctx.stroke();
  sfx(ctx, 'GAS', G.x + G.w / 2, G.y + G.h / 2, 44, C.GREEN, { lw: 9 });
  ctx.restore();
  // 暂停按钮
  ctx.save();
  ctx.globalAlpha = 0.8;
  roundRect(ctx, P.x, P.y, P.w, P.h, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.WHITE; ctx.stroke();
  ctx.fillStyle = C.WHITE;
  ctx.fillRect(P.x + 16, P.y + 14, 6, P.h - 28);
  ctx.fillRect(P.x + P.w - 22, P.y + 14, 6, P.h - 28);
  ctx.restore();
}

function dynamics(s: Session, t: number): Dyn[] {
  const list: Dyn[] = [];
  const l = s.lead;
  if (l) {
    const mood = l.asleep ? 'sleep' : l.mode === 'wake' ? 'wake' : 'none';
    list.push({ s: l.s, x: l.x, draw: (c, x, y, p) => drawCarRear(c, x, y, p, l.kind, l.color, l.braking, t, mood) });
  }
  for (const st of s.stops) if (st.final) list.push({ s: st.s + 11, x: 0, draw: (c, x, y, p) => drawWall(c, x, y, p) });
  for (const cr of s.crossers) {
    if (cr.state === 'idle' || cr.state === 'clear') continue;
    const moving = cr.state !== 'block';
    // 远处也要一眼看到：头顶闪一个红色感叹号
    const mark = (c: Ctx, x: number, y: number, p: number, h: number) => {
      if (Math.floor(t * 6) % 2) return;
      const r = Math.max(10, p * 0.45);
      burst(c, x, y - h * p - r * 1.3, r, r * 0.65, 10, C.RED, Math.max(2, r * 0.14), 0, 3);
      sfx(c, '!', x, y - h * p - r * 1.25, r * 1.2, C.YELLOW, { lw: Math.max(2, r * 0.15), shadow: false });
    };
    if (cr.kind === 'worker') list.push({ s: cr.s, x: cr.x, draw: (c, x, y, p) => { drawWorker(c, x, y, p * 1.15, t, moving); mark(c, x, y, p, 2.1); } });
    else list.push({ s: cr.s, x: cr.x, draw: (c, x, y, p) => { drawDog(c, x, y, p * 1.6, t, cr.state === 'block' ? 1 : -cr.side, moving); mark(c, x, y, p, 1.2); } });
  }
  return list;
}

function drawHud(ctx: Ctx, s: Session, t: number) {
  const d = s.def;
  caption(ctx, `${d.code} · ${d.name}`, 136, 58, { size: 16, align: 'left', bg: C.WHITE });
  caption(ctx, `SCORE ${Math.floor(s.score).toLocaleString()}`, 136, 92, { size: 26, align: 'left' });
  if (s.combo > 1) caption(ctx, `COMBO x${s.combo}`, 136, 136, { size: 18, align: 'left', bg: C.CYAN });
  caption(ctx, `TIME ${fmtTime(s.time)}${d.par ? `  /  PAR ${fmtTime(d.par)}` : ''}`, W - 136, 58, { size: 18, align: 'right', bg: C.WHITE });

  const ob = s.objective();
  if (ob) caption(ctx, ob, W / 2, 112, { size: 22, bg: C.YELLOW });

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
  if (s.needBrake) drawBrakePrompt(ctx, t);
  if (s.takeover > 0) drawTakeover(ctx, 1 - s.takeover / AUTO.TAKEOVER_SLOWMO, t);
}

/** 大大的"刹车!"提示：压在仪表台上，不挡路面；一踩刹车就消失 */
function drawBrakePrompt(ctx: Ctx, t: number) {
  const pulse = 1 + Math.sin(t * 18) * 0.06;
  const on = Math.floor(t * 8) % 2 === 0;
  ctx.save();
  ctx.translate(W / 2, 528); ctx.scale(pulse, pulse);
  ctx.save(); ctx.scale(1.9, 0.62);
  burst(ctx, 0, 0, 170, 120, 18, on ? C.RED : C.YELLOW, 7, t * 2, 7);
  ctx.restore();
  sfx(ctx, '刹车!!', 0, 4, 104, on ? C.YELLOW : C.RED, { rot: -0.04, lw: 16, skew: -0.1 });
  ctx.restore();
}

/** 退出自动驾驶分镜：漫画格弹入，中控屏告诉你"拜拜" */
function drawTakeover(ctx: Ctx, k: number, t: number) {
  const inK = easeOutBack(clamp(k / 0.18, 0, 1));
  const out = clamp((k - 0.82) / 0.18, 0, 1);
  const pts = [140, 128, 540, 114, 532, 288, 150, 302];
  const cx = 340, cy = 208;
  ctx.save();
  ctx.globalAlpha = 1 - out;
  ctx.translate(cx - out * 260, cy - out * 40); ctx.scale(0.5 + 0.5 * inK, 0.5 + 0.5 * inK); ctx.rotate((1 - inK) * -0.15); ctx.translate(-cx, -cy);
  panel(ctx, pts, () => {
    ctx.fillStyle = C.RED; ctx.fillRect(130, 100, 420, 210);
    ctx.fillStyle = dots(ctx, 'rgba(0,0,0,0.25)', 9, 2.4); ctx.fillRect(130, 100, 420, 210);
    speedLines(ctx, 340, 210, 60, 300, 46, 'rgba(255,255,255,0.45)', 4, 4);
    // 中控屏
    ctx.save(); ctx.translate(340, 214); ctx.scale(0.86, 0.86); ctx.rotate(-0.03 + Math.sin(t * 40) * 0.006);
    roundRect(ctx, -170, -62, 340, 124, 14); ctx.fillStyle = C.INK; ctx.fill();
    roundRect(ctx, -158, -52, 316, 104, 8); ctx.fillStyle = Math.floor(t * 10) % 2 ? '#3a0a10' : '#1a0507'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = C.RED; ctx.stroke();
    // 方向盘 + 斜杠
    ctx.strokeStyle = C.RED; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(-110, 0, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-140, 0); ctx.lineTo(-80, 0); ctx.moveTo(-110, 0); ctx.lineTo(-110, 30); ctx.stroke();
    ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-145, -35); ctx.lineTo(-75, 35); ctx.stroke();
    ctx.fillStyle = C.WHITE; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = "900 30px 'Microsoft YaHei', sans-serif"; ctx.fillText('自动驾驶已退出', -62, -14);
    ctx.fillStyle = C.YELLOW; ctx.font = "900 20px 'Microsoft YaHei', sans-serif"; ctx.fillText('祝你好运 :)', -60, 26);
    ctx.restore();
  });
  sfx(ctx, 'BEEP BEEP!', 470, 120, 40, C.YELLOW, { rot: 0.12 });
  ctx.restore();
}
