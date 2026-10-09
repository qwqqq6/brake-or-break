# 别踩断它！BRAKE OR BREAK

美漫街机风第一人称刹车小游戏。车会自动驾驶，你只管刹车——但踏板力超过 1600N 踏板就断。

在线玩：https://qwqqq6.github.io/brake-or-break/

## 运行

```bash
npm install
npm run dev        # 本地开发，自动打开 http://localhost:5173
npm run build      # 构建到 dist/（纯静态，可直接部署）
npm run simtest    # 平衡性自测：机器人司机跑 4S店试驾 + 5 局无尽模式
npm run hidtest    # DualSense 输出报告自测（USB / 蓝牙 / 长度回退）
```

推荐 Chrome / Edge + PS5 手柄（USB 或蓝牙）。

## 操作

| 动作 | 手柄 | 键盘 |
|---|---|---|
| 刹车（模拟量） | L2 | 按住空格 / ↓（力度逐渐上升） |
| 确认 / 返回 | ✕ / ○ | Enter / Esc |
| 暂停 | OPTIONS | Esc |
| 静音 | — | M |
| 启用自适应扳机 | — | H（浏览器要求键盘/鼠标授权） |

## 玩法

- 自动驾驶负责加速和巡航；遇到危险会自动退出（慢动作分镜 + 大大的"刹车!!"），危险解除且松开刹车后重新接管
- 无尽模式随机事件：前车司机睡着急停、环卫工上路、小狗横穿
- 弯道里刹车空间被压缩：超过 1050N 车轮会崴；猛踩突破 1600N 仍是踏板断

## 调试参数（截图/调手感用）

- `?scene=play&level=99&sim=60&stopAtDanger=1&after=0.15&freeze=1`：无尽模式跑到第一次退出自动驾驶后定格
- `?scene=play&level=99&sim=20&brake=0.62&incurve=1&freeze=1`：看弯道限制区
- `?scene=crash&level=99&reason=sprain&target=ditch&ct=2.2&freeze=1`：直接看撞车分镜（pedal / rear / worker / dog / sprain / wall）

## 主要调参位置

- `src/config.ts`：踏板曲线与断点（`PEDAL`）、自适应扳机（`TRIGGER`）、自动驾驶（`AUTO`）、弯道限制（`CURVE`）、车辆（`VAN`）
- `src/levels.ts`：4S店试驾 + 无尽模式生成器（事件密度、速度、难度曲线）
