import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the same build works on GitHub Pages sub-paths and Electron/Tauri.
  base: './',
  server: { port: 5173, open: true },
  build: { target: 'es2019', sourcemap: true, assetsInlineLimit: 0 },
});
