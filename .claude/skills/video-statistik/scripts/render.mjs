// Renders frames [from, to) of a composition at 60 fps and pipes them into an intermediate MP4.
// usage: node scripts/render.mjs <page.html> <WxH> <from> <to> <out.mp4> [query]
//   e.g. node scripts/render.mjs comp-16x9.html 1920x1080 0 900 seg/s0.mp4 desc=desc
// Run four of these in parallel (0-900, 900-1800, 1800-2700, 2700-3600) and join with mux.sh.
// Needs the workspace served on http://127.0.0.1:8765 (python3 -m http.server 8765 --bind 127.0.0.1).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
const [page, size, from, to, out, query] = [process.argv[2], process.argv[3], Number(process.argv[4]), Number(process.argv[5]), process.argv[6], process.argv[7] || ''];
const [VW, VH] = size.split('x').map(Number);
const RATE = 60;
const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(RATE), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: VW, height: VH } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(`http://127.0.0.1:8765/${page}?${query}`);
await p.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
const t0 = Date.now();
for (let f = from; f < to; f++) {
  await p.evaluate((t) => window.render(t), f / RATE);
  if (f === from) await p.waitForTimeout(400);
  const buf = await p.screenshot({ type: 'jpeg', quality: 95 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if ((f - from) % 300 === 0) console.log(out, f, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await b.close();
console.log('done', out, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
