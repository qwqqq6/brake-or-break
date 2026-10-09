import { C, VAN } from '../config';
import type { LevelDef, LeadSpawn } from '../levels';
import type { AudioEngine } from '../audio';
import type { Input } from '../input/input';
import { clamp, lerp, rng } from '../util';
import { Road } from './road';
import { Vehicle } from './vehicle';
import { Pedal } from './pedal';
import { LeadCar } from './lead';

export type CrashReason = 'pedal' | 'rear' | 'ducks' | 'crate' | 'redlight' | 'rollback' | 'cliff' | 'wall';
export type CrashTarget = 'car' | 'truck' | 'pole' | 'wall' | 'cliff' | 'crate' | 'cross' | 'behind';

export interface Popup { text: string; sub?: string; color: string; t: number; life: number; size: number; rot: number; y: number }
export interface LightRT { state: 'green' | 'yellow' | 'red'; t: number; triggered: boolean }
export interface StopRT { s: number; final: boolean; light: LightRT | null; cargo: number; scored: boolean; done: boolean; stoppedT: number }
export interface HazardRT { s: number; kind: 'ducks' | 'crate'; ttc: number; state: 'idle' | 'active' | 'clearing' | 'clear'; t: number; stoppedT: number; p: number }
export interface HairpinRT { s: number; limit: number; dir: number; done: boolean }
export interface Stain { x: number; y: number; r: number; seed: number }
export interface Drop { x: number; y: number; vx: number; vy: number; life: number }

export interface Fx { audio: AudioEngine; input: Input }

export class Session {
  def: LevelDef;
  road: Road;
  van: Vehicle;
  pedal = new Pedal();
  mu: number;
  lead: LeadCar | null = null;
  private leadQ: LeadSpawn[];
  stops: StopRT[] = [];
  hazards: HazardRT[] = [];
  hairpins: HairpinRT[] = [];

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

  coffee = 100;
  stains: Stain[] = [];
  drops: Drop[] = [];
  shake = 0;
  flash = 0;
  bgX = 0;
  dice = { lon: 0, vlon: 0, lat: 0, vlat: 0 };
  tailgater: { stopS: number; honk: number } | null = null;
  peak = 0;
  maxSpeed = 0;
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
    this.leadQ = [...def.leads].sort((a, b) => a.at - b.at);
    for (const e of def.events) {
      if (e.type === 'stop') this.stops.push({ s: e.s, final: !!e.final, light: e.light ? { state: 'green', t: 0, triggered: false } : null, cargo: e.cargo ?? 0, scored: false, done: false, stoppedT: 0 });
      else if (e.type === 'hazard') this.hazards.push({ s: e.s, kind: e.kind, ttc: e.ttc, state: 'idle', t: 0, stoppedT: 0, p: 0 });
      else this.hairpins.push({ s: e.s, limit: e.limit, dir: e.dir, done: false });
    }
    this.stops.sort((a, b) => a.s - b.s);
    this.spawnLeads();
  }

  get front() { return this.van.s; }
  get finalStop() { return this.stops.find((s) => s.final) || null; }

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
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n && this.status === 'run'; i++) this.step(h, input, fx);
    this.frameFx(dt, input, fx);
  }

  private step(h: number, input: Input, fx: Fx) {
    const pedal = this.pedal, van = this.van;
    pedal.update(input.brake, h);
    if (pedal.broken) { this.crash('pedal', fx); return; }
    this.peak = Math.max(this.peak, pedal.force);

    const prevS = van.s;
    const grade = this.road.gradeAt(van.s - VAN.LENGTH * 0.5);
    van.step(h, input.throttle, pedal.force, grade, this.mu);
    this.time += h;
    if (van.s > prevS) this.score += (van.s - prevS) * (this.def.endless ? 2 : 1);
    this.maxSpeed = Math.max(this.maxSpeed, van.v);
    this.bgX -= this.road.curveAt(van.s) * van.v * h * 18;

    // 前车
    this.spawnLeads();
    if (this.lead) {
      this.lead.update(h);
      if (this.lead.gone) this.lead = null;
      else if (this.lead.solid && this.lead.s - van.s <= 0) { this.crash('rear', fx, this.lead.kind); return; }
    }
    if (this.checkStops(h, fx)) return;
    if (this.checkHazards(h, fx)) return;
    if (this.checkHairpins(prevS, fx)) return;

    // 溜车
    if (this.tailgater && van.s < this.tailgater.stopS - 1.2) { this.crash('rollback', fx, 'behind'); return; }

    // 刹车动作评价
    const a = this.app;
    if (!a.active && pedal.force > 80) { a.active = true; a.peak = 0; a.v0 = van.v; }
    if (a.active) {
      a.peak = Math.max(a.peak, pedal.force);
      if (pedal.force < 40) {
        a.active = false;
        const dv = a.v0 - van.v;
        if (a.peak >= pedal.threshold - 70) { this.addScore(800, 'CLOSE CALL!!', C.RED, fx, `${Math.round(a.peak)}N`); }
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
      const amt = van.a < -6.6 ? 14 : 8;
      this.coffee = Math.max(0, this.coffee - amt);
      this.combo = 1;
      this.pop('SPLASH!', C.BROWN, undefined, 50);
      fx.audio.splash();
      for (let i = 0; i < 14; i++) this.drops.push({ x: 300 + this.rand() * 30, y: 470, vx: (this.rand() - 0.3) * 260, vy: -150 - this.rand() * 250, life: 1 });
      if (this.stains.length < 14) this.stains.push({ x: 160 + this.rand() * 360, y: 400 + this.rand() * 80, r: 10 + this.rand() * 26, seed: this.rand() * 1000 });
    }
  }

  private frameFx(dt: number, input: Input, fx: Fx) {
    const van = this.van, f = this.pedal.force, thr = this.pedal.threshold;
    // 骰子摆动
    const d = this.dice;
    d.vlon += (-30 * d.lon - 2.5 * d.vlon - van.a * 0.9) * dt; d.lon += d.vlon * dt;
    const lat = this.road.curveAt(van.s) * van.v * van.v * 0.6;
    d.vlat += (-30 * d.lat - 2.5 * d.vlat + lat) * dt; d.lat += d.vlat * dt;
    d.lon = clamp(d.lon, -1, 1); d.lat = clamp(d.lat, -1, 1);

    // 踏板吱嘎
    this.creakCd -= dt;
    if (f > 1200 && this.creakCd <= 0) {
      fx.audio.creak();
      fx.input.pulse(0.35, 0.1, 45);
      this.creakCd = lerp(0.7, 0.18, clamp((f - 1200) / (thr - 1200), 0, 1));
    }
    if (van.locked && Math.abs(van.v) > 1) {
      this.shake = Math.max(this.shake, 0.35);
      this.skidCd -= dt;
      if (this.skidCd <= 0) { this.skidCd = 1.4; this.pop('SKREEEE!', C.WHITE, undefined, 46); }
    } else this.skidCd = 0;

    // 震动：越接近断点越强
    const stress = clamp((f - 1100) / (thr - 1100), 0, 1);
    input.setRumble(stress * stress * 0.6 + (van.locked && Math.abs(van.v) > 1 ? 0.5 : 0), stress * 0.5);

    if (this.tailgater) {
      this.tailgater.honk -= dt;
      const st = this.stops.find((s) => !s.done);
      if (st?.light?.state === 'green' && van.v < 0.5 && this.tailgater.honk <= 0) { fx.audio.horn(); this.tailgater.honk = 2.2; this.pop('HONK!', C.YELLOW, undefined, 44); }
    }
  }

  private updateDrops(dt: number) {
    for (const p of this.drops) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.life -= dt * 1.2; }
    this.drops = this.drops.filter((p) => p.life > 0);
  }

  private spawnLeads() {
    while (this.leadQ.length && !this.lead && this.van.s >= this.leadQ[0].at) {
      const sp = this.leadQ.shift()!;
      this.lead = new LeadCar(sp, this.van.s + sp.gap);
      if (sp.at === 0) this.lead.x = 0;
    }
  }

  private addScore(pts: number, text: string, color: string, fx: Fx, sub?: string, size = 70) {
    this.score += pts;
    this.pop(text, color, sub ? `+${pts}  ${sub}` : `+${pts}`, size);
    fx.audio.coin();
  }

  private checkStops(h: number, fx: Fx): boolean {
    const van = this.van;
    for (const st of this.stops) {
      if (st.done) continue;
      const d = st.s - van.s;
      const L = st.light;
      if (L) {
        L.t += h;
        if (L.state === 'green' && !L.triggered && d < 75 && d > 5) { L.triggered = true; L.state = 'yellow'; L.t = 0; }
        else if (L.state === 'yellow' && L.t > 1.8) { L.state = 'red'; L.t = 0; }
        else if (L.state === 'red' && st.scored && L.t > 3.5) { L.state = 'green'; L.t = 0; fx.audio.beep(true); }
      }
      const stopped = Math.abs(van.v) < 0.12;
      const lo = st.final ? -10 : -3;
      if (!st.scored && stopped && d > lo && d < 8) {
        st.stoppedT += h;
        if (st.stoppedT > 0.5) this.scoreStop(st, d, fx);
      } else if (!stopped) st.stoppedT = 0;

      if (st.final) {
        if (d < -10.6) { this.crash('wall', fx, 'wall'); return true; }
      } else if (d < -1) {
        if (L && L.state !== 'green') { this.crash('redlight', fx, 'cross'); return true; }
        if (!st.scored && !L) { this.score -= 300; this.combo = 1; this.pop('越线!', C.RED, '-300', 60); fx.audio.buzz(); }
        if (L && !st.scored) this.addScore(200, '绿灯通过', C.GREEN, fx, undefined, 44);
        st.done = true;
        this.tailgater = null;
      }
      break; // 只处理最近一个
    }
    return false;
  }

  private scoreStop(st: StopRT, d: number, fx: Fx) {
    st.scored = true;
    const e = Math.abs(d);
    let txt = 'OK', pts = 100, col = C.WHITE;
    if (e <= 0.5) { txt = 'PERFECT STOP!'; pts = 1000; col = C.YELLOW; }
    else if (e <= 1.5) { txt = 'GREAT STOP!'; pts = 600; col = C.CYAN; }
    else if (e <= 3) { txt = 'GOOD STOP'; pts = 300; col = C.GREEN; }
    if (d < -0.5) { pts = Math.round(pts * 0.5); txt = '压线了'; col = C.ORANGE; }
    this.addScore(pts, txt, col, fx, `${d >= 0 ? '' : '越 '}${e.toFixed(1)}m`);
    fx.audio.ding();
    if (st.cargo) { this.van.mass += st.cargo; setTimeout(() => this.pop(`装货 +${st.cargo}kg`, C.ORANGE, `车重 ${Math.round(this.van.mass)}kg`, 46), 700); }
    if (st.light && this.def.tailgater && Math.abs(this.road.gradeAt(this.van.s)) > 0.03) this.tailgater = { stopS: this.van.s, honk: 6 };
    if (st.final) this.finish();
  }

  private checkHazards(h: number, fx: Fx): boolean {
    const van = this.van;
    for (const hz of this.hazards) {
      if (hz.state === 'clear') continue;
      const d = hz.s - van.s;
      if (hz.state === 'idle') {
        if (d > 0 && d < 140 && d <= Math.max(14, van.v * hz.ttc)) {
          hz.state = 'active'; hz.t = 0;
          this.pop(hz.kind === 'ducks' ? 'QUACK!' : 'THUD!', C.YELLOW, undefined, 60);
          hz.kind === 'ducks' ? fx.audio.quack() : fx.audio.thud();
          fx.input.pulse(0.4, 0.2, 150);
        }
        continue;
      }
      hz.t += h;
      if (hz.state === 'active') {
        if (hz.kind === 'ducks') {
          hz.p = Math.min(1, hz.t / 6.5);
          if (hz.p >= 1) hz.state = 'clearing';
        } else {
          hz.p = Math.min(1, hz.t / 0.45); // 下落
          if (Math.abs(van.v) < 0.12) hz.stoppedT += h; else hz.stoppedT = 0;
          if (hz.stoppedT > 1.2) { hz.state = 'clearing'; hz.t = 0; }
        }
        if (d < 0.3) { this.crash(hz.kind, fx, hz.kind === 'ducks' ? 'pole' : 'crate'); return true; }
      } else if (hz.state === 'clearing') {
        if (hz.kind === 'crate') hz.p = 1 + Math.min(1, hz.t / 1.0);
        if (hz.kind === 'ducks' || hz.t > 1.0) {
          hz.state = 'clear';
          this.addScore(500, 'NICE SAVE!', C.GREEN, fx, hz.kind === 'ducks' ? '鸭子安全' : undefined);
        }
      }
    }
    return false;
  }

  private checkHairpins(prevS: number, fx: Fx): boolean {
    const v = this.van.v;
    for (const hp of this.hairpins) {
      if (hp.done) continue;
      if (prevS < hp.s && this.van.s >= hp.s) {
        hp.done = true;
        if (v * 3.6 > hp.limit + 4) { this.crash('cliff', fx, 'cliff'); return true; }
        this.addScore(250, '过弯!', C.CYAN, fx, `${Math.round(v * 3.6)}km/h`, 48);
      }
    }
    return false;
  }

  crash(reason: CrashReason, fx: Fx, target?: CrashTarget) {
    if (this.status !== 'run') return;
    this.status = 'crash';
    this.crashReason = reason;
    this.crashTarget = target ?? this.guessTarget();
    fx.input.setRumble(0, 0);
    if (reason === 'pedal') fx.input.snap(); else fx.input.pulse(1, 1, 700);
    if (reason === 'pedal') fx.audio.crack(); else fx.audio.crash();
  }

  private guessTarget(): CrashTarget {
    if (this.lead && this.lead.s - this.van.s < 70) return this.lead.kind;
    const hz = this.hazards.find((h) => h.state === 'active');
    if (hz) return hz.kind === 'crate' ? 'crate' : 'pole';
    const f = this.finalStop;
    if (f && f.s - this.van.s < 90) return 'wall';
    if (this.def.theme === 'mountain') return 'cliff';
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

  /** S/A/B/C 评级 */
  rank(): string {
    const d = this.def;
    const stops = d.events.filter((e) => e.type === 'stop').length;
    const haz = d.events.filter((e) => e.type === 'hazard').length;
    const hp = d.events.filter((e) => e.type === 'hairpin').length;
    const len = this.finalStop?.s ?? 1000;
    const target = len + stops * 850 + haz * 500 + hp * 250 + 1000 + 450 + d.par * 4 + 600;
    const r = this.score / target;
    return r >= 0.85 ? 'S' : r >= 0.65 ? 'A' : r >= 0.45 ? 'B' : 'C';
  }

  /** HUD 目标提示 */
  objective(): { text: string; warn: boolean } {
    const van = this.van;
    if (this.tailgater) {
      const st = this.stops.find((s) => !s.done);
      if (st?.light?.state === 'green') return { text: '绿灯', warn: true };
      return { text: '后车!', warn: true };
    }
    const hz = this.hazards.find((h) => h.state === 'active');
    if (hz) return { text: hz.kind === 'ducks' ? '鸭子!' : '货箱!', warn: true };
    if (this.lead && this.lead.solid) {
      const gap = this.lead.s - van.s;
      const tg = van.v > 1 ? gap / van.v : 9;
      return { text: `前车 ${gap.toFixed(0)}m`, warn: tg < 1.2 };
    }
    const hp = this.hairpins.find((h) => !h.done && h.s - van.s < 220);
    if (hp) {
      const over = van.v * 3.6 > hp.limit + 4;
      return { text: `急弯 ${hp.limit}km/h · ${(hp.s - van.s).toFixed(0)}m`, warn: over };
    }
    const st = this.stops.find((s) => !s.done);
    if (st) {
      const d = st.s - van.s;
      if (d < 250) {
        const kind = st.final ? '终点' : st.light ? (st.light.state === 'green' && !st.light.triggered ? '路口' : '红绿灯') : '停止线';
        return { text: `${kind} ${d.toFixed(1)}m`, warn: false };
      }
    }
    return { text: this.def.endless ? `${(van.s / 1000).toFixed(2)}km` : '', warn: false };
  }
}
