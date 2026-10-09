import '@fontsource/bangers';
import { H, W } from './config';
import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// 保持 16:9 等比缩放
function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
}
window.addEventListener('resize', fit);
fit();

async function boot() {
  try { await Promise.race([document.fonts.load("40px 'Bangers'"), new Promise((r) => setTimeout(r, 1500))]); } catch { /* 字体失败用回退字体 */ }
  const game = new Game(canvas, ctx);
  game.debug(new URLSearchParams(location.search));
  // 调试用：控制台可访问
  (window as unknown as { game: Game }).game = game;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt, now);
    game.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
boot();
