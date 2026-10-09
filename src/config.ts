// 全局常量：画面、物理、踏板、配色
export const W = 1280;
export const H = 720;
export const G = 9.81;

export const PEDAL = {
  FMAX: 2000,          // 扳机按到底对应的踏板力 (N)
  GAMMA: 1.6,          // 非线性曲线：前段细腻，后段涨得快
  BREAK: 1600,         // 断裂阈值 (N)
  FATIGUE_START: 1200, // 高于此值开始累积疲劳
  FATIGUE_RATE: 0.06,
  FATIGUE_DROP: 250,   // 疲劳满时阈值下降量 → 1350N
  SPIKE_RATE: 5000,    // 超过此踩踏速度 (N/s) 产生冲击峰值
  SPIKE_GAIN: 0.06,
  SPIKE_MAX: 350,
  SPIKE_DECAY: 5,
};

/** DualSense 自适应扳机（需 WebHID 启用）。强度 1..8 */
export const TRIGGER = {
  DAMP_START: 3,     // 扳机一开始的阻尼
  DAMP_END: 7,       // 接近断点前的阻尼
  WALL: 8,           // 断点处的"硬墙"；越过断点后扳机瞬间失去支撑
};

/** 自动驾驶 */
export const AUTO = {
  ACCEL: 2.6,          // 自动加速度上限 (m/s²)
  BRAKE: 3.0,          // 自动驾驶自己能用的减速度（跟车/过弯）
  FOLLOW_GAP: 1.6,     // 跟车时距 (s)
  CURVE_SLOW: 0.82,    // 弯道里降到目标速度的比例
  RESUME_DELAY: 0.8,   // 危险解除且松开刹车多久后重新接管 (s)
  TAKEOVER_SLOWMO: 0.9,// 退出自动驾驶分镜的慢动作时长（真实秒）
  SLOWMO_SCALE: 0.3,
};

/** 弯道：刹车空间被压缩，超过这个力车轮会崴 */
export const CURVE = {
  MIN: 0.012,          // 曲率超过此值视为在弯道里
  LIMIT: 1050,         // 弯道踏板力上限 (N)
  GRACE: 0.15,         // 超限持续多久才崴 (s)；猛踩突破 1600 时仍是踏板断
};

export const VAN = {
  MASS: 1800,
  BRAKE_K: 10.1,       // 踏板力 → 轮端制动力 放大倍数
  DRIVE_MAX: 6500,
  POWER: 65000,
  ROLL: 0.015,
  AIR: 0.55,
  ENGINE_BRAKE: 300,
  LENGTH: 4.6,
  EYE_BACK: 1.0,       // 眼睛在前保险杠后方的距离
  EYE_H: 2.0,
  HEAT_CAP: 600000,
  COOL: 0.025,
};

export const ROAD = { SEG: 5, HALF_W: 4.2, DRAW: 170, FOV: 72 };
export const HORIZON = 300;

export const C = {
  INK: '#111111',
  PAPER: '#fff4dc',
  YELLOW: '#ffd23f',
  RED: '#e63946',
  BLUE: '#1d8fd1',
  CYAN: '#4cc9f0',
  NAVY: '#1b2a49',
  ORANGE: '#ff8c42',
  GREEN: '#5fbf4a',
  PINK: '#ff5d8f',
  WHITE: '#ffffff',
  GREY: '#8d99ae',
  BROWN: '#7a4a2a',
};

export const FONT_EN = "'Bangers', Impact, 'Arial Black', sans-serif";
export const FONT_CN = "'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', 'Heiti SC', sans-serif";
