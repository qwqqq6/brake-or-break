import { C, H, TRIGGER, W } from './config';
import { AudioEngine } from './audio';
import { Input } from './input/input';
import { DualSenseHID, EFFECT_OFF, feedbackEffect, vibrationEffect, weaponEffect } from './input/dualsense-hid';
import { LEVELS, makeEndless, type LevelDef } from './levels';
import { loadSave, writeSave, type SaveData } from './save';
import { Pedal } from './sim/pedal';
import { Session, type CrashReason } from './sim/session';
import { CrashSeq } from './render/crash';
import { renderSession } from './render/scene';
import { drawBrief, drawPause, drawResult, drawSelect, drawTitle, type ResultData } from './render/screens';
import { caption } from './render/comic';
import { clamp } from './util';

type State = 'title' | 'select' | 'brief' | 'play' | 'pause' | 'crash' | 'result';

const PAUSE_ITEMS = ['继续', '重新开始', '退出到关卡选择'];
const REASONS: Record<CrashReason, string> = {
  pedal: '踏板断了!', rear: '追尾了!', ducks: '为了鸭子…', crate: '撞上货箱!',
  redlight: '闯红灯!', rollback: '溜车了!', cliff: '冲出护栏!', wall: '撞进仓库!',
};

export class Game {
  state: State = 'title';
  input = new Input();
  audio = new AudioEngine();
  hid = new DualSenseHID();
  save: SaveData = loadSave();
  t = 0;
  st = 0; // 当前状态持续时间
  sel = 0;
  levelSel = 0;
  level: LevelDef = LEVELS[0];
  session: Session | null = null;
  crash: CrashSeq | null = null;
  result: ResultData | null = null;
  toast: { text: string; t: number } | null = null;
  private snap = document.createElement('canvas');
  private cover = document.createElement('canvas');
  private frozen = false;
  /** 踏板断裂时刻（performance.now），驱动扳机"嘎巴"序列 */
  snapAt = 0;

  constructor(private canvas: HTMLCanvasElement, private ctx: CanvasRenderingContext2D) {
    this.snap.width = this.cover.width = W;
    this.snap.height = this.cover.height = H;
    this.input.onUserGesture = (code) => {
      this.audio.init();
      if (code === 'KeyM') this.audio.toggleMute();
      if (code === 'KeyH') this.requestHid();
    };
    canvas.addEventListener('pointerdown', (e) => {
      this.audio.init();
      if (this.state !== 'title') return;
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
      const items = this.titleItems();
      for (let i = 0; i < items.length; i++) {
        const iy = 420 + i * 62;
        if (x > 690 && x < 1030 && y > iy - 24 && y < iy + 26) { this.sel = i; this.activateTitle(true); }
      }
    });
    this.hid.autoConnect();
  }

  private titleItems() {
    const items = ['开始游戏', '无尽模式'];
    if (this.hid.supported) items.push(this.hid.connected ? '自适应扳机 ✓' : '自适应扳机');
    return items;
  }

  private go(s: State) { this.state = s; this.st = 0; this.sel = 0; }
  private say(text: string) { this.toast = { text, t: 0 }; }

  private async requestHid() {
    if (!this.hid.supported) return;
    if (await this.hid.request()) this.say('自适应扳机 ✓');
  }

  private startLevel(lv: LevelDef) {
    this.level = lv;
    this.session = new Session(lv);
    this.crash = null;
    this.go('play');
  }

  /** 调试 / 截图：?scene=play&level=2&sim=8&brake=0.8  或 ?scene=crash&reason=pedal&ct=3 */
  debug(q: URLSearchParams) {
    const scene = q.get('scene');
    if (!scene) return;
    const id = Number(q.get('level') || 1);
    const lv = id === 99 ? makeEndless(7) : LEVELS.find((l) => l.id === id) || LEVELS[0];
    const fake = { brake: 0, throttle: 0.5, setRumble: () => {}, pulse: () => {}, snap: () => {} } as unknown as Input;
    const fx = { audio: this.audio, input: fake };
    if (scene === 'title' || scene === 'select') { this.go(scene as State); return; }
    if (scene === 'brief') { this.level = lv; this.go('brief'); this.st = 2; return; }
    this.startLevel(lv);
    const s = this.session!;
    s.countdown = 0.01;
    s.update(0.02, fake, fx);
    const sim = Number(q.get('sim') || 3);
    for (let i = 0; i < sim * 60 && s.status === 'run'; i++) s.update(1 / 60, fake, fx);
    const b = Number(q.get('brake') || 0);
    if (b) { s.pedal.update(b, 1 / 60, true); s.peak = Math.max(s.peak, s.pedal.force); }
    const fat = q.get('fatigue'); if (fat) s.pedal.fatigue = Number(fat);
    this.input.brake = b;
    if (scene === 'crash') {
      s.status = 'run';
      s.crash((q.get('reason') || 'pedal') as CrashReason, fx, (q.get('target') || undefined) as never);
      this.render();
      const ct = Number(q.get('ct') || 0);
      for (let t = 0; t < ct; t += 1 / 60) this.crash?.update(1 / 60, () => {});
      if (q.get('result')) { this.crash!.t = 99; this.crash!.done = true; }
    }
    if (scene === 'done') { s.status = 'run'; (s as unknown as { finish: () => void }).finish(); s.doneT = 0.5; if (q.get('result')) this.finishResult(true); }
    if (q.get('freeze')) this.frozen = true;
  }

  update(dt: number, now: number) {
    if (this.frozen) { this.t += dt; return; }
    this.t += dt; this.st += dt;
    if (this.toast) { this.toast.t += dt; if (this.toast.t > 3) this.toast = null; }
    this.input.update(dt, now);
    const inp = this.input;
    const nav = (n: number, cols = 1) => {
      let d = 0;
      if (inp.pressed('up')) d -= cols;
      if (inp.pressed('down')) d += cols;
      if (cols > 1) { if (inp.pressed('left')) d -= 1; if (inp.pressed('right')) d += 1; }
      if (d) { this.sel = (this.sel + d + n) % n; this.audio.select(); }
    };

    switch (this.state) {
      case 'title':
        nav(this.titleItems().length);
        if (inp.pressed('confirm')) this.activateTitle(false);
        break;
      case 'select': {
        const n = LEVELS.length + 1;
        nav(n, 3);
        if (inp.pressed('back')) { this.go('title'); break; }
        if (inp.pressed('confirm')) {
          this.audio.init();
          this.levelSel = this.sel;
          this.level = this.sel < LEVELS.length ? LEVELS[this.sel] : makeEndless(Date.now() & 0xffff);
          this.go('brief');
        }
        break;
      }
      case 'brief':
        if (inp.pressed('back')) { this.go('select'); this.sel = this.levelSel; break; }
        if (inp.pressed('confirm') && this.st > 0.3) this.startLevel(this.level);
        break;
      case 'play': {
        const s = this.session!;
        if (inp.pressed('pause') && s.status !== 'crash') { this.go('pause'); this.audio.silence(); this.input.setRumble(0, 0); break; }
        const wasRun = s.status === 'run';
        s.update(dt, inp, { audio: this.audio, input: inp });
        if (wasRun && s.status === 'crash' && s.crashReason === 'pedal') { this.snapAt = now; this.updateHid(now); }
        this.audio.drive({ speed: s.van.v, throttle: inp.throttle, force: s.pedal.force, locked: s.van.locked, temp: s.van.temp, rain: s.def.rain, active: s.status !== 'crash' });
        if (s.status === 'done' && s.doneT > 2.2) this.finishResult(true);
        break;
      }
      case 'pause':
        nav(PAUSE_ITEMS.length);
        if (inp.pressed('back') && this.st > 0.1) { this.state = 'play'; break; }
        if (inp.pressed('confirm')) {
          if (this.sel === 0) this.state = 'play';
          else if (this.sel === 1) this.startLevel(this.level.endless ? makeEndless(Date.now() & 0xffff) : this.level);
          else { this.go('select'); this.sel = this.levelSel; this.session = null; }
        }
        break;
      case 'crash': {
        const c = this.crash!;
        this.audio.silence();
        c.update(dt, (cue) => {
          if (cue === 'p2') { this.audio.whoosh(); this.input.pulse(0.3, 0.6, 150); }
          if (cue === 'p3') { this.audio.whoosh(); this.audio.horn(); }
          if (cue === 'p4') { this.audio.crash(); this.input.pulse(1, 1, 1200); }
        });
        if (inp.pressed('confirm')) c.skip();
        break;
      }
      case 'result': {
        const r = this.result!;
        if (this.st < 0.6) break;
        if (inp.pressed('back')) { this.go('select'); this.sel = this.levelSel; break; }
        if (r.success && !r.endless) {
          if (inp.pressed('confirm')) {
            const i = LEVELS.findIndex((l) => l.id === r.level.id);
            if (i >= 0 && i < LEVELS.length - 1) { this.levelSel = i + 1; this.level = LEVELS[i + 1]; this.go('brief'); }
            else { this.go('select'); this.sel = this.levelSel; }
          } else if (inp.pressed('alt')) this.startLevel(r.level);
        } else if (inp.pressed('confirm') || inp.pressed('alt')) {
          this.startLevel(r.endless ? makeEndless(Date.now() & 0xffff) : r.level);
        }
        break;
      }
    }
    this.updateHid(now);
    inp.endFrame();
  }

  private activateTitle(fromPointer: boolean) {
    this.audio.init();
    this.audio.select();
    switch (this.sel) {
      case 0: this.go('select'); this.sel = this.levelSel; break;
      case 1: this.levelSel = LEVELS.length; this.level = makeEndless(Date.now() & 0xffff); this.go('brief'); break;
      case 2:
        // 浏览器只允许鼠标/键盘触发设备授权弹窗
        if (fromPointer || this.input.source === 'kb') this.requestHid();
        else this.say('用鼠标点一下');
        break;
    }
  }

  private finishResult(success: boolean) {
    const s = this.session!;
    this.save.issue += 1;
    const lv = s.def;
    let best = 0, newBest = false;
    const rank = success ? s.rank() : '-';
    const score = Math.max(0, Math.floor(s.score));
    if (lv.endless) {
      best = this.save.endlessBest;
      if (score > best) { this.save.endlessBest = score; newBest = true; best = score; }
    } else if (success) {
      const b = this.save.best[lv.id];
      if (!b || score > b.score) { this.save.best[lv.id] = { score, rank }; newBest = true; }
      best = this.save.best[lv.id].score;
    }
    writeSave(this.save);
    this.result = {
      success, endless: !!lv.endless, level: lv, score, rank,
      reason: REASONS[s.crashReason], peak: s.peak, distance: Math.max(0, s.van.s), time: s.time,
      coffee: s.coffee, fatigue: s.pedal.fatigue, bonuses: success ? s.bonuses : [], best, newBest, issue: this.save.issue,
    };
    this.audio.silence();
    this.input.setRumble(0, 0);
    this.go('result');
  }

  /** 自适应扳机 + 灯条 + 马达 */
  private updateHid(now: number) {
    if (!this.hid.connected) { this.input.rumbleSink = null; return; }
    if (!this.input.rumbleSink) this.input.rumbleSink = (s, w) => this.hid.setMotor(s, w);
    const s = this.session;
    // 断裂瞬间：扳机先高频"咔"地一抖，然后彻底松垮（踩空）
    if (this.snapAt > 0) {
      const dtSnap = now - this.snapAt;
      if (dtSnap < TRIGGER.SNAP_MS + TRIGGER.LIMP_MS) {
        const shaking = dtSnap < TRIGGER.SNAP_MS;
        this.hid.setLeft(shaking ? vibrationEffect(0, 8, TRIGGER.SNAP_FREQ) : EFFECT_OFF);
        this.hid.setRight(EFFECT_OFF);
        this.hid.setLight(shaking ? 255 : Math.floor(this.t * 10) % 2 ? 255 : 30, shaking ? 255 : 0, shaking ? 255 : 0);
        this.hid.flush(now);
        return;
      }
      this.snapAt = 0;
    }
    if (this.state === 'play' && s && s.status !== 'crash') {
      const thr = s.pedal.threshold;
      const f = s.pedal.force;
      const max = this.input.calib.brakeMax || 1;
      // 断点在扳机原始行程上的位置（10 个区段）
      const zt = (0.02 + Pedal.travelOf(thr) * (max - 0.02)) * 10;
      const wall = Math.floor(zt);
      const k = clamp(f / thr, 0, 1);
      if (k >= TRIGGER.CLICK_AT && wall >= 3) {
        // 危险区：武器模式，阻力顶到断点后突然释放 → 嘎巴
        this.hid.setLeft(weaponEffect(wall - 2, wall, TRIGGER.WALL));
      } else {
        const strengths: number[] = [];
        for (let i = 0; i < 10; i++) {
          if (i >= wall) strengths.push(TRIGGER.WALL);
          else strengths.push(Math.round(TRIGGER.DAMP_START + (TRIGGER.DAMP_END - TRIGGER.DAMP_START) * (i / Math.max(1, wall - 1))));
        }
        this.hid.setLeft(feedbackEffect(strengths));
      }
      this.hid.setRight(feedbackEffect([0, 2, 2, 2, 2, 2, 2, 2, 2, 2]));
      this.hid.setLight(k < 0.75 ? k / 0.75 * 255 : 255, k < 0.75 ? 255 : (1 - (k - 0.75) / 0.25) * 255, 0);
    } else {
      this.hid.setLeft(EFFECT_OFF);
      this.hid.setRight(EFFECT_OFF);
      if (this.state === 'crash') this.hid.setLight(Math.floor(this.t * 8) % 2 ? 255 : 40, 0, 0);
      else this.hid.setLight(255, 200, 40);
    }
    this.hid.flush(now);
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    switch (this.state) {
      case 'title': drawTitle(ctx, this.t, this.titleItems(), this.sel); break;
      case 'select': drawSelect(ctx, this.t, LEVELS, this.sel, this.save); break;
      case 'brief': drawBrief(ctx, this.st, this.level, this.input); break;
      case 'play':
      case 'pause': {
        const s = this.session!;
        renderSession(ctx, s, this.t, this.input);
        if (this.state === 'pause') drawPause(ctx, PAUSE_ITEMS, this.sel);
        else if (s.status === 'crash' && !this.crash) {
          // 冻结当前画面进入撞车分镜
          this.snap.getContext('2d')!.drawImage(this.canvas, 0, 0);
          this.crash = new CrashSeq(s.crashReason, s.crashTarget, this.snap, s.van.v);
          this.go('crash');
        }
        break;
      }
      case 'crash': {
        const c = this.crash!;
        c.draw(ctx);
        if (c.done) {
          this.cover.getContext('2d')!.drawImage(this.canvas, 0, 0);
          this.finishResult(false);
        }
        break;
      }
      case 'result': drawResult(ctx, this.st, this.result!, this.input, this.result!.success ? undefined : this.cover); break;
    }
    if (this.toast) {
      const a = clamp(3 - this.toast.t, 0, 1);
      ctx.globalAlpha = a;
      caption(ctx, this.toast.text, W / 2, 20, { size: 20, bg: C.WHITE });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
