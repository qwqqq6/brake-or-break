import { ROAD } from '../config';
import type { Section, EventDef, Theme } from '../levels';
import { clamp, lerp, rng, smooth } from '../util';

export interface SpriteDef {
  kind: string;
  x: number;          // 横向偏移（米），正 = 右侧
  w?: number; h?: number;
  color?: string; seed?: number; text?: string; limit?: number; dir?: number;
}
export interface Decal { s: number; kind: 'stop' | 'finish' }
export interface Seg { i: number; z: number; y1: number; y2: number; curve: number; sprites: SpriteDef[]; decals: Decal[] }

const SEG = ROAD.SEG;
const HW = ROAD.HALF_W;

/** 伪 3D 分段道路：每段 5 米，带坡度（高度）与曲率 */
export class Road {
  segs: Seg[] = [];
  length: number;

  constructor(sections: Section[], events: EventDef[], theme: Theme, seed: number) {
    const total = sections.reduce((a, s) => a + s.len, 0) + 1500;
    const n = Math.ceil(total / SEG);
    const grade = new Float32Array(n), curve = new Float32Array(n);
    let prevG = 0, i = 0;
    for (const sec of sections) {
      const g = (sec.grade ?? 0) / 100, c = sec.curve ?? 0;
      const cnt = Math.max(1, Math.round(sec.len / SEG));
      const ease = Math.max(1, Math.min(16, Math.floor(cnt / 2)));
      for (let k = 0; k < cnt && i < n; k++, i++) {
        grade[i] = lerp(prevG, g, smooth(Math.min(1, k / ease)));
        curve[i] = c * smooth(clamp(Math.min(k / ease, (cnt - k) / ease), 0, 1));
      }
      prevG = g;
    }
    for (let k = 0; i < n; i++, k++) grade[i] = lerp(prevG, 0, smooth(Math.min(1, k / 16)));

    let y = 0;
    for (let k = 0; k < n; k++) {
      const y1 = y;
      y += grade[k] * SEG;
      this.segs.push({ i: k, z: k * SEG, y1, y2: y, curve: curve[k], sprites: [], decals: [] });
    }
    this.length = n * SEG;
    this.decorate(theme, events, seed);
  }

  seg(i: number) { return this.segs[clamp(i, 0, this.segs.length - 1)]; }
  segAt(s: number) { return this.seg(Math.floor(s / SEG)); }
  heightAt(s: number) {
    const g = this.segAt(s);
    return lerp(g.y1, g.y2, clamp((s - g.z) / SEG, 0, 1));
  }
  gradeAt(s: number) { const g = this.segAt(s); return (g.y2 - g.y1) / SEG; }
  curveAt(s: number) { return this.segAt(s).curve; }

  private add(s: number, sp: SpriteDef) {
    if (s < 0 || s >= this.length) return;
    this.segAt(s).sprites.push(sp);
  }

  private decorate(theme: Theme, events: EventDef[], seed: number) {
    const r = rng(seed);
    const n = this.segs.length;
    const bColors = ['#f4a259', '#5b8e7d', '#bc4b51', '#8cb369', '#f4e285', '#6c8ead', '#e07a5f', '#81b29a', '#c9a3d4'];
    const boards = ['刹车片 特价!', '自动驾驶 放心睡', '1600N?!', 'BRAKE OR BREAK', '修车 找老王', '遥遥领先'];
    for (let k = 0; k < n; k++) {
      const seg = this.segs[k];
      if (theme === 'city') {
        if (k % 6 === 0) { seg.sprites.push({ kind: 'lamp', x: HW + 1.3 }); seg.sprites.push({ kind: 'lamp', x: -HW - 1.3 }); }
        if (k % 4 === 0) {
          for (const side of [-1, 1]) {
            const w = 9 + r() * 9, h = 9 + r() * 26;
            seg.sprites.push({ kind: 'building', x: side * (HW + 4 + w / 2 + r() * 2), w, h, color: bColors[Math.floor(r() * bColors.length)], seed: Math.floor(r() * 1e6) });
          }
        }
        if (k % 47 === 23) seg.sprites.push({ kind: 'billboard', x: (r() < 0.5 ? -1 : 1) * (HW + 3), text: boards[Math.floor(r() * boards.length)] });
        if (k % 9 === 4 && r() < 0.6) seg.sprites.push({ kind: 'tree', x: (r() < 0.5 ? -1 : 1) * (HW + 2.2), seed: k });
      } else if (theme === 'yard') {
        if (k % 3 === 0) { seg.sprites.push({ kind: 'cone', x: HW + 0.7 }); seg.sprites.push({ kind: 'cone', x: -HW - 0.7 }); }
        if (k % 2 === 0) { seg.sprites.push({ kind: 'fence', x: HW + 6 }); seg.sprites.push({ kind: 'fence', x: -HW - 6 }); }
        if (k % 20 === 10) seg.sprites.push({ kind: 'building', x: -(HW + 18), w: 20, h: 8, color: '#f4e285', seed: k });
        if (k % 33 === 5) seg.sprites.push({ kind: 'billboard', x: HW + 9, text: k % 66 === 5 ? '4S店 · 遥遥领先' : '一千万以内最好的车' });
        if (k % 5 === 2) seg.sprites.push({ kind: 'tree', x: (k % 10 < 5 ? 1 : -1) * (HW + 11), seed: k });
      }
      // 弯道外侧的导向牌
      if (Math.abs(seg.curve) > 0.012 && k % 4 === 0) { const d = Math.sign(seg.curve); seg.sprites.push({ kind: 'chevron', x: -d * (HW + 1.0), dir: d }); }
    }
    for (const e of events) {
      if (e.type === 'stop') {
        this.segAt(e.s).decals.push({ s: e.s, kind: e.final ? 'finish' : 'stop' });
        if (!e.final) this.add(e.s - 3, { kind: 'stopsign', x: HW + 1.2 });
        else this.add(e.s - 40, { kind: 'finishsign', x: HW + 1.4 });
      }
    }
  }
}
