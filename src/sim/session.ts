import { AUTO, C, CURVE, ROAD, VAN } from '../config';
import type { CrosserKind, LevelDef, LeadSpawn } from '../levels';
import type { AudioEngine } from '../audio';
import type { Input } from '../input/input';
import { clamp, lerp, rng } from '../util';
import { Road } from './road';
import { Vehicle } from './vehicle';
import { Pedal } from './pedal';
import { LeadCar } from './lead';

export type CrashReason = 'pedal' | 'rear' | 'worker' | 'dog' | 'sprain' | 'wall';
export type CrashTarget = 'car' | 'truck' | 'bin' | 'pole' | 'wall' | 'ditch';

export interface Popup { text: string; sub?: string; color: string; t: number; life: number; size: number; rot: number; y: number }
export interface StopRT { s: number; final: boolean; scored: boolean; done: boolean; stoppedT: number }
export interface CrosserRT {
  s: number; kind: CrosserKind; ttc: number; block: number;
  state: 'idle' | 'enter' | 'block' | 'exit' | 'clear'; t: number; x: number; side: number;
}
export interface Danger { kind: 'crosser' | 'lead' | 'stop'; d: number }
export interface Stain { x: number; y: number; r: number; seed: number }
export interface Drop { x: number; y: number; vx: number; vy: number; life: number }

export interface Fx { audio: AudioEngine; input: Input }

const HW = ROAD.HALF_W;
const CROSS = {
  worker: { tin: 1.3, tout: 1.5, bx: 0.7 },
  dog: { tin: 0.45, tout: 0.55, bx: 0.2 },
};

export class Session {
  def: LevelDef;
  road: Road;
  van: Vehicle;
  pedal = new Pedal();
  mu: number;
  lead: LeadCar | null = null;
  private leadQ: LeadSpawn[];
  stops: StopRT[] = [];
  crossers: CrosserRT[] = [];

  status: 'countdown' | 'run' | 'crash' | 'done' = 'countdown';
  countdown = 3.2;
  time = 0;
  doneT = 0;
  score = 0;
  combo = 1;
  popups: Popup[] = [];
  crashReason: CrashReason = 'pedal';
  crashTarget: CrashTarget = 'pole';
  bonuses: [string, number][] = [];

  /** 自动驾驶 */
  auto = true;
  throttle = 0;
  cruise: number;
  danger: Danger | null = null;
  /** 退出自动驾驶分镜剩余时间（真实秒） */
  takeover = 0;
  private resumeT = 0;
  private timeScale = 1;
  inCurve = false;
  sharpCurve = false;
  curveOver = 0;

  coffee = 100;
  stains: Stain[] = [];
  drops: Drop[] = [];
  shake = 0;
  flash = 0;
  bgX = 0;
  dice = { lon: 0, vlon: 0, lat: 0, vlat: 0 };
  peak = 0;
  maxSpeed = 0;
  saves = 0;
  private app = { active: false, peak: 0, v0: 0 };
  private spillCd = 0;
  private creakCd = 0;
  private skidCd = 0;
  private cdStep = 4;
  private rand = rng(12345);

  constructor(def: LevelDef) {
    this.def = def;
    this.road = new Road(def.sections, def.events, def.theme, def.seed);
    this.van = new Vehicle(VAN.MASS + def.cargo, 0, def.startSpeed);
    this.mu = def.mu;
    this.cruise = def.autoSpeed;
    this.leadQ = [...def.leads].sort((a, b) => a.at - b.at);
    for (const e of def.events) {
      if (e.type === 'stop') this.stops.push({ s: e.s, final: !!e.final, scored: false, done: false, stoppedT: 0 });
      else this.crossers.push({ s: e.s, kind: e.kind, ttc: e.ttc, block: e.block, state: 'idle', t: 0, x: 0, side: 1 });
    }
    this.stops.sort((a, b) => a.s - b.s);
  }

  get finalStop() { return this.stops.find((s) => s.final) || null; }
  /** 该踩刹车了（显示大提示） */
  get needBrake() { return this.status === 'run' && !!this.danger && this.van.v > 1.5 && this.pedal.force < 300; }

  pop(text: string, color: string, sub?: string, size = 70) {
    this.popups.push({ text, sub, color, t: 0, life: 1.6, size, rot: (this.rand() - 0.5) * 0.18, y: 0 });
    if (this.popups.length > 4) this.popups.shift();
  }

  update(dt: number, input: Input, fx: Fx) {
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < p.life);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.updateDrops(dt);

    if (this.status === 'countdown') {
      this.pedal.update(input.brake, dt, true);
      this.countdown -= dt;
      const step = Math.ceil(this.countdown);
      if (step < this.cdStep && step >= 0) { this.cdStep = step; fx.audio.beep(step === 0); }
      if (this.countdown <= 0) { this.status = 'run'; this.pedal.reset(); }
      return;
    }
    if (this.status === 'crash') return;
    if (this.status === 'done') {
      this.doneT += dt;
      this.pedal.update(input.brake, dt, true);
      this.van.step(dt, 0, 2000, this.road.gradeAt(this.van.s), this.mu);
      return;
    }
    // 退出自动驾驶分镜期间慢动作
    let sim = dt;
    this.timeScale = 1;
    if (this.takeover > 0) { this.takeover = Math.max(0, this.takeover - dt); sim = dt * AUTO.SLOWMO_SCALE; this.timeScale = AUTO.SLOWMO_SCALE; }
    const n = Math.max(1, Math.ceil(sim / (1 / 120)));
    const h = sim / n;
    for (let i = 0; i < n && this.status === 'run'; i++) this.step(h, input, fx);
    this.frameFx(dt, fx);
  }

  private step(h: number, input: Input, fx: Fx) {
    const pedal = this.pedal, van = this.van;
    // 踏板按真实时间计算踩踏速度：慢动作里正常踩不会被误判成猛踩
    pedal.update(input.brake, h / this.timeScale);
    if (pedal.broken) { this.crash('pedal', fx); return; }
    this.peak = Math.max(this.peak, pedal.force);

    // 弯道：刹车空间被压缩，超限车轮崴；猛踩直接破 1600 仍算踏板断
    const k = Math.abs(this.road.curveAt(van.s));
    this.inCurve = k > CURVE.MIN && van.v > 3;
    this.sharpCurve = k > CURVE.SHARP && van.v > 8;
    if (this.sharpCurve && pedal.force > CURVE.LIMIT) {
      this.curveOver += h;
      if (this.curveOver > CURVE.GRACE) { this.crash('sprain', fx, 'ditch'); return; }
    } else this.curveOver = 0;

    // 自动驾驶
    if (this.def.endless) this.cruise = lerp(this.def.autoSpeed, this.def.autoSpeedMax, clamp(van.s / 8000, 0, 1));
    this.danger = this.findDanger();
    if (this.auto) {
      if (this.danger) {
        this.auto = false; this.resumeT = 0;
        this.takeover = AUTO.TAKEOVER_SLOWMO;
        fx.audio.takeover();
      } else if (pedal.force > 150) { this.auto = false; this.resumeT = 0; }
    } else if (!this.danger && pedal.force < 50) {
      this.resumeT += h;
      if (this.resumeT > AUTO.RESUME_DELAY) { this.auto = true; fx.audio.engage(); }
    } else this.resumeT = 0;

    let autoBrake = 0;
    if (this.auto) {
      // 玩家可以用 R2 / ↑ 在巡航速度上加速（分数随速度增加）
      let target = this.cruise * (this.inCurve ? AUTO.CURVE_SLOW : 1) + input.throttle * AUTO.BOOST;
      const l = this.lead;
      if (l && l.solid) {
        const gap = l.s - van.s;
        const want = 6 + van.v * AUTO.FOLLOW_GAP;
        target = Math.min(target, Math.max(0, l.v + (gap - want) * 0.35));
      }
      const err = target - van.v;
      const grade = this.road.gradeAt(van.s);
      this.throttle = clamp(err * 0.4 + grade * 4 + 0.1, 0, 1);
      if (err < -0.8 && input.throttle < 0.05) { this.throttle = 0; autoBrake = Math.min(AUTO.BRAKE, (-err - 0.8) * 1.2) * van.mass; }
    } else this.throttle = pedal.force > 50 ? 0 : input.throttle; // 手动：踩着刹车时不给油

    const prevS = van.s;
    van.step(h, this.throttle, pedal.force, this.road.gradeAt(van.s - VAN.LENGTH * 0.5), this.mu, autoBrake);
    this.time += h;
    if (van.s > prevS) this.score += (van.s - prevS) * (1 + Math.max(0, van.v - 12) / 8);
    this.maxSpeed = Math.max(this.maxSpeed, van.v);
    this.bgX -= this.road.curveAt(van.s) * van.v * h * 18;

    // 前车
    this.spawnLeads();
    if (this.lead) {
      this.lead.update(h, this.cruise);
      if (this.lead.gone) { this.addScore(Math.round(300 + van.v * 10), 'PHEW!', C.GREEN, fx, '前车醒了'); this.lead = null; }
      else if (this.lead.solid && this.lead.s - van.s <= 0) { this.crash('rear', fx, this.lead.kind); return; }
    }
    if (this.checkStops(h, fx)) return;
    if (this.checkCrossers(h, fx)) return;

    // 刹车动作评价
    const a = this.app;
    if (!a.active && pedal.force > 80) { a.active = true; a.peak = 0; a.v0 = van.v; }
    if (a.active) {
      a.peak = Math.max(a.peak, pedal.force);
      if (pedal.force < 40) {
        a.active = false;
        const dv = a.v0 - van.v;
        if (a.peak >= pedal.threshold - 70) this.addScore(800, 'CLOSE CALL!!', C.RED, fx, `${Math.round(a.peak)}N`);
        else if (a.peak < 1200 && dv > 2.5) {
          const pts = 100 * this.combo;
          this.combo = Math.min(8, this.combo + 1);
          this.addScore(pts, 'SMOOTH!', C.CYAN, fx, `x${this.combo}`, 54);
        } else if (a.peak >= 1200) this.combo = 1;
      }
    }

    // 咖啡
    this.spillCd -= h;
    if (this.coffee > 0 && this.spillCd <= 0 && (van.a < -6.6 || Math.abs(van.jerk) > 45)) {
      this.spillCd = 0.9;
      this.coffee = Math.max(0, this.coffee - (van.a < -6.6 ? 14 : 8));
      this.combo = 1;
      this.pop('SPLASH!', C.BROWN, undefined, 50);
      fx.audio.splash();
      for (let i = 0; i < 14; i++) this.drops.push({ x: 300 + this.rand() * 30, y: 470, vx: (this.rand() - 0.3) * 260, vy: -150 - this.rand() * 250, life: 1 });
      if (this.stains.length < 14) this.stains.push({ x: 160 + this.rand() * 360, y: 400 + this.rand() * 80, r: 10 + this.rand() * 26, seed: this.rand() * 1000 });
    }
  }

  /** 前方最近的危险：自动驾驶遇到就退出 */
  private findDanger(): Danger | null {
    const van = this.van;
    let best: Danger | null = null;
    const take = (d: Danger) => { if (!best || d.d < best.d) best = d; };
    for (const c of this.crossers) {
      if (c.state === 'idle' || c.state === 'clear') continue;
      const d = c.s - van.s;
      if (d < -1) continue;
      if (c.state === 'exit' && Math.abs(c.x) > 1.6) continue;
      take({ kind: 'crosser', d });
    }
    const l = this.lead;
    if (l && l.solid && (l.asleep || l.mode === 'wake')) take({ kind: 'lead', d: l.s - van.s });
    const st = this.stops.find((s) => !s.done);
    if (st && !st.scored) {
      const d = st.s - van.s;
      if (d < (van.v * van.v) / (2 * 3.2) + 10) take({ kind: 'stop', d });
    }
    return best;
  }

  private frameFx(dt: number, fx: Fx) {
    const van = this.van, f = this.pedal.force, thr = this.pedal.threshold;
    const d = this.dice;
    d.vlon += (-30 * d.lon - 2.5 * d.vlon - van.a * 0.9) * dt; d.lon += d.vlon * dt;
    const lat = this.road.curveAt(van.s) * van.v * van.v * 0.6;
    d.vlat += (-30 * d.lat - 2.5 * d.vlat + lat) * dt; d.lat += d.vlat * dt;
    d.lon = clamp(d.lon, -1, 1); d.lat = clamp(d.lat, -1, 1);

    this.creakCd -= dt;
    if (f > 1200 && this.creakCd <= 0) {
      fx.audio.creak();
      this.creakCd = lerp(0.7, 0.18, clamp((f - 1200) / (thr - 1200), 0, 1));
    }
    if (van.locked && Math.abs(van.v) > 1) {
      this.shake = Math.max(this.shake, 0.35);
      this.skidCd -= dt;
      if (this.skidCd <= 0) { this.skidCd = 1.4; this.pop('SKREEEE!', C.WHITE, undefined, 46); }
    } else this.skidCd = 0;
  }

  private updateDrops(dt: number) {
    for (const p of this.drops) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.life -= dt * 1.2; }
    this.drops = this.drops.filter((p) => p.life > 0);
  }

  private spawnLeads() {
    while (this.leadQ.length && !this.lead && this.van.s >= this.leadQ[0].at) {
      const sp = this.leadQ.shift()!;
      this.lead = new LeadCar(sp, this.van.s + sp.gap, this.van.v * sp.speed);
    }
  }

  private addScore(pts: number, text: string, color: string, fx: Fx, sub?: string, size = 70) {
    this.score += pts;
    this.pop(text, color, sub ? `+${pts}  ${sub}` : `+${pts}`, size);
    fx.audio.coin();
  }

  private checkStops(h: number, fx: Fx): boolean {
    const van = this.van;
    const st = this.stops.find((s) => !s.done);
    if (!st) return false;
    const d = st.s - van.s;
    const stopped = Math.abs(van.v) < 0.12;
    if (!st.scored && stopped && d > (st.final ? -10 : -3) && d < 8) {
      st.stoppedT += h;
      if (st.stoppedT > 0.5) this.scoreStop(st, d, fx);
    } else if (!stopped) st.stoppedT = 0;
    if (st.final) {
      if (d < -10.6) { this.crash('wall', fx, 'wall'); return true; }
    } else if (d < -1 && !st.scored) {
      this.score -= 300; this.combo = 1; this.pop('越线!', C.RED, '-300', 60); fx.audio.buzz();
      st.done = true;
    }
    return false;
  }

  private scoreStop(st: StopRT, d: number, fx: Fx) {
    st.scored = true;
    if (!st.final) st.done = true;
    const e = Math.abs(d);
    let txt = 'OK', pts = 100, col = C.WHITE;
    if (e <= 0.5) { txt = 'PERFECT STOP!'; pts = 1000; col = C.YELLOW; }
    else if (e <= 1.5) { txt = 'GREAT STOP!'; pts = 600; col = C.CYAN; }
    else if (e <= 3) { txt = 'GOOD STOP'; pts = 300; col = C.GREEN; }
    if (d < -0.5) { pts = Math.round(pts * 0.5); txt = '压线了'; col = C.ORANGE; }
    this.addScore(pts, txt, col, fx, `${e.toFixed(1)}m`);
    fx.audio.ding();
    if (st.final) this.finish();
  }

  private checkCrossers(h: number, fx: Fx): boolean {
    const van = this.van;
    for (const c of this.crossers) {
      if (c.state === 'clear') continue;
      const d = c.s - van.s;
      const cfg = CROSS[c.kind];
      if (c.state === 'idle') {
        if (d > 0 && d < 170 && d <= Math.max(14, van.v * c.ttc)) {
          c.state = 'enter'; c.t = 0;
          c.side = this.rand() < 0.5 ? -1 : 1;
          c.x = c.side * (HW + 2);
          if (c.kind === 'dog') { this.pop('WOOF!', C.YELLOW, undefined, 60); fx.audio.woof(); }
          else { this.pop('HEY!', C.ORANGE, undefined, 60); fx.audio.whistle(); }
        }
        continue;
      }
      c.t += h;
      const from = c.side * (HW + 2), mid = c.side * cfg.bx, to = -c.side * (HW + 2.5);
      if (c.state === 'enter') {
        c.x = lerp(from, mid, clamp(c.t / cfg.tin, 0, 1));
        if (c.t >= cfg.tin) { c.state = 'block'; c.t = 0; }
      } else if (c.state === 'block') {
        c.x = mid + (c.kind === 'worker' ? Math.sin(c.t * 2.4) * 0.25 : 0);
        if (c.t >= c.block) { c.state = 'exit'; c.t = 0; }
      } else if (c.state === 'exit') {
        c.x = lerp(mid, to, clamp(c.t / cfg.tout, 0, 1));
        if (c.t >= cfg.tout) {
          c.state = 'clear';
          if (d > -2) { this.saves++; this.addScore(Math.round(400 + van.v * 15), 'NICE SAVE!', C.GREEN, fx); }
        }
      }
      if (d < 0.3 && d > -VAN.LENGTH && Math.abs(c.x) < 1.5) {
        this.crash(c.kind, fx, c.kind === 'worker' ? 'bin' : 'pole');
        return true;
      }
    }
    return false;
  }

  crash(reason: CrashReason, fx: Fx, target?: CrashTarget) {
    if (this.status !== 'run') return;
    this.status = 'crash';
    this.crashReason = reason;
    this.crashTarget = target ?? this.guessTarget();
    if (reason === 'pedal') fx.audio.crack(); else fx.audio.crash();
  }

  private guessTarget(): CrashTarget {
    if (this.lead && this.lead.solid && this.lead.s - this.van.s < 70) return this.lead.kind;
    const c = this.crossers.find((x) => x.state !== 'idle' && x.state !== 'clear');
    if (c) return c.kind === 'worker' ? 'bin' : 'pole';
    const f = this.finalStop;
    if (f && f.s - this.van.s < 90) return 'wall';
    return 'pole';
  }

  private finish() {
    this.status = 'done';
    this.doneT = 0;
    const tb = Math.max(0, Math.round((this.def.par - this.time) * 20));
    const cb = Math.round(this.coffee * 5);
    const pb = Math.round((1 - this.pedal.fatigue) * 1000);
    this.bonuses = [['时间奖励', tb], ['咖啡剩余', cb], ['踏板寿命', pb]];
    this.score += tb + cb + pb;
  }

  rank(): string {
    const d = this.def;
    const stops = d.events.filter((e) => e.type === 'stop').length;
    const cr = d.events.filter((e) => e.type === 'crosser').length;
    const len = this.finalStop?.s ?? 1000;
    const target = len + stops * 850 + cr * 550 + 1000 + 450 + d.par * 4 + 600;
    const r = this.score / target;
    return r >= 0.85 ? 'S' : r >= 0.65 ? 'A' : r >= 0.45 ? 'B' : 'C';
  }

  objective(): string {
    const st = this.stops.find((s) => !s.done);
    if (st) {
      const d = st.s - this.van.s;
      if (d < 150) return `${st.final ? '终点' : '停止线'} ${Math.max(0, d).toFixed(1)}m`;
    }
    return this.def.endless ? `${(this.van.s / 1000).toFixed(2)} km` : '';
  }
}
