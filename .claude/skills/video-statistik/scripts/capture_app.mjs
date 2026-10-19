// Captures real WorldStat Atlas screenshots for the video (app served by `npx vite preview --port 4173`).
// usage: node scripts/capture_app.mjs <outdir> [desktop|phone|aerial ...]   (default: all three)
// Desktop: 1600x900 @2x dark theme. Phone: iPhone 13 dark. Aerial: full-screen map without UI.
// Edit the ?geo= targets below for a new story; names must match what the templates use.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.argv[2]; const groups = process.argv.slice(3);
const want = (g) => !groups.length || groups.includes(g);
const B = 'http://localhost:4173/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const INIT = `try{localStorage.setItem('wsa.theme','dark');localStorage.setItem('wsa.installDismissedAt',String(Date.now()))}catch(e){}`;

async function desk() {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('ERR', e.message));
  return { ctx, p };
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` }).then(() => console.log('ok', n));
async function search(p, q) {
  const inp = p.locator('.sb-search input').first();
  await inp.click(); await inp.fill(''); await inp.type(q, { delay: 60 }); await p.waitForTimeout(1500);
}

if (want('desktop')) {
  for (const [name, geo, wait] of [['world', '', 9000], ['mys', 'MYS', 10000], ['sel', 'MY-10', 10000], ['hl', 'MY-10-hulu-langat', 10000], ['parl', 'MY-10-p094', 11000]]) {
    const { ctx, p } = await desk(); await p.goto(B + (geo ? `?geo=${geo}` : '')); await p.waitForTimeout(wait); await shot(p, name);
    if (name === 'hl') { // panel scrolled with the population pyramid, dashboard closed
      await p.getByRole('button', { name: 'Toggle dashboard' }).click().catch(() => {}); await p.waitForTimeout(4000); await shot(p, 'hl-dash');
    }
    await ctx.close();
  }
  { // search, village
    const { ctx, p } = await desk(); await p.goto(B + '?geo=MYS'); await p.waitForTimeout(8000);
    await search(p, 'P094'); await shot(p, 'search-p094');
    await search(p, 'Kampung Batu'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(9000); await shot(p, 'village');
    await ctx.close();
  }
  { // comparison of four countries
    const { ctx, p } = await desk(); await p.goto(B + '?geo=MYS'); await p.waitForTimeout(8000);
    for (const q of ['Malaysia', 'Indonesia', 'Thailand', 'Singapore']) {
      await search(p, q); await p.keyboard.press('Enter'); await p.waitForTimeout(4500);
      await p.locator('.panel button[aria-pressed="false"]').first().click().catch(() => {}); await p.waitForTimeout(800);
    }
    await p.getByRole('button', { name: /^⇆ Banding|^Banding/ }).first().click(); await p.waitForTimeout(5000); await shot(p, 'compare');
    await ctx.close();
  }
  { // projection 2060, sources / download / quality modals
    const { ctx, p } = await desk(); await p.goto(B + '?geo=WORLD'); await p.waitForTimeout(8000);
    await p.locator('.tm input[type=checkbox]').first().check().catch(() => {});
    await p.locator('input[type=range]').first().evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '2060'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.waitForTimeout(5000); await shot(p, 'proj');
    await p.goto(B + '?geo=MYS'); await p.waitForTimeout(7000);
    for (const [btn, n] of [[/^Sumber/, 'sources'], [/MUAT TURUN|Muat turun/i, 'download'], [/Kualiti/, 'quality']]) {
      await p.getByRole('button', { name: btn }).first().click(); await p.waitForTimeout(2500); await shot(p, n); await p.keyboard.press('Escape'); await p.waitForTimeout(800);
    }
    await ctx.close();
  }
  { const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });
    await ctx.addInitScript(INIT.replace("'dark'", "'light'")); const p = await ctx.newPage();
    await p.goto(B + '?geo=MY-10-hulu-langat'); await p.waitForTimeout(10000); await shot(p, 'light-hl'); await ctx.close(); }
}

if (want('phone')) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' }); await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  await p.goto(B + '?geo=MY-10-hulu-langat'); await p.waitForTimeout(10000); await shot(p, 'ph-peek');
  await p.locator('.sheet-handle').first().click(); await p.waitForTimeout(1500); await shot(p, 'ph-full');
  await p.goto(B + '?geo=MY-10-p094'); await p.waitForTimeout(10000); await shot(p, 'ph-parl');
  await p.goto(B); await p.waitForTimeout(10000); await shot(p, 'ph-world');
  await p.goto(B + '?geo=MYS'); await p.waitForTimeout(9000);
  await p.locator('.topbar .icon-btn.only-narrow').first().click(); await p.waitForTimeout(1200);
  const inp = p.locator('.sb-search input').first(); await inp.click(); await inp.type('P094', { delay: 80 }); await p.waitForTimeout(1800); await shot(p, 'ph-search');
  await inp.fill(''); await inp.type('Kampung Batu', { delay: 60 }); await p.waitForTimeout(1800);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(9000); await shot(p, 'ph-village');
  await p.locator('.sheet-handle').first().click().catch(() => {}); await p.waitForTimeout(1500); await shot(p, 'ph-village-full');
  await ctx.close();
  // the install banner only shows when it was not dismissed
  const c2 = await b.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' }); await c2.addInitScript(`try{localStorage.setItem('wsa.theme','dark')}catch(e){}`);
  const p2 = await c2.newPage(); await p2.goto(B); await p2.waitForTimeout(10500); await shot(p2, 'ph-install'); await c2.close();
}

if (want('aerial')) {
  const CSS = `.map-area{position:fixed!important;inset:0!important;z-index:50!important}
.topbar,.sidebar,.panel,.dash,.map-overlay,.maplibregl-ctrl,.maplibregl-ctrl-attrib,.app-banner,.offline-chip,.scrim,.map-tip{display:none!important}`;
  for (const [name, geo] of [['a-world', null], ['a-asia', 'MYS'], ['a-hl', 'MY-10-hulu-langat']]) {
    const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5, colorScheme: 'dark' });
    await ctx.addInitScript(`${INIT};document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(CSS)};document.head.appendChild(s)})`);
    const p = await ctx.newPage(); await p.goto(B + (geo ? `?geo=${geo}` : '')); await p.waitForTimeout(11000); await shot(p, name); await ctx.close();
  }
}
await b.close();
