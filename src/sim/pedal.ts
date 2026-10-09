import { PEDAL } from '../config';
import { clamp } from '../util';

/** 踏板：扳机行程 → 踏板力，含冲击峰值、疲劳与断裂 */
export class Pedal {
  travel = 0;    // 0..1 扳机行程
  base = 0;      // 由行程算出的力
  spike = 0;     // 猛踩冲击
  force = 0;     // 实际作用力 = base + spike
  fatigue = 0;   // 0..1
  broken = false;
  private prevBase = 0;
  private rate = 0;

  get threshold() { return PEDAL.BREAK - PEDAL.FATIGUE_DROP * this.fatigue; }

  static forceOf(travel: number) { return PEDAL.FMAX * Math.pow(clamp(travel, 0, 1), PEDAL.GAMMA); }
  /** 阈值对应的扳机行程（给自适应扳机用） */
  static travelOf(force: number) { return Math.pow(clamp(force / PEDAL.FMAX, 0, 1), 1 / PEDAL.GAMMA); }

  update(travel: number, dt: number, sandbox = false) {
    if (this.broken) { this.force = 0; return; }
    this.travel = travel;
    this.base = Pedal.forceOf(travel);
    const r = (this.base - this.prevBase) / Math.max(dt, 1e-4);
    this.prevBase = this.base;
    this.rate += (r - this.rate) * Math.min(1, dt * 30);
    if (this.rate > PEDAL.SPIKE_RATE && this.base > 300) {
      this.spike = Math.max(this.spike, Math.min(PEDAL.SPIKE_MAX, (this.rate - PEDAL.SPIKE_RATE) * PEDAL.SPIKE_GAIN));
    }
    this.spike *= Math.exp(-PEDAL.SPIKE_DECAY * dt);
    if (this.base < 50) this.spike = 0;
    this.force = this.base + this.spike;

    if (!sandbox && this.force > PEDAL.FATIGUE_START) {
      const k = Math.pow((this.force - PEDAL.FATIGUE_START) / 400, 1.5);
      this.fatigue = Math.min(1, this.fatigue + k * PEDAL.FATIGUE_RATE * dt);
    }
    if (this.force > this.threshold) this.broken = !sandbox;
  }

  reset() { this.fatigue = 0; this.broken = false; this.spike = 0; this.force = 0; this.base = 0; this.prevBase = 0; this.rate = 0; }
}
