import type { LeadSpawn } from '../levels';

/**
 * 前车：并入 → 跟着车流开 → 司机睡着（急减速直到停住）→ 惊醒 → 加速并线离开。
 * speed 字段是相对玩家自动驾驶巡航速度的比例。
 */
export class LeadCar {
  s: number;          // 后保险杠位置
  v: number;
  x = 3.6;            // 横向偏移，>0 表示在右侧车道（并入/离开中）
  kind: 'car' | 'truck';
  color: string;
  braking = false;
  mode: 'merge' | 'cruise' | 'sleep' | 'hold' | 'wake' | 'exit' = 'merge';
  gone = false;
  t = 0;              // 当前模式持续时间
  private startS: number;
  private holdT = 0;

  constructor(private sp: LeadSpawn, s: number, v: number) {
    this.s = s; this.startS = s; this.v = v;
    this.kind = sp.kind; this.color = sp.color;
  }

  /** 在本车道上，可以被追尾 */
  get solid() { return this.x < 2.2; }
  get asleep() { return this.mode === 'sleep' || this.mode === 'hold'; }

  private set(m: LeadCar['mode']) { this.mode = m; this.t = 0; }

  update(dt: number, cruise: number) {
    this.t += dt;
    const target = cruise * this.sp.speed;
    switch (this.mode) {
      case 'merge':
        this.braking = false;
        this.x = Math.max(0, this.x - 2.2 * dt);
        this.v += Math.sign(target - this.v) * Math.min(Math.abs(target - this.v), 2 * dt);
        if (this.x === 0) this.set('cruise');
        break;
      case 'cruise':
        this.braking = false;
        this.v += Math.sign(target - this.v) * Math.min(Math.abs(target - this.v), 2 * dt);
        if (this.s - this.startS > this.sp.sleepAfter) this.set('sleep');
        break;
      case 'sleep':
        this.braking = true;
        this.v = Math.max(0, this.v - this.sp.sleepDecel * dt);
        if (this.v === 0) { this.set('hold'); this.holdT = this.sp.sleepHold; }
        break;
      case 'hold':
        this.braking = true;
        this.holdT -= dt;
        if (this.holdT <= 0) this.set('wake');
        break;
      case 'wake':
        this.braking = false;
        this.v += 3 * dt;
        if (this.t > 0.8) this.set('exit');
        break;
      case 'exit':
        this.braking = false;
        this.v = Math.min(this.v + 3 * dt, cruise * 1.3);
        this.x += 2.2 * dt;
        if (this.x > 7) this.gone = true;
        break;
    }
    this.s += this.v * dt;
  }
}
