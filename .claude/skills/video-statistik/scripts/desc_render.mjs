// Renders the map descent (desc.html) frame by frame, waiting for every tile before each screenshot.
// usage: VIEW=1920x1080 node scripts/desc_render.mjs <outdir> <fromFrame> <toFrame> [test]
//   270 frames = 9 s at 30 fps (PATH.DESC_T0 .. DESC_T1). Split over 3-4 processes.
// Needs spki.txt in the workspace (python3 scripts/proxy_spki.py spki.txt) and Esri hosts allowed.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
const [out, from, to, test] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4]), process.argv[5]];
const [VW, VH] = (process.env.VIEW || '1920x1080').split('x').map(Number);
mkdirSync(out, { recursive: true });
const T0 = 16.0, FPS = 30;
const SPKI = readFileSync('spki.txt', 'utf8').trim(); // the sandbox proxy CA keys (see proxy_spki.py)
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--ignore-certificate-errors-spki-list=${SPKI}`] });
const p = await b.newPage({ viewport: { width: VW, height: VH } });
p.on('pageerror', (e) => console.log('ERR', e.message));
p.on('console', (m) => { const s = m.text(); if (/maperr|ERR|rror/.test(s)) console.log('c', s.slice(0, 160)); });
await p.goto(`http://127.0.0.1:8765/desc.html${test === 'test' ? '?test=1' : ''}`);
await p.waitForFunction(() => window.ready, null, { timeout: 180000 });
const t0 = Date.now();
for (let f = from; f < to; f++) {
  const c = await p.evaluate((t) => window.frame(t), T0 + f / FPS);
  await p.screenshot({ path: `${out}/f_${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  if ((f - from) % 30 === 0) console.log(f, `z=${c.z.toFixed(2)} pitch=${c.pitch.toFixed(0)}`, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log('done', out, from, to, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
await b.close();
