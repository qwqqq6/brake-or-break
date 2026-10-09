// 平衡性自测：机器人司机只控制刹车（自动驾驶负责油门），检查不断踏板、不崴车轮能否活下来。
// 运行：npm run simtest
import { TEST_DRIVE, makeEndless, type LevelDef } from '../src/levels';
import { Session } from '../src/sim/session';
import { Pedal } from '../src/sim/pedal';
import { CURVE, G, VAN } from '../src/config';

const noop = () => {};
const audio = new Proxy({}, { get: () => noop }) as never;

class FakeInput {
  brake = 0; throttle = 0;
  setRumble = noop; pulse = noop;
}

const REACTION = 0.35; // 机器人反应时间 (s)

function bot(s: Session, inp: FakeInput, seen: { t: number }, gas: number) {
  const van = s.van, v = Math.max(0, van.v), dz = s.danger;
  inp.throttle = dz ? 0 : gas;
  if (!dz) { seen.t = 0; inp.brake = 0; return; }
  seen.t += 1 / 60;
  if (seen.t < REACTION) { inp.brake = 0; return; }
  let d = dz.d;
  if (dz.kind === 'crosser') d -= 3;
  else if (dz.kind === 'lead') d = d - 4 + (s.lead ? (s.lead.v * s.lead.v) / (2 * 8) : 0);
  else d -= 0.2;
  const needA = v < 0.2 ? 0 : (v * v) / (2 * Math.max(0.5, d));
  let N = v < 0.2 ? 350 : (van.mass * (needA - G * s.road.gradeAt(van.s))) / (VAN.BRAKE_K * van.fade) * 1.1;
  const cap = s.inCurve ? CURVE.LIMIT - 60 : s.pedal.threshold - 80;
  N = Math.max(0, Math.min(N, cap));
  inp.brake = Pedal.travelOf(N);
}

function run(def: LevelDef, gas = 0, maxT = 900, maxS = 8000) {
  const s = new Session(def);
  const inp = new FakeInput();
  const dt = 1 / 60;
  const seen = { t: 0 };
  let prev = 0;
  const log: string[] = [];
  for (let t = 0; t < maxT; t += dt) {
    bot(s, inp, seen, gas);
    if (process.env.SIMDEBUG) { log.push(`t=${t.toFixed(2)} s=${s.van.s.toFixed(1)} v=${(s.van.v*3.6).toFixed(0)} F=${s.pedal.force.toFixed(0)} curve=${s.inCurve} k=${s.road.curveAt(s.van.s).toFixed(3)} dz=${s.danger?.kind ?? '-'}:${s.danger?.d.toFixed(1) ?? ''} auto=${s.auto} lock=${s.van.locked}`); if (log.length > 40) log.shift(); }
    inp.brake = Math.min(inp.brake, prev + 1.5 * dt); // 不猛踩（踩踏速度低于冲击阈值）
    prev = inp.brake;
    s.update(dt, inp as never, { audio, input: inp as never });
    if (s.status === 'crash' && process.env.SIMDEBUG) console.log(log.join('\n'));
    if (s.status === 'crash' || (s.status === 'done' && s.doneT > 0.5)) break;
    if (def.endless && s.van.s > maxS) break;
  }
  return s;
}

let fail = 0;
const runs: [string, LevelDef, number][] = [
  ['01 4S店试驾', TEST_DRIVE, 0],
  ...[1234, 42, 7, 2024, 99].map((k) => [`∞  无尽 #${k}`, makeEndless(k), 0] as [string, LevelDef, number]),
  ['∞  油门全开', makeEndless(1234), 1],
];
for (const [name, def, gas] of runs) {
  const s = run(def, gas);
  // 无尽模式越往后越难：前 3km 必须是公平可活的
  const ok = gas ? s.maxSpeed > def.autoSpeed + 6 : def.endless ? s.status !== 'crash' || s.van.s > 3000 : s.status === 'done';
  if (!ok) fail++;
  console.log(
    `${name.padEnd(12)} ${ok ? 'PASS' : 'FAIL'}  ${s.status}${s.status === 'crash' ? `(${s.crashReason})` : ''}` +
    `  s=${s.van.s.toFixed(0)}m  t=${s.time.toFixed(0)}s  vmax=${(s.maxSpeed * 3.6).toFixed(0)}km/h  peak=${s.peak.toFixed(0)}N` +
    `  fatigue=${(s.pedal.fatigue * 100).toFixed(0)}%  saves=${s.saves}  score=${Math.floor(s.score)}${s.status === 'done' ? ` rank=${s.rank()}` : ''}`,
  );
}
process.exit(fail ? 1 : 0);
