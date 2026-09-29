// Folds dist-artifact/ (built with `vite build --mode artifact`) into a single
// self-contained HTML page for hosts that accept exactly one file, such as a
// claude.ai Artifact. Output: dist-artifact/carrion-ix.html
//
// The page is body content only (the host supplies <html>/<head>), fonts come
// from Google Fonts (the self-hosted @fontsource faces are stripped to keep the
// file small), and JS + CSS are inlined.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-artifact';
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const cssHref = /<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/.exec(html)?.[1];
const jsSrc = /<script type="module"[^>]*src="\.\/([^"]+)"/.exec(html)?.[1];
if (!cssHref || !jsSrc) throw new Error('Could not find the built CSS/JS in index.html');

const css = readFileSync(join(dir, cssHref), 'utf8').replace(/@font-face\{[^}]*\}/g, '');
const js = readFileSync(join(dir, jsSrc), 'utf8').replace(/<\/script/gi, '<\\/script');
const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1]?.trim() ?? '';

const page = `<title>Carrion IX</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700;800&family=Space+Grotesk:wght@500;700&display=swap">
<style>${css}</style>
${body}
<script type="module">${js}</script>
`;

const out = join(dir, 'carrion-ix.html');
writeFileSync(out, page);
console.log(`${out}: ${(statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
