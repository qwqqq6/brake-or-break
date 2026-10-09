import { C, PEDAL } from '../config';
import { clamp, hash } from '../util';
import { caption, dots, poly, sfx, speedLines } from './comic';

type Ctx = CanvasRenderingContext2D;

export interface PedalCamView {
  travel: number; force: number; threshold: number; fatigue: number; t: number;
  snap?: number; // >0 表示断裂动画进度（秒）
}

/**
 * 踏板特写：斜切漫画格，侧剖面视角。
 * 本地坐标 (0..w, 0..h)，驾驶员脚从左边来。
 */
export function drawPedalCam(ctx: Ctx, x: number, y: number, w: number, h: number, v: PedalCamView, framed = true) {
  const stress = clamp((v.force - PEDAL.FATIGUE_START) / (v.threshold - PEDAL.FATIGUE_START), 0, 1);
  const shake = stress * stress * 4;
  const sx = (hash(Math.floor(v.t * 40)) - 0.5) * shake, sy = (hash(Math.floor(v.t * 40), 7) - 0.5) * shake;
  const pts = framed ? [x, y + 14, x + w, y, x + w, y + h, x + 22, y + h] : [x, y, x + w, y, x + w, y + h, x, y + h];

  ctx.save();
  if (framed) { poly(ctx, pts); ctx.lineWidth = 14; ctx.strokeStyle = C.WHITE; ctx.stroke(); }
  poly(ctx, pts); ctx.clip();
  ctx.translate(x + sx, y + sy);

  // 背景
  ctx.fillStyle = stress > 0.75 ? '#ffd6d6' : '#cfe8f3';
  ctx.fillRect(-10, -10, w + 20, h + 20);
  ctx.fillStyle = dots(ctx, stress > 0.75 ? 'rgba(230,57,70,0.45)' : 'rgba(29,143,209,0.35)', 9, 2.2);
  ctx.fillRect(-10, -10, w + 20, h + 20);
  if (stress > 0.3 || v.snap) speedLines(ctx, w * 0.62, h * 0.5, 40, w, 28, stress > 0.75 || v.snap ? 'rgba(230,57,70,0.55)' : 'rgba(0,0,0,0.15)', Math.floor(v.t * 12), 3);

  // 防火墙 / 仪表台下方
  ctx.fillStyle = '#2b3a5a';
  poly(ctx, [w * 0.45, -5, w + 5, -5, w + 5, h * 0.3, w * 0.52, h * 0.2]); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = C.INK; ctx.stroke();
  // 地板
  ctx.fillStyle = '#3d405b';
  poly(ctx, [-5, h * 0.87, w + 5, h * 0.8, w + 5, h + 5, -5, h + 5]); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#2a2c40'; ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) { const fx = 20 + i * 44; ctx.beginPath(); ctx.moveTo(fx, h * 0.9); ctx.lineTo(fx + 16, h * 0.97); ctx.stroke(); }

  // 踏板几何
  const P = { x: w * 0.66, y: h * 0.13 };
  const L = h * 0.47;
  const snap = v.snap ?? 0;
  const ang = 0.32 - clamp(v.travel, 0, 1) * 0.62;
  const dir = { x: -Math.sin(ang), y: Math.cos(ang) };
  const nrm = { x: Math.cos(ang), y: Math.sin(ang) };
  const E = { x: P.x + dir.x * L, y: P.y + dir.y * L };
  const bend = Math.pow(clamp(v.force / v.threshold, 0, 1.2), 2.2) * L * 0.13;
  const M = { x: (P.x + E.x) / 2 + nrm.x * bend, y: (P.y + E.y) / 2 + nrm.y * bend };
  const breakPt = { x: P.x + dir.x * L * 0.22 + nrm.x * bend * 0.3, y: P.y + dir.y * L * 0.22 + nrm.y * bend * 0.3 };

  // 腿（小腿从左上方伸入）
  const knee = { x: -30, y: -50 };
  const footAng = ang;
  const sole = { x: E.x - nrm.x * 10, y: E.y - nrm.y * 10 };
  const ankle = { x: sole.x - nrm.x * 38 - dir.x * 26, y: sole.y - nrm.y * 38 - dir.y * 26 };

  if (snap > 0) {
    // 断裂：上半截留在枢轴，下半截+踏板飞走
    const fly = snap * 1.0;
    drawArm(ctx, P, breakPt, breakPt, C.GREY);
    ctx.save();
    ctx.translate(breakPt.x + fly * 160, breakPt.y + fly * 140 + fly * fly * 200);
    ctx.rotate(fly * 5);
    ctx.translate(-breakPt.x, -breakPt.y);
    drawArm(ctx, breakPt, M, E, C.GREY);
    drawPad(ctx, E, ang);
    ctx.restore();
    // 脚踩空
    drawLeg(ctx, knee, { x: ankle.x + snap * 90, y: ankle.y + snap * 60 }, footAng - snap * 0.6, { x: sole.x + snap * 90, y: sole.y + snap * 60 });
    // 碎片
    ctx.fillStyle = C.GREY; ctx.strokeStyle = C.INK; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + 0.3, d = 20 + snap * (120 + i * 25);
      const px = breakPt.x + Math.cos(a) * d, py = breakPt.y + Math.sin(a) * d * 0.7 + snap * snap * 80;
      poly(ctx, [px, py, px + 9, py + 3, px + 3, py + 10]); ctx.fill(); ctx.stroke();
    }
  } else {
    drawArm(ctx, P, M, E, stress > 0.6 ? '#d9a3a3' : C.GREY);
    drawPad(ctx, E, ang);
    drawLeg(ctx, knee, ankle, footAng, sole);
  }

  // 枢轴
  ctx.fillStyle = '#6c757d'; ctx.beginPath(); ctx.arc(P.x, P.y, 11, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = C.INK; ctx.stroke();
  ctx.fillStyle = C.INK; ctx.beginPath(); ctx.arc(P.x, P.y, 3.5, 0, Math.PI * 2); ctx.fill();

  // 裂纹：疲劳累积 + 当前应力
  if (!snap) {
    const nCrack = Math.floor(v.fatigue * 7) + (stress > 0.4 ? 2 : 0) + (stress > 0.8 ? 3 : 0);
    ctx.strokeStyle = stress > 0.7 ? C.RED : C.INK; ctx.lineWidth = 2;
    for (let i = 0; i < nCrack; i++) {
      const seed = i * 17 + 3;
      let cx = breakPt.x + (hash(seed) - 0.5) * 10, cy = breakPt.y + (hash(seed, 1) - 0.5) * 10;
      const a0 = hash(seed, 2) * Math.PI * 2;
      const len = 10 + hash(seed, 3) * 22 * (0.5 + v.fatigue + stress * 0.5);
      ctx.beginPath(); ctx.moveTo(cx, cy);
      for (let k = 1; k <= 4; k++) { const a = a0 + (hash(seed, k + 4) - 0.5) * 1.4; cx += Math.cos(a) * len / 4; cy += Math.sin(a) * len / 4; ctx.lineTo(cx, cy); }
      ctx.stroke();
    }
    // 应力线
    if (stress > 0.05) {
      ctx.strokeStyle = C.RED; ctx.lineWidth = 3; ctx.lineCap = 'round';
      const nn = 3 + Math.floor(stress * 5);
      for (let i = 0; i < nn; i++) {
        const a = (i / nn) * Math.PI * 2 + v.t * 3;
        const r0 = 22 + Math.sin(v.t * 20 + i) * 3, r1 = r0 + 8 + stress * 14;
        ctx.beginPath(); ctx.moveTo(M.x + Math.cos(a) * r0, M.y + Math.sin(a) * r0); ctx.lineTo(M.x + Math.cos(a) * r1, M.y + Math.sin(a) * r1); ctx.stroke();
      }
    }
  }

  // 文字
  if (!snap) {
    if (stress > 0.75 && Math.floor(v.t * 8) % 2 === 0) sfx(ctx, 'CRACK!', w * 0.3, h * 0.25, 46, C.RED, { rot: -0.2 });
    else if (stress > 0.05) sfx(ctx, 'CREAK...', w * 0.28, h * 0.22, 30, C.YELLOW, { rot: -0.15 });
  }
  ctx.restore();

  if (framed) {
    poly(ctx, pts); ctx.lineWidth = 6; ctx.strokeStyle = stress > 0.75 && Math.floor(v.t * 10) % 2 === 0 ? C.RED : C.INK; ctx.stroke();
    caption(ctx, '踏板特写', x + 14, y + 22, { size: 14, align: 'left', bg: C.WHITE });
    // 力值 + 进度条
    const bx = x + 34, by = y + h - 36, bw = w - 60;
    ctx.fillStyle = C.INK; ctx.fillRect(bx - 3, by - 3, bw + 6, 22);
    ctx.fillStyle = '#333'; ctx.fillRect(bx, by, bw, 16);
    const fr = clamp(v.force / PEDAL.FMAX, 0, 1);
    ctx.fillStyle = v.force > v.threshold - 150 ? C.RED : v.force > PEDAL.FATIGUE_START ? C.YELLOW : C.GREEN;
    ctx.fillRect(bx, by, bw * fr, 16);
    const tx = bx + bw * (v.threshold / PEDAL.FMAX);
    ctx.fillStyle = C.RED; ctx.fillRect(tx - 2, by - 8, 4, 32);
    ctx.font = `14px 'Bangers', Impact`; ctx.textAlign = 'center'; ctx.fillStyle = C.WHITE;
    ctx.fillText(`${Math.round(v.threshold)}`, tx, by - 12);
  }
}

function drawArm(ctx: Ctx, a: { x: number; y: number }, m: { x: number; y: number }, b: { x: number; y: number }, col: string) {
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(m.x, m.y, b.x, b.y);
  ctx.lineWidth = 17; ctx.strokeStyle = C.INK; ctx.stroke();
  ctx.lineWidth = 10; ctx.strokeStyle = col; ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.moveTo(a.x - 3, a.y); ctx.quadraticCurveTo(m.x - 3, m.y, b.x - 3, b.y); ctx.stroke();
}

function drawPad(ctx: Ctx, e: { x: number; y: number }, ang: number) {
  ctx.save();
  ctx.translate(e.x, e.y); ctx.rotate(ang);
  ctx.fillStyle = '#222'; ctx.fillRect(-9, -26, 15, 48);
  ctx.lineWidth = 3.5; ctx.strokeStyle = C.INK; ctx.strokeRect(-9, -26, 15, 48);
  ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
  for (let i = -20; i < 20; i += 7) { ctx.beginPath(); ctx.moveTo(-8, i); ctx.lineTo(-3, i + 3); ctx.stroke(); }
  ctx.restore();
}

function drawLeg(ctx: Ctx, knee: { x: number; y: number }, ankle: { x: number; y: number }, ang: number, sole: { x: number; y: number }) {
  // 小腿（牛仔裤）
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(knee.x, knee.y); ctx.lineTo(ankle.x, ankle.y);
  ctx.lineWidth = 44; ctx.strokeStyle = C.INK; ctx.stroke();
  ctx.lineWidth = 36; ctx.strokeStyle = '#3a6ea5'; ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = '#2b5384';
  ctx.beginPath(); ctx.moveTo(knee.x + 10, knee.y - 6); ctx.lineTo(ankle.x + 8, ankle.y - 10); ctx.stroke();
  // 鞋（本地坐标：x 轴 = 踏板法线方向，鞋底在 x=0）
  ctx.save();
  ctx.translate(sole.x, sole.y); ctx.rotate(ang);
  ctx.lineWidth = 4; ctx.strokeStyle = C.INK; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -34); ctx.lineTo(0, 30); ctx.quadraticCurveTo(-6, 40, -20, 38);
  ctx.lineTo(-52, 6); ctx.quadraticCurveTo(-62, -20, -48, -44); ctx.quadraticCurveTo(-20, -50, 0, -34); ctx.closePath();
  ctx.fillStyle = C.RED; ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.WHITE; ctx.fillRect(-8, -36, 9, 70); ctx.strokeRect(-8, -36, 9, 70);
  ctx.strokeStyle = C.WHITE; ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-40 + i * 7, -30 + i * 9); ctx.lineTo(-28 + i * 7, -36 + i * 9); ctx.stroke(); }
  ctx.restore();
}
