import { G, VAN } from '../config';
import { clamp, lerp } from '../util';

/** 一维纵向动力学：驱动、制动（附着限制/抱死）、坡度、阻力、热衰退 */
export class Vehicle {
  s: number;      // 前保险杠位置 (m)
  v: number;      // m/s，可为负（溜车）
  a = 0;
  jerk = 0;
  mass: number;
  temp = 0;       // 0..1 刹车温度
  locked = false;
  fade = 1;
  private prevA = 0;

  constructor(mass: number, s: number, v: number) { this.mass = mass; this.s = s; this.v = v; }

  step(dt: number, throttle: number, pedalN: number, grade: number, mu: number) {
    const m = this.mass;
    const th = Math.atan(grade);
    const sin = Math.sin(th), cos = Math.cos(th);
    this.fade = 1 - clamp((this.temp - 0.55) / 0.45, 0, 1) * 0.4;
    const req = VAN.BRAKE_K * pedalN * this.fade;
    const fric = mu * m * G * cos;
    const moving = Math.abs(this.v) > 0.05;
    this.locked = moving && req > fric;
    const Fb = this.locked ? fric * 0.72 : Math.min(req, fric);

    const Fdrive = throttle * Math.min(VAN.DRIVE_MAX, VAN.POWER / Math.max(Math.abs(this.v), 3)) * Math.min(1, mu + 0.3);
    const Fg = m * G * sin;
    const Froll = VAN.ROLL * m * G * cos;
    const Fair = VAN.AIR * this.v * Math.abs(this.v);
    const Feng = throttle < 0.05 && this.v > 1 ? VAN.ENGINE_BRAKE : 0;

    let a: number;
    if (!moving) {
      const push = Fdrive - Fg;
      const hold = Fb + Froll;
      if (Math.abs(push) <= hold) { this.v = 0; a = 0; }
      else { a = (push - Math.sign(push) * hold) / m; this.v += a * dt; }
    } else {
      const dir = Math.sign(this.v);
      a = (Fdrive - Fg - (Froll + Fb + (dir > 0 ? Feng : 0)) * dir - Fair) / m;
      const nv = this.v + a * dt;
      this.v = Math.sign(nv) !== dir ? 0 : nv;
    }
    this.s += this.v * dt;

    this.jerk = lerp(this.jerk, (a - this.prevA) / dt, Math.min(1, dt * 10));
    this.prevA = a;
    this.a = lerp(this.a, a, Math.min(1, dt * 20));

    const heat = (Fb * Math.abs(this.v)) / VAN.HEAT_CAP;
    const cool = this.temp * VAN.COOL * (1 + Math.abs(this.v) / 20);
    this.temp = clamp(this.temp + (heat - cool) * dt, 0, 1);
  }
}
