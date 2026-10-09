import { C } from './config';
import { rng } from './util';

export type Theme = 'yard' | 'city' | 'park' | 'mountain';
export type Sky = 'day' | 'dusk' | 'night';
export interface Section { len: number; grade?: number; curve?: number }

export type LeadAction =
  | { at: number; type: 'cruise'; speed: number }
  | { at: number; type: 'brake'; decel: number; to: number; hold?: number };

/** 前车：玩家到达 at 时出现在前方 gap 米处；actions.at 为前车自身行驶距离 */
export interface LeadSpawn {
  at: number; gap: number; speed: number;
  kind: 'car' | 'truck'; color: string;
  actions: LeadAction[]; exitAfter: number;
}

export type EventDef =
  | { type: 'stop'; s: number; final?: boolean; light?: boolean; cargo?: number }
  | { type: 'hazard'; s: number; kind: 'ducks' | 'crate'; ttc: number }
  | { type: 'hairpin'; s: number; limit: number; dir: 1 | -1 };

export interface LevelDef {
  id: number;
  code: string;
  name: string;
  subtitle: string;
  desc: string;
  tips: string[];
  /** 关卡介绍页里的人物台词（可选） */
  quote?: string;
  theme: Theme;
  sky: Sky;
  rain: boolean;
  mu: number;
  cargo: number;
  startSpeed: number;
  par: number;
  sections: Section[];
  leads: LeadSpawn[];
  events: EventDef[];
  tailgater?: boolean;
  endless?: boolean;
  seed: number;
}

export const LEVELS: LevelDef[] = [
  {
    id: 1, code: '01', name: '4S店试驾', subtitle: 'TEST DRIVE',
    desc: '销售拍着胸脯说："这是一千万以内最好的车！"先在店门口试试刹车。',
    quote: '这是一千万以内最好的车！',
    tips: ['R2 加速，L2 刹车', '中间的大表盘就是踏板力，超过 1600N 踏板就断', '停在停止线前 0.5 米内 = PERFECT STOP'],
    theme: 'yard', sky: 'day', rain: false, mu: 1.0, cargo: 0, startSpeed: 0, par: 70, seed: 11,
    sections: [{ len: 520 }],
    leads: [],
    events: [{ type: 'stop', s: 90 }, { type: 'stop', s: 230 }, { type: 'stop', s: 380, final: true }],
  },
  {
    id: 2, code: '02', name: '早高峰', subtitle: 'RUSH HOUR',
    desc: '前面那辆红车的司机好像在打电话，时不时一脚急刹。',
    tips: ['和前车保持 1.5 秒以上的车距', '前车刹车灯亮起要马上反应', '急刹也别一脚跺死——猛踩会产生冲击峰值'],
    theme: 'city', sky: 'day', rain: false, mu: 1.0, cargo: 0, startSpeed: 12, par: 130, seed: 22,
    sections: [{ len: 400 }, { len: 300, grade: 3, curve: 0.02 }, { len: 300, grade: -3 }, { len: 700, curve: -0.015 }],
    leads: [{
      at: 0, gap: 32, speed: 12, kind: 'car', color: C.RED, exitAfter: 1150,
      actions: [
        { at: 80, type: 'cruise', speed: 15 },
        { at: 220, type: 'brake', decel: 4, to: 6 },
        { at: 260, type: 'cruise', speed: 14 },
        { at: 430, type: 'brake', decel: 7.5, to: 0, hold: 2.5 },
        { at: 440, type: 'cruise', speed: 13 },
        { at: 650, type: 'brake', decel: 3, to: 7 },
        { at: 690, type: 'cruise', speed: 16 },
        { at: 900, type: 'brake', decel: 8.5, to: 0, hold: 2 },
        { at: 905, type: 'cruise', speed: 12 },
      ],
    }],
    events: [{ type: 'stop', s: 1450, final: true }],
  },
  {
    id: 3, code: '03', name: '公园路段', subtitle: 'DUCK CROSSING',
    desc: '公园旁边的路。鸭妈妈带着小鸭子随时会冲出来。',
    tips: ['看到鸭子标志就提前减速', '鸭子过马路要等它们走完', '停得太急咖啡会洒'],
    theme: 'park', sky: 'day', rain: false, mu: 1.0, cargo: 0, startSpeed: 11, par: 110, seed: 33,
    sections: [{ len: 300, curve: 0.03 }, { len: 400, curve: -0.03 }, { len: 500 }],
    leads: [],
    events: [
      { type: 'hazard', s: 230, kind: 'ducks', ttc: 2.8 },
      { type: 'hazard', s: 540, kind: 'crate', ttc: 2.4 },
      { type: 'hazard', s: 820, kind: 'ducks', ttc: 2.0 },
      { type: 'stop', s: 1020, final: true },
    ],
  },
  {
    id: 4, code: '04', name: '坡道红绿灯', subtitle: 'HILL START',
    desc: '一路上坡，红绿灯还都在坡中间。后面的车贴得很近。',
    tips: ['坡上停车要一直踩住刹车', '绿灯后先给油再松刹车，别溜车', '溜车超过 1.2 米就会撞上后车'],
    theme: 'city', sky: 'day', rain: false, mu: 1.0, cargo: 0, startSpeed: 8, par: 120, seed: 44, tailgater: true,
    sections: [{ len: 120 }, { len: 250, grade: 8 }, { len: 220, grade: 10 }, { len: 260, grade: 12 }, { len: 400, grade: 0 }],
    leads: [],
    events: [{ type: 'stop', s: 300, light: true }, { type: 'stop', s: 580, light: true }, { type: 'stop', s: 930, final: true }],
  },
  {
    id: 5, code: '05', name: '盘山下坡', subtitle: 'MOUNTAIN PASS',
    desc: '两公里长下坡加急弯。一直踩刹车会过热，刹车越来越软。',
    tips: ['弯道前按限速减好速，超速会冲出护栏', '刹车温度高了效果会变差，注意右下角的温度条', '点刹比一直踩住更不容易过热'],
    theme: 'mountain', sky: 'dusk', rain: false, mu: 1.0, cargo: 0, startSpeed: 14, par: 230, seed: 55,
    sections: [{ len: 100 }, { len: 2300, grade: -10 }, { len: 200, grade: -4 }, { len: 300 }],
    leads: [{
      at: 1350, gap: 60, speed: 7, kind: 'truck', color: C.ORANGE, exitAfter: 320,
      actions: [{ at: 120, type: 'brake', decel: 3, to: 4 }, { at: 150, type: 'cruise', speed: 8 }],
    }],
    events: [
      { type: 'hairpin', s: 500, limit: 30, dir: 1 },
      { type: 'hairpin', s: 900, limit: 25, dir: -1 },
      { type: 'hairpin', s: 1250, limit: 30, dir: 1 },
      { type: 'hairpin', s: 1850, limit: 25, dir: -1 },
      { type: 'hairpin', s: 2200, limit: 30, dir: 1 },
      { type: 'stop', s: 2700, final: true },
    ],
  },
  {
    id: 6, code: '06', name: '暴雨夜', subtitle: 'MIDNIGHT RAIN',
    desc: '下着大雨，路面很滑。轮胎一抱死就停不下来。',
    tips: ['雨天约 800N 就会抱死打滑', '抱死时松一点刹车，轮胎重新抓地', '车距要比平时拉大一倍'],
    theme: 'city', sky: 'night', rain: true, mu: 0.45, cargo: 0, startSpeed: 11, par: 140, seed: 66,
    sections: [{ len: 500, curve: 0.02 }, { len: 400, grade: -3 }, { len: 600 }],
    leads: [{
      at: 0, gap: 40, speed: 11, kind: 'car', color: C.BLUE, exitAfter: 800,
      actions: [
        { at: 150, type: 'brake', decel: 3, to: 5 },
        { at: 190, type: 'cruise', speed: 12 },
        { at: 420, type: 'brake', decel: 4.5, to: 0, hold: 2 },
        { at: 430, type: 'cruise', speed: 11 },
        { at: 650, type: 'brake', decel: 3.5, to: 4 },
        { at: 690, type: 'cruise', speed: 13 },
      ],
    }],
    events: [{ type: 'hazard', s: 1050, kind: 'crate', ttc: 2.8 }, { type: 'stop', s: 1300, final: true }],
  },
  {
    id: 7, code: '07', name: '满载送货', subtitle: 'FULL LOAD',
    desc: '车上装了 900kg 货。车重了，同样的力刹车距离长很多。',
    tips: ['满载时 1600N 也只能减速 6m/s²', '提前很远就要开始刹', '下坡更要小心'],
    theme: 'city', sky: 'dusk', rain: false, mu: 1.0, cargo: 900, startSpeed: 10, par: 160, seed: 77,
    sections: [{ len: 200 }, { len: 400, grade: -5 }, { len: 300 }, { len: 450, grade: -6, curve: 0.02 }, { len: 500 }],
    leads: [{
      at: 650, gap: 45, speed: 11, kind: 'truck', color: C.GREEN, exitAfter: 450,
      actions: [{ at: 120, type: 'brake', decel: 5.5, to: 0, hold: 2 }, { at: 130, type: 'cruise', speed: 12 }, { at: 330, type: 'brake', decel: 4, to: 5 }, { at: 360, type: 'cruise', speed: 12 }],
    }],
    events: [{ type: 'stop', s: 470, light: true }, { type: 'hazard', s: 1340, kind: 'ducks', ttc: 3.0 }, { type: 'stop', s: 1600, final: true }],
  },
  {
    id: 8, code: '08', name: '终极考验', subtitle: 'FINAL EXAM',
    desc: '暴雨夜、盘山下坡、满载、前车急刹。这车能撑住吗？',
    tips: ['综合运用所有技巧', '踏板疲劳会降低断裂阈值，别长时间重踩', '祝你好运'],
    theme: 'mountain', sky: 'night', rain: true, mu: 0.5, cargo: 600, startSpeed: 11, par: 230, seed: 88,
    sections: [{ len: 100 }, { len: 2000, grade: -7 }, { len: 300 }],
    leads: [{
      at: 560, gap: 45, speed: 9, kind: 'car', color: C.PINK, exitAfter: 380,
      actions: [{ at: 120, type: 'brake', decel: 4, to: 0, hold: 2 }, { at: 125, type: 'cruise', speed: 9 }, { at: 280, type: 'brake', decel: 3, to: 4 }, { at: 300, type: 'cruise', speed: 10 }],
    }],
    events: [
      { type: 'hairpin', s: 420, limit: 30, dir: 1 },
      { type: 'hairpin', s: 1150, limit: 25, dir: -1 },
      { type: 'hazard', s: 1500, kind: 'ducks', ttc: 3.0 },
      { type: 'hazard', s: 1780, kind: 'crate', ttc: 2.8 },
      { type: 'stop', s: 2100, final: true },
    ],
  },
];

/** 无尽模式：随机生成长路线，越往后越难 */
export function makeEndless(seed: number): LevelDef {
  const r = rng(seed);
  const total = 30000;
  const sections: Section[] = [];
  let acc = 0;
  while (acc < total) {
    const len = 200 + Math.floor(r() * 400);
    const grade = r() < 0.4 ? 0 : Math.round((r() * 2 - 1) * 8);
    const curve = r() < 0.5 ? 0 : (r() * 2 - 1) * 0.035;
    sections.push({ len, grade, curve });
    acc += len;
  }
  const events: EventDef[] = [];
  const leads: LeadSpawn[] = [];
  const colors = [C.RED, C.BLUE, C.GREEN, C.PINK, C.ORANGE, C.YELLOW];
  let s = 160;
  while (s < total - 800) {
    const diff = Math.min(1, s / 8000);
    const x = r();
    if (x < 0.32) {
      const actions: LeadAction[] = [];
      const n = 2 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const at = 80 + i * 120 + r() * 40;
        const hard = r() < 0.3 + diff * 0.4;
        actions.push(hard ? { at, type: 'brake', decel: 5 + diff * 3.5, to: 0, hold: 1.5 + r() } : { at, type: 'brake', decel: 2.5 + r() * 2, to: 4 + r() * 4 });
        actions.push({ at: at + 15, type: 'cruise', speed: 11 + r() * 5 });
      }
      leads.push({ at: s, gap: 42 - diff * 10, speed: 12 + r() * 3, kind: r() < 0.3 ? 'truck' : 'car', color: colors[Math.floor(r() * colors.length)], actions, exitAfter: 120 * n + 160 });
      s += 120 * n + 360;
    } else if (x < 0.55) {
      events.push({ type: 'stop', s: s + 120, light: r() < 0.55, cargo: 150 });
      s += 300;
    } else if (x < 0.8) {
      events.push({ type: 'hazard', s: s + 150, kind: r() < 0.6 ? 'ducks' : 'crate', ttc: 2.9 - diff * 0.9 });
      s += 320;
    } else {
      events.push({ type: 'hairpin', s: s + 200, limit: r() < 0.5 ? 30 : 25, dir: r() < 0.5 ? 1 : -1 });
      s += 340;
    }
  }
  const rain = r() < 0.3;
  return {
    id: 99, code: '∞', name: '无尽模式', subtitle: 'ENDLESS',
    desc: '路没有尽头，事件越来越密。每次停车还会多装 150kg 货。',
    tips: ['活得越久分越高', '车会越来越重', '踏板疲劳不会恢复'],
    theme: 'city', sky: rain ? 'night' : 'day', rain, mu: rain ? 0.55 : 1, cargo: 0, startSpeed: 10, par: 0,
    sections, leads, events, endless: true, seed,
  };
}
