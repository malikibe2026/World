// Renders a few still frames of a composition for review (always look at them before a full render).
// usage: node scripts/preview.mjs <page.html> <WxH> <outdir> <t1> [t2 ...]   (env Q = extra query, e.g. Q=desc=descv)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const [page, size, out] = process.argv.slice(2, 5); const times = process.argv.slice(5).map(Number);
const [VW, VH] = size.split('x').map(Number);
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: VW, height: VH } });
p.on('pageerror', (e) => console.log('ERR', e.message));
p.on('console', (m) => { const s = m.text(); if (!/GL Driver|404|desc frame|^img /.test(s)) console.log('console', s.slice(0, 160)); });
await p.goto(`http://127.0.0.1:8765/${page}?${process.env.Q || ''}`);
await p.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
for (const t of times) {
  await p.evaluate((t) => window.render(t), t);
  await p.screenshot({ path: `${out}/f-${t.toFixed(2)}.jpg`, type: 'jpeg', quality: 85 });
}
await b.close();
console.log('ok', times.length, 'frames in', out);
