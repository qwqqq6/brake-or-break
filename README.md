# 别踩断它！BRAKE OR BREAK

美漫街机风第一人称刹车小游戏。踏板力超过 1600N 踏板就断。

## 运行

```bash
npm install
npm run dev        # 本地开发，自动打开 http://localhost:5173
npm run build      # 构建到 dist/（纯静态，可直接部署）
npm run simtest    # 平衡性自测：机器人司机跑完所有关卡
```

推荐 Chrome / Edge + PS5 手柄（USB 或蓝牙）。

## 操作

| 动作 | 手柄 | 键盘 |
|---|---|---|
| 刹车（模拟量） | L2 | 按住空格 / ↓（力度逐渐上升） |
| 油门 | R2 | ↑ |
| 确认 / 返回 | ✕ / ○ | Enter / Esc |
| 暂停 | OPTIONS | Esc |
| 静音 | — | M |
| 启用自适应扳机 | — | H（浏览器要求键盘/鼠标授权） |

## 调试参数（截图/调手感用）

- `?scene=play&level=5&sim=20&brake=0.85&freeze=1`：进入第 5 关，模拟 20 秒后定格
- `?scene=crash&level=2&reason=pedal&ct=3`：直接播放撞车分镜
- `?scene=done&level=1&result=1`：直接看通关封面

## 主要调参位置

- `src/config.ts`：踏板曲线、断点、疲劳、车重、制动放大倍数、热衰退
- `src/levels.ts`：8 个关卡 + 无尽模式生成器
