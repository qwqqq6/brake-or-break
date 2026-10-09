// 平衡性自测：用一个简单的"机器人司机"跑完每一关，检查是否能在不断踏板的情况下通关。
// 运行：npm run simtest
import { LEVELS, makeEndless, type LevelDef } from '../src/levels';
import { Session } from '../src/sim/session';
import { Pedal } from '../src/sim/pedal';
import { G, VAN } from '../src/config';

const noop = () => {};
const audio = new Proxy({}, { get: () => noop }) as never;

class FakeInput {
  brake = 0; throttle = 0;
  setRumble = noop; pulse = noop;
}

function bot(s: Session, inp: FakeInput) {
  const van = s.van;
  const v = Math.max(0, van.v);
  const m = van.mass;
  const grade = s.road.gradeAt(van.s);
  let cruise = 13;
  let needA = 0; // 需要的减速度
  const want = (d: number, vt: number) => {
    if (d <= 0.05) return v > vt ? 9 : 0;
    return Math.max(0, (v * v - vt * vt) / (2 * d));
  };
  // 停止线 / 红绿灯
  const st = s.stops.find((x) => !x.done);
  if (st) {
    const d = st.s - van.s - 0.2;
    const mustStop = !st.scored && (!st.light || st.light.state !== 'green' || st.light.triggered === false && d < 70);
    if (st.light && st.light.state === 'green' && st.scored) { /* 绿灯走 */ }
    else if (mustStop && d < 160) needA = Math.max(needA, want(d, 0));
    if (st.scored && st.light && st.light.state !== 'green') needA = Math.max(needA, 9);
  }
  // 危险
  for (const hz of s.hazards) {
    if (hz.state === 'active' || hz.state === 'clearing') {
      const d = hz.s - van.s - 3;
      needA = Math.max(needA, want(d, 0));
    }
  }
  // 弯道
  const hp = s.hairpins.find((h) => !h.done && h.s - van.s < 250);
  if (hp) needA = Math.max(needA, want(hp.s - van.s - 10, hp.limit / 3.6 - 1.5));
  // 前车：保持 1.8s 车距
  if (s.lead && s.lead.solid) {
    const gap = s.lead.s - van.s;
    const rel = v - s.lead.v;
    const safe = 6 + v * 1.8;
    if (gap < safe || rel > 0) {
      const d = gap - 4;
      const aStop = d > 0 ? (rel > 0 ? (rel * rel) / (2 * d) : 0) : 9;
      needA = Math.max(needA, aStop + (gap < safe ? (safe - gap) * 0.08 : 0));
      cruise = Math.min(cruise, s.lead.v);
    }
  }
  if (s.def.theme === 'mountain') cruise = Math.min(cruise, 11);
  // 转成踏板力（考虑坡度和热衰退）
  if (needA > 0.15) {
    // 下坡 grade<0，需要额外抵消重力分量
    let N = Math.max(0, (m * (needA - G * grade)) / (VAN.BRAKE_K * van.fade));
    N = Math.min(N, s.pedal.threshold - 80);
    if (van.locked) N *= 0.7;
    inp.brake = Pedal.travelOf(N);
    inp.throttle = 0;
  } else {
    inp.brake = v < 0.3 && st?.scored && st.light && st.light.state !== 'green' ? Pedal.travelOf(800) : 0;
    inp.throttle = v < cruise ? 0.6 : 0;
    // 坡上起步：先给油
    if (s.tailgater) inp.throttle = 1;
  }
}

function run(def: LevelDef, maxT = 600) {
  const s = new Session(def);
  const inp = new FakeInput();
  const dt = 1 / 60;
  let prevBrake = 0;
  for (let t = 0; t < maxT; t += dt) {
    bot(s, inp);
    // 限制踩踏速度
    inp.brake = Math.min(inp.brake, prevBrake + 2.5 * dt);
    prevBrake = inp.brake;
    s.update(dt, inp as never, { audio, input: inp as never });
    if (s.status === 'crash' || (s.status === 'done' && s.doneT > 0.5)) break;
    if (def.endless && s.van.s > 4000) break;
  }
  return s;
}

let fail = 0;
for (const def of [...LEVELS, makeEndless(1234)]) {
  const s = run(def);
  const ok = s.status === 'done' || (def.endless && s.status !== 'crash');
  if (!ok) fail++;
  console.log(
    `${def.code.padEnd(3)} ${def.name.padEnd(6, '　')} ${ok ? 'PASS' : 'FAIL'}  status=${s.status}${s.status === 'crash' ? `(${s.crashReason})` : ''}` +
    `  s=${s.van.s.toFixed(0)}m  t=${s.time.toFixed(0)}s  peak=${s.peak.toFixed(0)}N  fatigue=${(s.pedal.fatigue * 100).toFixed(0)}%  temp=${(s.van.temp * 100).toFixed(0)}%  coffee=${s.coffee.toFixed(0)}  score=${Math.floor(s.score)}${s.status === 'done' ? ` rank=${s.rank()}` : ''}`,
  );
}
process.exit(fail ? 1 : 0);
