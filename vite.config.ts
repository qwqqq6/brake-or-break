import { defineConfig } from 'vite';

// base: './' 让构建产物可以直接放到任意静态目录 / GitHub Pages
export default defineConfig({
  base: './',
  server: { port: 5173, open: true },
});
