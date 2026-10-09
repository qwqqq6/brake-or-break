import type { LeadAction, LeadSpawn } from '../levels';

/** 前车 AI：按脚本巡航 / 刹车 / 停住 / 并线离开 */
export class LeadCar {
  s: number;          // 后保险杠位置
  v: number;
  target: number;
  x = 3.6;            // 横向偏移，>0 表示在右侧车道（并入/离开）
  kind: 'car' | 'truck';
  color: string;
  braking = false;
  mode: 'cruise' | 'brake' | 'hold' | 'exit' = 'cruise';
  gone = false;
  private actions: LeadAction[];
  private ai = 0;
  private startS: number;
  private exitAfter: number;
  private decel = 0;
  private to = 0;
  private hold = 0;
  private holdT = 0;
  private merging = true;

  constructor(sp: LeadSpawn, s: number) {
    this.s = s; this.startS = s;
    this.v = sp.speed; this.target = sp.speed;
    this.kind = sp.kind; this.color = sp.color;
    this.actions = sp.actions; this.exitAfter = sp.exitAfter;
  }

  get solid() { return this.x < 2.2; }

  update(dt: number) {
    const tr = this.s - this.startS;
    while (this.ai < this.actions.length && tr >= this.actions[this.ai].at && this.mode !== 'exit') {
      const a = this.actions[this.ai++];
      if (a.type === 'cruise') this.target = a.speed;
      else { this.mode = 'brake'; this.decel = a.decel; this.to = a.to; this.hold = a.hold ?? 1.5; }
    }
    if (this.mode !== 'exit' && tr >= this.exitAfter && this.mode === 'cruise') this.mode = 'exit';

    switch (this.mode) {
      case 'cruise':
        this.braking = false;
        if (this.v < this.target) this.v = Math.min(this.target, this.v + 2.2 * dt);
        else this.v = Math.max(this.target, this.v - 1.5 * dt);
        break;
      case 'brake':
        this.braking = true;
        this.v -= this.decel * dt;
        if (this.v <= this.to) {
          this.v = Math.max(0, this.to);
          if (this.to <= 0.1) { this.mode = 'hold'; this.holdT = this.hold; } else this.mode = 'cruise';
        }
        break;
      case 'hold':
        this.braking = true;
        this.v = 0;
        this.holdT -= dt;
        if (this.holdT <= 0) this.mode = 'cruise';
        break;
      case 'exit':
        this.braking = false;
        this.v = Math.min(this.v + 2 * dt, 18);
        this.x += 1.8 * dt;
        if (this.x > 7) this.gone = true;
        break;
    }
    if (this.merging) { this.x = Math.max(0, this.x - 1.8 * dt); if (this.x === 0) this.merging = false; }
    this.s += this.v * dt;
  }
}
