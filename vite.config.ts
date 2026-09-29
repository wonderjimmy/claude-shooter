import { defineConfig } from 'vite';

// `vite build --mode artifact` inlines every asset (audio, fonts) as data URIs
// so scripts/build-artifact.mjs can fold the whole game into one HTML file.
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    // Relative base so the same build works on GitHub Pages sub-paths and Electron/Tauri.
    base: './',
    server: { port: 5173, open: true },
    build: {
      target: 'es2019',
      sourcemap: !artifact,
      assetsInlineLimit: artifact ? 100_000_000 : 0,
      outDir: artifact ? 'dist-artifact' : 'dist',
      cssCodeSplit: false,
    },
  };
});
