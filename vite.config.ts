import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, open: true },
  // Relative base so the same build works on GitHub Pages sub-paths, file://-style hosts and Electron/Tauri.
  build: { target: 'es2019', sourcemap: true, assetsInlineLimit: 0 },
});
