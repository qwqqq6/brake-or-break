import { C, H, W } from '../config';
import type { CrashReason, CrashTarget } from '../sim/session';
import { clamp, easeOutBack, hash } from '../util';
import { bubble, burst, dots, panel, poly, roundRect, sfx, speedLines } from './comic';
import { drawPedalCam } from './pedalcam';
import { drawCarRear, drawCrate, drawDucks } from './sprites';

type Ctx = CanvasRenderingContext2D;

const P1 = [30, 30, 700, 50, 670, 385, 40, 370];
const P2 = [722, 40, 1250, 24, 1240, 370, 700, 392];
const P3 = [40, 404, 1240, 412, 1250, 700, 30, 690];
const P4 = [14, 14, 1266, 8, 1270, 712, 8, 706];
const T = { p1: 0, p2: 0.8, p3: 1.6, p4: 2.7, end: 4.8 };

/** 撞车分镜动画（约 5 秒），之后进入结算封面 */
export class CrashSeq {
  t = 0;
  done = false;
  private cues = new Set<string>();
  constructor(public reason: CrashReason, public target: CrashTarget, private snap: HTMLCanvasElement, public speed: number) {}

  update(dt: number, cue: (name: string) => void) {
    this.t += dt;
    const fire = (k: string, at: number) => { if (this.t >= at && !this.cues.has(k)) { this.cues.add(k); cue(k); } };
    fire('p2', T.p2); fire('p3', T.p3); fire('p4', T.p4);
    if (this.t >= T.end) this.done = true;
  }
  skip() { if (this.t > 0.8) this.done = true; }

  draw(ctx: Ctx) {
    const t = this.t;
    // 冻结画面背景（去色 + 网点）
    ctx.save();
    ctx.filter = 'grayscale(0.85) contrast(1.15) brightness(0.7)';
    ctx.drawImage(this.snap, 0, 0);
    ctx.filter = 'none';
    ctx.fillStyle = dots(ctx, 'rgba(0,0,0,0.35)', 8, 2.2); ctx.fillRect(0, 0, W, H);
    ctx.restore();

    if (t < T.p4) {
      this.pop(ctx, P1, t - T.p1, () => this.panel1(ctx, t));
      if (t >= T.p2) this.pop(ctx, P2, t - T.p2, () => this.panel2(ctx, t - T.p2));
      if (t >= T.p3) this.pop(ctx, P3, t - T.p3, () => this.panel3(ctx, t - T.p3));
    } else {
      this.pop(ctx, P4, t - T.p4, () => this.panel4(ctx, t - T.p4));
      const fl = clamp(1 - (t - T.p4) / 0.25, 0, 1);
      if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${fl})`; ctx.fillRect(0, 0, W, H); }
    }
  }

  private pop(ctx: Ctx, pts: number[], lt: number, fn: () => void) {
    const k = easeOutBack(clamp(lt / 0.28, 0, 1));
    const cx = (pts[0] + pts[2] + pts[4] + pts[6]) / 4, cy = (pts[1] + pts[3] + pts[5] + pts[7]) / 4;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); ctx.rotate((1 - k) * 0.08); ctx.translate(-cx, -cy);
    ctx.globalAlpha = clamp(lt / 0.1, 0, 1);
    panel(ctx, pts, fn);
    ctx.restore();
  }

  // ---- 格 1：起因特写 ----
  private panel1(ctx: Ctx, t: number) {
    const cx = 360, cy = 210;
    const r = this.reason;
    if (r === 'pedal') {
      ctx.fillStyle = C.YELLOW; ctx.fillRect(0, 0, W, H);
      burst(ctx, cx, cy, 380, 200, 22, C.ORANGE, 0, t, 1);
      drawPedalCam(ctx, 40, 30, 640, 360, { travel: 0.95, force: 1700, threshold: 1600, fatigue: 1, t, snap: clamp(t / 0.7, 0.05, 1) }, false);
      sfx(ctx, 'KRAK!!', 230, 120, 110, C.RED, { rot: -0.18 });
      return;
    }
    ctx.fillStyle = C.RED; ctx.fillRect(0, 0, W, H);
    speedLines(ctx, cx, cy, 60, 600, 60, 'rgba(255,255,255,0.55)', 3, 5);
    const grow = 1 + t * 0.6;
    if (r === 'rear') {
      drawCarRear(ctx, cx, cy + 160, 120 * grow, this.target === 'truck' ? 'truck' : 'car', C.RED, true, t);
      sfx(ctx, '!!', 560, 110, 120, C.YELLOW, { rot: 0.15 });
    } else if (r === 'ducks') {
      ctx.save(); ctx.translate(cx, cy + 120); drawDucks(ctx, -60, 0, 140 * grow * 0.8, 0.5, t); ctx.restore();
      sfx(ctx, 'QUACK?!', 220, 90, 70, C.YELLOW, { rot: -0.15 });
    } else if (r === 'crate') {
      drawCrate(ctx, cx, cy + 150, 200 * grow, 1);
      sfx(ctx, '!!', 560, 110, 120, C.YELLOW, { rot: 0.15 });
    } else if (r === 'redlight') {
      ctx.fillStyle = '#222'; roundRect(ctx, cx - 70, 40, 140, 320, 20); ctx.fill(); ctx.lineWidth = 6; ctx.stroke();
      [['#ff3b3b', 1], ['#553', 0], ['#353', 0]].forEach(([c, on], i) => {
        ctx.beginPath(); ctx.arc(cx, 100 + i * 100, 40, 0, Math.PI * 2); ctx.fillStyle = c as string; ctx.fill(); ctx.stroke();
        if (on) burst(ctx, cx, 100, 90 + Math.sin(t * 20) * 6, 60, 16, 'rgba(255,80,80,0.0)', 4, t, 2);
      });
      sfx(ctx, '红灯!!', 520, 300, 80, C.YELLOW, { rot: 0.1 });
    } else if (r === 'rollback') {
      ctx.fillStyle = '#2b2d42'; roundRect(ctx, 80, 90, 560, 200, 30); ctx.fill(); ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = '#9fd8ef'; roundRect(ctx, 100, 108, 520, 164, 20); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(cx, 180); ctx.scale(grow, grow);
      ctx.fillStyle = '#e9ecef'; roundRect(ctx, -140, -30, 280, 110, 20); ctx.fill(); ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = C.YELLOW; ctx.beginPath(); ctx.arc(-100, 30, 22, 0, Math.PI * 2); ctx.arc(100, 30, 22, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      sfx(ctx, '滴滴——!!', 360, 330, 64, C.YELLOW, { rot: -0.08 });
    } else if (r === 'cliff') {
      ctx.fillStyle = C.PAPER; ctx.beginPath(); ctx.arc(cx, cy + 40, 150, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 8; ctx.stroke();
      const a = Math.PI * 0.75 + Math.PI * 1.5 * clamp(this.speed * 3.6 / 120, 0, 1) + Math.sin(t * 40) * 0.05;
      ctx.strokeStyle = C.RED; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(cx, cy + 40); ctx.lineTo(cx + Math.cos(a) * 130, cy + 40 + Math.sin(a) * 130); ctx.stroke();
      sfx(ctx, `${Math.round(this.speed * 3.6)}km/h`, cx, cy + 110, 50, C.INK, { shadow: false, lw: 0.1 });
      sfx(ctx, '太快了!!', 540, 80, 64, C.YELLOW, { rot: 0.12 });
    } else {
      ctx.fillStyle = '#e9c46a'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? C.INK : C.YELLOW; ctx.fillRect(i * 60 - t * 40, 300, 60, 40); }
      sfx(ctx, '刹不住!!', cx, 160, 96, C.RED, { rot: -0.08 });
    }
  }

  // ---- 格 2：司机惊恐脸 ----
  private panel2(ctx: Ctx, t: number) {
    ctx.fillStyle = C.CYAN; ctx.fillRect(0, 0, W, H);
    speedLines(ctx, 975, 210, 120, 500, 70, 'rgba(17,17,17,0.5)', 7, 3);
    drawFace(ctx, 975, 230, 1.0, t);
    const lines: Record<CrashReason, string> = {
      pedal: '踏板断了?!', rear: '刹不住啦!!', ducks: '鸭子!!', crate: '箱子!!', redlight: '红灯?!', rollback: '溜车了!!', cliff: '啊啊啊——', wall: '停不下来!!',
    };
    bubble(ctx, lines[this.reason], 1120, 100, 34, 1050, 170, true);
  }

  // ---- 格 3：车外侧视 ----
  private panel3(ctx: Ctx, t: number) {
    const sky = this.target === 'cliff' ? '#ff9f6b' : '#9fd8ef';
    ctx.fillStyle = sky; ctx.fillRect(0, 400, W, 320);
    ctx.fillStyle = dots(ctx, 'rgba(0,0,0,0.12)', 8, 2); ctx.fillRect(0, 400, W, 320);
    const ground = 640;
    ctx.fillStyle = '#4a4e5a'; ctx.fillRect(0, ground, W, 80);
    ctx.fillStyle = C.WHITE; for (let i = 0; i < 14; i++) ctx.fillRect(((i * 120 - t * 900) % 1400 + 1400) % 1400 - 100, ground + 26, 60, 8);
    ctx.lineWidth = 5; ctx.strokeStyle = C.INK; ctx.beginPath(); ctx.moveTo(0, ground); ctx.lineTo(W, ground); ctx.stroke();

    const behind = this.target === 'behind';
    const k = clamp(t / 1.0, 0, 1);
    const vx = behind ? 760 - k * 260 : 120 + k * 520;
    // 速度线
    ctx.strokeStyle = 'rgba(17,17,17,0.6)'; ctx.lineWidth = 4;
    for (let i = 0; i < 8; i++) {
      const y = 470 + i * 20;
      ctx.beginPath();
      if (behind) { ctx.moveTo(vx + 250, y); ctx.lineTo(vx + 420 + i * 10, y); } else { ctx.moveTo(vx - 30 - i * 14, y); ctx.lineTo(vx - 220, y); }
      ctx.stroke();
    }
    this.drawTarget(ctx, ground, t, behind);
    if (this.target === 'cliff') {
      ctx.save(); ctx.translate(vx + 110, ground - 60); ctx.rotate(k * 0.4); drawVan(ctx, -110, 60 - k * 0, 1, false); ctx.restore();
    } else {
      drawVan(ctx, vx, ground, 1, behind);
    }
    if (this.reason === 'ducks') { ctx.save(); drawDucks(ctx, 1000, ground + 2, 70, 0.9, t); ctx.restore(); }
    sfx(ctx, behind ? 'ROLL...' : 'VROOOM!', 260, 450, 50, C.YELLOW, { rot: -0.1 });
  }

  private drawTarget(ctx: Ctx, ground: number, t: number, behind: boolean) {
    const tg = this.target;
    if (tg === 'car' || tg === 'truck') {
      const w = tg === 'truck' ? 320 : 240, h = tg === 'truck' ? 170 : 90;
      const x = 900;
      ctx.fillStyle = tg === 'truck' ? C.ORANGE : C.RED;
      roundRect(ctx, x, ground - h - 26, w, h, 14); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = C.INK; ctx.stroke();
      if (tg === 'car') { ctx.fillStyle = '#243b55'; poly(ctx, [x + 40, ground - h - 26, x + 70, ground - h - 70, x + 180, ground - h - 70, x + 210, ground - h - 26]); ctx.fill(); ctx.stroke(); }
      wheel(ctx, x + 50, ground - 22, 26); wheel(ctx, x + w - 50, ground - 22, 26);
      ctx.fillStyle = '#ff2030'; ctx.fillRect(x - 6, ground - h - 6, 14, 26);
    } else if (tg === 'pole') {
      ctx.fillStyle = '#6c757d'; ctx.fillRect(980, ground - 240, 24, 240); ctx.lineWidth = 5; ctx.strokeStyle = C.INK; ctx.strokeRect(980, ground - 240, 24, 240);
      ctx.fillStyle = C.YELLOW; ctx.fillRect(950, ground - 250, 60, 20); ctx.strokeRect(950, ground - 250, 60, 20);
    } else if (tg === 'wall') {
      ctx.fillStyle = '#e9c46a'; ctx.fillRect(1000, 410, 260, ground - 410); ctx.lineWidth = 6; ctx.strokeStyle = C.INK; ctx.strokeRect(1000, 410, 260, ground - 410);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? C.INK : C.YELLOW; ctx.fillRect(1000, 430 + i * 30, 30, 30); }
    } else if (tg === 'crate') {
      drawCrate(ctx, 1000, ground, 90, 1);
    } else if (tg === 'cross') {
      const x = 1300 - clamp(t, 0, 1) * 420;
      ctx.fillStyle = C.GREEN; roundRect(ctx, x, ground - 200, 400, 175, 12); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = C.INK; ctx.stroke();
      wheel(ctx, x + 70, ground - 22, 28); wheel(ctx, x + 320, ground - 22, 28);
      sfx(ctx, 'HONK!!', x + 200, ground - 240, 54, C.YELLOW, { rot: 0.1 });
    } else if (tg === 'cliff') {
      ctx.fillStyle = '#7d5e53'; poly(ctx, [700, ground, 1280, ground, 1280, 720, 760, 720]); ctx.fill();
      ctx.fillStyle = '#ff9f6b'; poly(ctx, [860, ground - 2, 1280, ground - 2, 1280, 720, 900, 720]); ctx.fill();
      ctx.fillStyle = '#ddd'; ctx.fillRect(800, ground - 40, 60, 12); ctx.lineWidth = 4; ctx.strokeStyle = C.INK; ctx.strokeRect(800, ground - 40, 60, 12);
      ctx.save(); ctx.translate(880, ground - 40); ctx.rotate(0.6 + t); ctx.fillStyle = '#ddd'; ctx.fillRect(0, 0, 60, 12); ctx.strokeRect(0, 0, 60, 12); ctx.restore();
    } else if (tg === 'behind' && behind) {
      ctx.fillStyle = '#e9ecef'; roundRect(ctx, 100, ground - 120, 260, 95, 14); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = C.INK; ctx.stroke();
      wheel(ctx, 150, ground - 22, 26); wheel(ctx, 310, ground - 22, 26);
      sfx(ctx, 'HONK!!', 230, ground - 160, 50, C.YELLOW);
    }
  }

  // ---- 格 4：撞击大格 ----
  private panel4(ctx: Ctx, t: number) {
    const shake = Math.max(0, 1 - t * 1.5) * 18;
    const ox = (hash(Math.floor(t * 50)) - 0.5) * shake, oy = (hash(Math.floor(t * 50), 2) - 0.5) * shake;
    ctx.save(); ctx.translate(ox, oy);
    ctx.fillStyle = C.YELLOW; ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = dots(ctx, 'rgba(230,57,70,0.5)', 12, 3.5); ctx.fillRect(-20, -20, W + 40, H + 40);
    speedLines(ctx, 640, 380, 180, 900, 90, 'rgba(17,17,17,0.7)', 11, 6);
    burst(ctx, 640, 380, 430 + Math.sin(t * 30) * 10, 260, 20, C.RED, 8, 0.2, 9);
    burst(ctx, 640, 380, 300, 180, 16, C.ORANGE, 6, 0.5, 4);
    burst(ctx, 640, 380, 190, 120, 12, C.WHITE, 5, 0.1, 6);
    // 车 (挤扁)
    ctx.save(); ctx.translate(640, 420); ctx.rotate(-0.12); ctx.scale(1.25 - 0.15, 1.25);
    drawVan(ctx, -200, 70, 1.0, false, 0.35);
    ctx.restore();
    // 碎片
    for (let i = 0; i < 18; i++) {
      const a = i * 0.9 + 0.2, d = 160 + t * (300 + hash(i) * 400);
      const px = 640 + Math.cos(a) * d, py = 380 + Math.sin(a) * d + t * t * 300;
      ctx.save(); ctx.translate(px, py); ctx.rotate(t * 8 + i);
      ctx.fillStyle = i % 3 === 0 ? '#9fd8ef' : i % 3 === 1 ? C.GREY : C.CYAN;
      poly(ctx, [-12, -8, 14, -4, 4, 12]); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.INK; ctx.stroke();
      ctx.restore();
    }
    // 咖啡泼洒
    ctx.fillStyle = '#6f4518';
    for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.arc(380 + i * 30 + t * 60, 220 - Math.sin(i) * 60 + t * t * 200, 10 + (i % 3) * 6, 0, Math.PI * 2); ctx.fill(); }
    const word = this.target === 'cliff' ? 'KA-BOOM!!' : 'KRAAASH!!!';
    const sc = easeOutBack(clamp(t / 0.3, 0, 1));
    ctx.save(); ctx.translate(640, 150); ctx.scale(sc, sc);
    sfx(ctx, word, 0, 0, 150, C.YELLOW, { rot: -0.08, lw: 22, skew: -0.15 });
    ctx.restore();
    if (this.reason === 'ducks') sfx(ctx, '（鸭子们安然无恙）', 640, 660, 30, C.WHITE, { lw: 6 });
    ctx.restore();
  }
}

function wheel(ctx: Ctx, x: number, y: number, r: number) {
  ctx.fillStyle = C.INK; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#adb5bd'; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill();
}

/** 侧视面包车（车头朝右；flip=true 朝左），x 为车尾，y 为地面 */
export function drawVan(ctx: Ctx, x: number, y: number, s: number, flip: boolean, crumple = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  if (flip) { ctx.translate(320, 0); ctx.scale(-1, 1); }
  const L = 320 - crumple * 80;
  ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = C.INK;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(L / 2, 2, L * 0.55, 10, 0, 0, Math.PI * 2); ctx.fill();
  // 车身
  ctx.beginPath();
  ctx.moveTo(0, -30); ctx.lineTo(0, -170); ctx.quadraticCurveTo(0, -180, 12, -180);
  ctx.lineTo(L - 70, -180); ctx.quadraticCurveTo(L - 20, -175, L - 6, -110 + crumple * 20);
  ctx.lineTo(L, -60); ctx.lineTo(L, -30); ctx.closePath();
  ctx.fillStyle = '#f1faee'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = dots(ctx, 'rgba(0,0,0,0.15)', 7, 1.6); ctx.fill();
  // 条纹 & 锈斑
  ctx.fillStyle = C.RED; ctx.fillRect(4, -100, L - 8, 20); ctx.strokeRect(4, -100, L - 8, 20);
  ctx.fillStyle = '#b5651d'; ctx.beginPath(); ctx.arc(60, -50, 10, 0, Math.PI * 2); ctx.arc(200, -140, 7, 0, Math.PI * 2); ctx.fill();
  // 窗
  ctx.fillStyle = '#9fd8ef';
  poly(ctx, [L - 90, -168, L - 60, -168, L - 22, -115, L - 90, -115]); ctx.fill(); ctx.stroke();
  roundRect(ctx, 30, -165, 150, 50, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.INK; ctx.font = "900 22px 'Microsoft YaHei', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('遥遥领先', 120, -58);
  // 灯
  ctx.fillStyle = C.YELLOW; ctx.fillRect(L - 14, -74, 12, 16); ctx.strokeRect(L - 14, -74, 12, 16);
  ctx.fillStyle = '#ff2030'; ctx.fillRect(0, -80, 10, 22); ctx.strokeRect(0, -80, 10, 22);
  wheel(ctx, 70, -22, 30); wheel(ctx, L - 70, -22, 30);
  if (crumple > 0) {
    ctx.strokeStyle = C.INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(L - 30, -170); ctx.lineTo(L - 50, -140); ctx.lineTo(L - 25, -120); ctx.lineTo(L - 45, -90); ctx.stroke();
  }
  ctx.restore();
}

/** 司机惊恐脸 */
export function drawFace(ctx: Ctx, cx: number, cy: number, s: number, t: number) {
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(s, s);
  const sh = Math.sin(t * 50) * 3;
  ctx.translate(sh, 0);
  ctx.lineWidth = 6; ctx.strokeStyle = C.INK; ctx.lineJoin = 'round';
  // 脖子 + 衣服
  ctx.fillStyle = '#f2c29b'; ctx.fillRect(-40, 90, 80, 60); ctx.strokeRect(-40, 90, 80, 60);
  ctx.fillStyle = C.BLUE; poly(ctx, [-160, 200, -60, 130, 60, 130, 160, 200]); ctx.fill(); ctx.stroke();
  // 头
  ctx.fillStyle = '#f2c29b';
  ctx.beginPath(); ctx.ellipse(0, 0, 110, 125, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // 帽子
  ctx.fillStyle = C.RED;
  ctx.beginPath(); ctx.moveTo(-112, -30); ctx.quadraticCurveTo(-110, -140, 0, -140); ctx.quadraticCurveTo(110, -140, 112, -30); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-112, -30); ctx.lineTo(150, -40); ctx.lineTo(140, -20); ctx.lineTo(-112, -14); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.YELLOW; ctx.font = "34px 'Bangers', Impact"; ctx.textAlign = 'center'; ctx.fillText('B!', 0, -70);
  // 眼睛
  for (const ex of [-42, 42]) {
    ctx.fillStyle = C.WHITE; ctx.beginPath(); ctx.ellipse(ex, 10, 30, 36, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.INK; ctx.beginPath(); ctx.arc(ex + Math.sin(t * 30) * 2, 12, 6, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(ex - 28, -38 - (ex < 0 ? 0 : 8)); ctx.lineTo(ex + 24, -42 - (ex < 0 ? 8 : 0)); ctx.stroke(); ctx.lineWidth = 6;
  }
  // 嘴
  ctx.fillStyle = '#7a1c1c'; ctx.beginPath(); ctx.ellipse(0, 78, 30, 26 + Math.sin(t * 25) * 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.PINK; ctx.beginPath(); ctx.ellipse(0, 90, 16, 8, 0, 0, Math.PI * 2); ctx.fill();
  // 汗
  ctx.fillStyle = C.CYAN;
  for (const [sx, sy, sz] of [[-120, -10, 1], [125, 20, 0.8], [100, -70, 0.7]]) {
    const dy = ((t * 120 * sz) % 40);
    ctx.beginPath(); ctx.moveTo(sx, sy - 18 + dy); ctx.quadraticCurveTo(sx + 12 * sz, sy + 6 + dy, sx, sy + 12 * sz + dy); ctx.quadraticCurveTo(sx - 12 * sz, sy + 6 + dy, sx, sy - 18 + dy); ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.restore();
}
