import '@fontsource/bangers';
import { H, W } from './config';
import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// 保持 16:9 等比缩放，填满可用视口
function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const s = Math.min(vw / W, vh / H);
  canvas.style.width = `${Math.round(W * s)}px`;
  canvas.style.height = `${Math.round(H * s)}px`;
}
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 100));
if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
fit();

// ---- 横屏 / 全屏按钮（移动端）----
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
type FsDoc = Document & { webkitExitFullscreen?: () => Promise<void>; webkitFullscreenElement?: Element };
type OrientationLock = ScreenOrientation & { lock?: (o: string) => Promise<void> };

const fsDoc = document as FsDoc;
const isFullscreen = () => !!(document.fullscreenElement || fsDoc.webkitFullscreenElement);

async function enterFullscreen() {
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch { /* 用户拒绝或不支持 */ }
}
async function exitFullscreen() {
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (fsDoc.webkitExitFullscreen) await fsDoc.webkitExitFullscreen();
  } catch { /* ignore */ }
}
async function lockLandscape() {
  const o = screen.orientation as OrientationLock | undefined;
  try { await o?.lock?.('landscape'); } catch { /* iOS Safari 不支持，靠竖屏提示兜底 */ }
}

const btnFull = document.getElementById('btnFull');
const btnRotate = document.getElementById('btnRotate');
const btnGo = document.getElementById('btnGo');

btnFull?.addEventListener('click', async () => {
  if (isFullscreen()) await exitFullscreen();
  else await enterFullscreen();
  setTimeout(fit, 150);
});
btnRotate?.addEventListener('click', async () => { await lockLandscape(); setTimeout(fit, 150); });
// 竖屏提示里的大按钮：一键全屏 + 横屏
btnGo?.addEventListener('click', async () => { await enterFullscreen(); await lockLandscape(); setTimeout(fit, 200); });
document.addEventListener('fullscreenchange', () => { if (btnFull) btnFull.textContent = isFullscreen() ? '🗗' : '⛶'; setTimeout(fit, 150); });

async function boot() {
  try { await Promise.race([document.fonts.load("40px 'Bangers'"), new Promise((r) => setTimeout(r, 1500))]); } catch { /* 字体失败用回退字体 */ }
  const game = new Game(canvas, ctx);
  game.input.attachTouch(canvas);
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
