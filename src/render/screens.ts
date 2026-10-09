import { C, H, PEDAL, W } from '../config';
import type { LevelDef } from '../levels';
import type { Input } from '../input/input';
import type { SaveData } from '../save';
import { clamp, easeOutBack, fmtTime } from '../util';
import { bubble, burst, caption, dots, font, panel, sfx, speedLines } from './comic';
import { drawFace, drawVan } from './crash';
import { drawPedalCam } from './pedalcam';

type Ctx = CanvasRenderingContext2D;

function comicBg(ctx: Ctx, a: string, b: string, t: number) {
  ctx.fillStyle = a; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = dots(ctx, b, 14, 4); ctx.fillRect(0, 0, W, H);
  speedLines(ctx, W / 2, H / 2, 260, 1000, 80, 'rgba(255,255,255,0.25)', Math.floor(t * 2), 5);
}

export function drawTitle(ctx: Ctx, t: number, items: string[], sel: number, input: Input, hidStatus: string) {
  comicBg(ctx, C.YELLOW, 'rgba(230,57,70,0.35)', t);
  burst(ctx, 640, 230, 520, 330, 24, C.RED, 8, t * 0.05, 2);
  ctx.save(); ctx.translate(640, 170); ctx.rotate(-0.05);
  const sc = 1 + Math.sin(t * 3) * 0.02; ctx.scale(sc, sc);
  sfx(ctx, 'BRAKE OR BREAK!', 0, 0, 120, C.YELLOW, { lw: 18, skew: -0.12 });
  sfx(ctx, '别踩断它！', 0, 110, 72, C.WHITE, { lw: 14, rot: 0.03 });
  ctx.restore();
  // 面包车 + 断踏板
  const bob = Math.abs(Math.sin(t * 6)) * 6;
  drawVan(ctx, 70, 640 - bob, 0.9, false);
  sfx(ctx, 'CREAK...', 230, 440, 38, C.WHITE, { rot: -0.15 });

  // 菜单
  items.forEach((it, i) => {
    const y = 420 + i * 62, on = i === sel;
    const x = 860 + (on ? -14 : 0);
    ctx.save(); ctx.translate(x, y); ctx.rotate(on ? -0.03 : 0);
    ctx.fillStyle = C.INK; ctx.fillRect(-170 + 6, -24 + 6, 340, 50);
    ctx.fillStyle = on ? C.RED : C.WHITE; ctx.fillRect(-170, -24, 340, 50);
    ctx.lineWidth = 4; ctx.strokeStyle = C.INK; ctx.strokeRect(-170, -24, 340, 50);
    ctx.fillStyle = on ? C.YELLOW : C.INK; ctx.font = font(it, 26); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(it, 0, 2);
    ctx.restore();
  });
  const pad = input.padConnected ? `🎮 已连接：${input.padName.slice(0, 40)}` : '🎮 未检测到手柄：连接后按任意键激活（或用键盘游玩）';
  caption(ctx, pad, 20, 668, { size: 15, align: 'left', bg: input.padConnected ? C.GREEN : C.WHITE });
  caption(ctx, `自适应扳机：${hidStatus}`, 20, 630, { size: 15, align: 'left', bg: C.WHITE });
  ctx.fillStyle = C.INK; ctx.font = font('确认', 16); ctx.textAlign = 'right';
  ctx.fillText(`${input.glyph('up')}${input.glyph('down')} 选择   ${input.glyph('confirm')} 确认   M 静音   点击画面开启声音`, W - 20, H - 16);
}

export function drawSelect(ctx: Ctx, t: number, levels: LevelDef[], sel: number, save: SaveData, input: Input) {
  comicBg(ctx, C.CYAN, 'rgba(29,143,209,0.4)', t);
  sfx(ctx, '选择关卡', 640, 60, 58, C.YELLOW, { rot: -0.03 });
  const all = [...levels.map((l) => l.id), 99];
  all.forEach((id, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 70 + col * 390, y = 110 + row * 196;
    const w = 360, h = 176;
    const on = i === sel;
    const lv = id === 99 ? null : levels.find((l) => l.id === id)!;
    const pts = [x, y + (col % 2 ? 8 : 0), x + w, y + (col % 2 ? 0 : 8), x + w - 6, y + h, x + 6, y + h - 4];
    ctx.save();
    if (on) { ctx.translate(x + w / 2, y + h / 2); ctx.scale(1.04, 1.04); ctx.rotate(-0.015); ctx.translate(-x - w / 2, -y - h / 2); }
    panel(ctx, pts, () => {
      ctx.fillStyle = on ? C.YELLOW : C.PAPER; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = dots(ctx, on ? 'rgba(230,57,70,0.3)' : 'rgba(0,0,0,0.1)', 9, 2.2); ctx.fillRect(x, y, w, h);
      sfx(ctx, lv ? lv.code : '∞', x + 52, y + 58, 66, on ? C.RED : C.WHITE, { rot: -0.08 });
      ctx.fillStyle = C.INK; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = font('中', 28); ctx.fillText(lv ? lv.name : '无尽模式', x + 110, y + 56);
      ctx.font = "18px 'Bangers', Impact"; ctx.fillText(lv ? lv.subtitle : 'ENDLESS', x + 112, y + 80);
      ctx.font = font('中', 14);
      wrap(ctx, lv ? lv.desc : '路没有尽头，事件越来越密，车也越来越重。', x + 20, y + 110, w - 40, 20, 2);
      const best = lv ? save.best[lv.id] : null;
      const txt = lv ? (best ? `最佳 ${best.score.toLocaleString()}  评级 ${best.rank}` : '未通关') : `最佳 ${save.endlessBest.toLocaleString()}`;
      ctx.font = font(txt, 15); ctx.fillStyle = best || !lv ? C.INK : C.GREY; ctx.fillText(txt, x + 20, y + h - 14);
      if (best) sfx(ctx, best.rank, x + w - 40, y + h - 36, 44, best.rank === 'S' ? C.YELLOW : C.WHITE, { rot: 0.15 });
    });
    ctx.restore();
  });
  ctx.fillStyle = C.INK; ctx.font = font('确认', 16); ctx.textAlign = 'right';
  ctx.fillText(`方向键选择   ${input.glyph('confirm')} 开始   ${input.glyph('back')} 返回`, W - 20, H - 14);
}

function wrap(ctx: Ctx, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 9) {
  let line = '', n = 0;
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, y + n * lh); line = ch; if (++n >= maxLines) return; }
    else line += ch;
  }
  if (line) ctx.fillText(line, x, y + n * lh);
}

export function drawBrief(ctx: Ctx, t: number, lv: LevelDef, input: Input) {
  comicBg(ctx, C.PAPER, 'rgba(29,143,209,0.25)', t);
  const k = easeOutBack(clamp(t * 3, 0, 1));
  ctx.save(); ctx.translate(640, 360); ctx.scale(k, k); ctx.translate(-640, -360);
  panel(ctx, [60, 60, 760, 40, 740, 660, 80, 680], () => {
    ctx.fillStyle = C.WHITE; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = dots(ctx, 'rgba(0,0,0,0.08)', 8, 2); ctx.fillRect(0, 0, W, H);
    sfx(ctx, `LEVEL ${lv.code}`, 220, 110, 48, C.RED, { rot: -0.05 });
    ctx.fillStyle = C.INK; ctx.textAlign = 'left'; ctx.font = font('中', 50); ctx.fillText(lv.name, 110, 200);
    ctx.font = "24px 'Bangers', Impact"; ctx.fillText(lv.subtitle, 114, 232);
    ctx.font = font('中', 20); wrap(ctx, lv.desc, 110, 290, 600, 30, 3);
    caption(ctx, '提示', 110, 380, { size: 18, align: 'left', bg: C.YELLOW });
    ctx.fillStyle = C.INK; ctx.font = font('中', 18); ctx.textAlign = 'left';
    lv.tips.forEach((tip, i) => { ctx.fillText(`● ${tip}`, 120, 446 + i * 38); });
    const tags: string[] = [];
    if (lv.rain) tags.push('雨天 低附着');
    if (lv.cargo) tags.push(`载货 +${lv.cargo}kg`);
    if (lv.sky === 'night') tags.push('夜间');
    if (lv.tailgater) tags.push('后车跟随');
    tags.forEach((tg, i) => caption(ctx, tg, 110 + i * 150, 590, { size: 16, align: 'left', bg: C.RED, fg: C.WHITE }));
  });
  panel(ctx, [790, 70, 1220, 90, 1230, 450, 780, 430], () => {
    ctx.fillStyle = C.CYAN; ctx.fillRect(0, 0, W, H);
    speedLines(ctx, 1005, 260, 100, 400, 50, 'rgba(255,255,255,0.5)', 4, 3);
    drawFace(ctx, 1005, 280, 0.8, 0.2);
  });
  if (lv.quote) bubble(ctx, `销售：${lv.quote}`, 990, 132, 19, 1215, 200);
  ctx.restore();
  const blink = Math.floor(t * 2.5) % 2 === 0;
  if (blink) sfx(ctx, `按 ${input.glyph('confirm')} 出发!`, 1005, 540, 48, C.YELLOW, { rot: -0.04 });
  ctx.fillStyle = C.INK; ctx.font = font('返回', 16); ctx.textAlign = 'right';
  ctx.fillText(`${input.glyph('back')} 返回`, W - 20, H - 14);
}

export interface ResultData {
  success: boolean; endless: boolean; level: LevelDef; score: number; rank: string;
  reason: string; peak: number; distance: number; time: number; coffee: number; fatigue: number;
  bonuses: [string, number][]; best: number; newBest: boolean; issue: number;
}

export function drawResult(ctx: Ctx, t: number, r: ResultData, input: Input, cover?: HTMLCanvasElement) {
  // 漫画杂志封面
  ctx.fillStyle = C.INK; ctx.fillRect(0, 0, W, H);
  const k = easeOutBack(clamp(t * 2.5, 0, 1));
  ctx.save(); ctx.translate(640, 360); ctx.scale(k, k); ctx.rotate((1 - k) * 0.1); ctx.translate(-640, -360);
  // 封面纸
  ctx.fillStyle = C.PAPER; ctx.fillRect(40, 20, 1200, 680);
  ctx.save(); ctx.beginPath(); ctx.rect(40, 20, 1200, 680); ctx.clip();
  if (cover) {
    // 裁切撞车大格中间部分，铺满左侧封面区
    ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(cover, 168, 0, 944, 720, 40, 120, 760, 580); ctx.restore();
  } else {
    ctx.fillStyle = r.success ? C.CYAN : C.RED; ctx.fillRect(40, 120, 760, 580);
    speedLines(ctx, 420, 400, 100, 700, 60, 'rgba(255,255,255,0.4)', 2, 5);
  }
  if (r.success) {
    burst(ctx, 420, 420, 260, 170, 18, C.YELLOW, 6, 0.1, 4);
    drawVan(ctx, 270, 520, 0.95, false);
  }
  ctx.fillStyle = dots(ctx, 'rgba(0,0,0,0.12)', 10, 2.5); ctx.fillRect(40, 120, 760, 580);
  ctx.restore();
  // 刊头
  ctx.fillStyle = C.RED; ctx.fillRect(40, 20, 1200, 100);
  sfx(ctx, 'BRAKE OR BREAK', 360, 70, 72, C.YELLOW, { lw: 12, skew: -0.12 });
  ctx.fillStyle = C.WHITE; ctx.font = "22px 'Bangers', Impact"; ctx.textAlign = 'right';
  ctx.fillText(`ISSUE #${String(r.issue).padStart(3, '0')}  ·  ¥5`, 1220, 60);
  ctx.font = font('中', 16); ctx.fillText(r.endless ? '无尽模式特刊' : `${r.level.code} · ${r.level.name}`, 1220, 92);
  ctx.lineWidth = 8; ctx.strokeStyle = C.INK; ctx.strokeRect(40, 20, 1200, 680);
  // 大标题
  const head = r.success ? '安全抵达!' : r.reason;
  ctx.save(); ctx.translate(420, 610); ctx.rotate(-0.04);
  sfx(ctx, head, 0, 0, 70, r.success ? C.YELLOW : C.WHITE, { lw: 14 });
  ctx.restore();
  // 右栏数据
  const x0 = 830;
  ctx.fillStyle = C.INK; ctx.textAlign = 'left'; ctx.font = font('中', 22);
  ctx.fillText(r.success ? '本期头条：' : '事故报道：', x0, 170);
  const rows: [string, string][] = [
    ['得分', Math.floor(r.score).toLocaleString()],
    ['最高踩力', `${Math.round(r.peak)} N`],
    ['行驶距离', `${Math.round(r.distance)} m`],
    ['用时', fmtTime(r.time)],
    ['咖啡剩余', `${Math.round(r.coffee)}%`],
    ['踏板疲劳', `${Math.round(r.fatigue * 100)}%`],
  ];
  rows.forEach(([a, b], i) => {
    const y = 210 + i * 40;
    ctx.fillStyle = i % 2 ? '#f3e3c3' : '#fff'; ctx.fillRect(x0, y, 380, 36);
    ctx.lineWidth = 2; ctx.strokeStyle = C.INK; ctx.strokeRect(x0, y, 380, 36);
    ctx.fillStyle = C.INK; ctx.font = font(a, 18); ctx.fillText(a, x0 + 12, y + 25);
    ctx.font = "24px 'Bangers', Impact"; ctx.textAlign = 'right'; ctx.fillText(b, x0 + 368, y + 27); ctx.textAlign = 'left';
  });
  let by = 210 + rows.length * 40 + 16;
  for (const [n, v] of r.bonuses) { ctx.font = font(n, 16); ctx.fillStyle = C.INK; ctx.fillText(`+ ${n}`, x0 + 12, by + 14); ctx.textAlign = 'right'; ctx.fillText(`+${v}`, x0 + 368, by + 14); ctx.textAlign = 'left'; by += 24; }
  if (r.newBest) caption(ctx, 'NEW BEST!', x0 + 190, by + 6, { size: 24, bg: C.YELLOW, rot: -0.05 });
  // 评级印章
  if (r.success) {
    ctx.save(); ctx.translate(690, 230); ctx.rotate(0.2);
    const st = easeOutBack(clamp((t - 0.4) * 3, 0, 1)); ctx.scale(st, st);
    burst(ctx, 0, 0, 90, 70, 16, r.rank === 'S' ? C.YELLOW : C.WHITE, 6, 0, 8);
    sfx(ctx, r.rank, 0, 6, 110, r.rank === 'S' ? C.RED : C.INK, { lw: 10 });
    ctx.restore();
  }
  ctx.restore();
  // 操作
  const opts = r.success && !r.endless
    ? `${input.glyph('confirm')} 下一关   ${input.glyph('alt')} 再来一次   ${input.glyph('back')} 关卡选择`
    : `${input.glyph('confirm')} 再来一期   ${input.glyph('back')} 关卡选择`;
  if (t > 0.6) caption(ctx, opts, 1020, 652, { size: 17, bg: C.WHITE });
}

export function drawPause(ctx: Ctx, items: string[], sel: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = dots(ctx, 'rgba(255,210,63,0.25)', 10, 2.5); ctx.fillRect(0, 0, W, H);
  sfx(ctx, '暂停', 640, 200, 90, C.YELLOW, { rot: -0.04 });
  items.forEach((it, i) => {
    const y = 320 + i * 70, on = i === sel;
    ctx.fillStyle = C.INK; ctx.fillRect(500 + 6, y - 26 + 6, 280, 52);
    ctx.fillStyle = on ? C.RED : C.WHITE; ctx.fillRect(500, y - 26, 280, 52);
    ctx.lineWidth = 4; ctx.strokeStyle = C.INK; ctx.strokeRect(500, y - 26, 280, 52);
    ctx.fillStyle = on ? C.YELLOW : C.INK; ctx.font = font(it, 26); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it, 640, y + 2);
    ctx.textBaseline = 'alphabetic';
  });
}

export interface CalibView { raw: number; rawGas: number; max: number; force: number; travel: number; t: number; padConnected: boolean; hid: string }

export function drawCalib(ctx: Ctx, v: CalibView, input: Input) {
  comicBg(ctx, C.PAPER, 'rgba(29,143,209,0.2)', v.t);
  sfx(ctx, '手柄校准', 640, 60, 58, C.YELLOW, { rot: -0.03 });
  panel(ctx, [60, 110, 640, 100, 650, 600, 50, 610], () => {
    ctx.fillStyle = C.WHITE; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.INK; ctx.textAlign = 'left'; ctx.font = font('中', 20);
    const lines = [
      v.padConnected ? '① 把 L2 慢慢按到底，再松开' : '① 请先连接 PS5 手柄，按任意键激活',
      '② 观察右边的踏板：力会随行程非线性增加',
      '③ 试试停在 1500N 附近——这里可以随便踩，不会断',
      `④ 按 ${input.glyph('confirm')} 保存校准   ${input.glyph('back')} 返回`,
    ];
    lines.forEach((l, i) => ctx.fillText(l, 90, 160 + i * 40));
    const bar = (label: string, val: number, y: number, col: string) => {
      ctx.fillStyle = C.INK; ctx.font = font(label, 18); ctx.fillText(label, 90, y - 8);
      ctx.fillStyle = '#ddd'; ctx.fillRect(90, y, 500, 26); ctx.fillStyle = col; ctx.fillRect(90, y, 500 * clamp(val, 0, 1), 26);
      ctx.lineWidth = 3; ctx.strokeStyle = C.INK; ctx.strokeRect(90, y, 500, 26);
      ctx.font = "20px 'Bangers', Impact"; ctx.fillStyle = C.INK; ctx.fillText(val.toFixed(3), 600, y + 21);
    };
    bar('L2 原始值', v.raw, 360, C.RED);
    ctx.fillStyle = C.INK; ctx.fillRect(90 + 500 * v.max - 2, 352, 4, 42);
    bar('R2 原始值', v.rawGas, 440, C.GREEN);
    ctx.font = font('中', 16); ctx.fillStyle = C.INK;
    ctx.fillText(`记录到的 L2 最大值：${v.max.toFixed(3)}（黑线）`, 90, 510);
    ctx.fillText(`断点 1600N 约在扳机 ${(Math.pow(PEDAL.BREAK / PEDAL.FMAX, 1 / PEDAL.GAMMA) * 100).toFixed(0)}% 行程处`, 90, 540);
    ctx.fillText(`自适应扳机：${v.hid}`, 90, 570);
  });
  drawPedalCam(ctx, 690, 110, 540, 340, { travel: v.travel, force: v.force, threshold: PEDAL.BREAK, fatigue: 0, t: v.t });
  // 简易力表
  const gx = 960, gy = 600, r = 110;
  ctx.save();
  ctx.beginPath(); ctx.arc(gx, gy, r, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fillStyle = C.WHITE; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = C.INK; ctx.stroke();
  const toA = (f: number) => Math.PI + (f / PEDAL.FMAX) * Math.PI;
  const z = (a: number, b: number, c: string) => { ctx.beginPath(); ctx.arc(gx, gy, r - 12, toA(a), toA(b)); ctx.lineWidth = 18; ctx.strokeStyle = c; ctx.stroke(); };
  z(0, 1200, C.GREEN); z(1200, 1600, C.YELLOW); z(1600, 2000, C.RED);
  const a = toA(clamp(v.force, 0, PEDAL.FMAX));
  ctx.strokeStyle = C.INK; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(a) * (r - 10), gy + Math.sin(a) * (r - 10)); ctx.stroke();
  ctx.font = "36px 'Bangers', Impact"; ctx.fillStyle = v.force > 1600 ? C.RED : C.INK; ctx.textAlign = 'center'; ctx.fillText(`${Math.round(v.force)}N`, gx, gy - 24);
  ctx.restore();
  if (v.force > 1600) sfx(ctx, '这里就会断!', 960, 470, 40, C.RED, { rot: -0.06 });
}
