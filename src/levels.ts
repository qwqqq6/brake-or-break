import { C } from './config';
import { rng } from './util';

export type Theme = 'yard' | 'city';
export type Sky = 'day' | 'dusk' | 'night';
export interface Section { len: number; grade?: number; curve?: number }

/** 前车：玩家到达 at 时并入前方 gap 米处；开 sleepAfter 米后司机睡着 → 急减速停住 → 醒来开走 */
export interface LeadSpawn {
  at: number; gap: number; speed: number;
  kind: 'car' | 'truck'; color: string;
  sleepAfter: number; sleepDecel: number; sleepHold: number;
}

export type CrosserKind = 'worker' | 'dog';
export type EventDef =
  | { type: 'stop'; s: number; final?: boolean }
  /** 横穿：玩家距离 s 的到达时间小于 ttc 时冲上马路，在车道里停留 block 秒后离开 */
  | { type: 'crosser'; s: number; kind: CrosserKind; ttc: number; block: number };

export interface LevelDef {
  id: number;
  code: string;
  name: string;
  subtitle: string;
  desc: string;
  quote?: string;
  theme: Theme;
  sky: Sky;
  mu: number;
  cargo: number;
  startSpeed: number;
  /** 自动驾驶巡航速度 (m/s)：起始 → 最高（无尽模式随里程提升） */
  autoSpeed: number;
  autoSpeedMax: number;
  par: number;
  sections: Section[];
  leads: LeadSpawn[];
  events: EventDef[];
  endless?: boolean;
  seed: number;
}

export const TEST_DRIVE: LevelDef = {
  id: 1, code: '01', name: '4S店试驾', subtitle: 'TEST DRIVE',
  desc: '销售拍着胸脯说："这是一千万以内最好的车！还带自动驾驶！"',
  quote: '这是一千万以内最好的车！',
  theme: 'yard', sky: 'day', mu: 1.0, cargo: 0, startSpeed: 8, autoSpeed: 13, autoSpeedMax: 13, par: 60, seed: 11,
  sections: [{ len: 700 }],
  leads: [],
  events: [
    { type: 'stop', s: 150 },
    { type: 'crosser', s: 330, kind: 'dog', ttc: 3.2, block: 2.5 },
    { type: 'stop', s: 470 },
    { type: 'stop', s: 640, final: true },
  ],
};

/** 无尽模式：随机路线 + 随机事件，越往后越快、越密 */
export function makeEndless(seed: number): LevelDef {
  const r = rng(seed);
  const total = 40000;
  const sections: Section[] = [{ len: 300 }];
  let acc = 300;
  while (acc < total) {
    const len = 180 + Math.floor(r() * 320);
    const curvy = r() < 0.45;
    const curve = curvy ? (r() < 0.5 ? -1 : 1) * (0.018 + r() * 0.025) : 0;
    const grade = r() < 0.5 ? 0 : Math.round((r() * 2 - 1) * 5);
    sections.push({ len, grade, curve });
    acc += len;
  }
  const events: EventDef[] = [];
  const leads: LeadSpawn[] = [];
  const colors = [C.RED, C.BLUE, C.GREEN, C.PINK, C.ORANGE, C.YELLOW];
  let s = 350;
  while (s < total - 600) {
    const diff = Math.min(1, s / 9000);
    const x = r();
    if (x < 0.34) {
      leads.push({
        at: s, gap: 55 - diff * 15, speed: 0.8, kind: r() < 0.3 ? 'truck' : 'car', color: colors[Math.floor(r() * colors.length)],
        sleepAfter: 120 + r() * 160, sleepDecel: 5 + diff * 3 + r() * 1.5, sleepHold: 1.8 + r(),
      });
      s += 650 + r() * 250;
    } else if (x < 0.67) {
      events.push({ type: 'crosser', s: s + 200, kind: 'worker', ttc: 3.1 - diff * 0.7 + r() * 0.3, block: 3.5 + r() * 1.5 });
      s += 380 + r() * 300;
    } else {
      events.push({ type: 'crosser', s: s + 200, kind: 'dog', ttc: 2.9 - diff * 0.6 + r() * 0.3, block: 2 + r() * 1.2 });
      s += 350 + r() * 300;
    }
  }
  return {
    id: 99, code: '∞', name: '无尽模式', subtitle: 'ENDLESS',
    desc: '自动驾驶全程护航。大概吧。',
    theme: 'city', sky: r() < 0.3 ? 'dusk' : 'day', mu: 1, cargo: 0, startSpeed: 14, autoSpeed: 17, autoSpeedMax: 30, par: 0,
    sections, leads, events, endless: true, seed,
  };
}
