// Screenshots of every map: an overview and a mid-fight close-up of the arena canvas.
//   node tests/maps.mjs [map,map,...] [--mobile]
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.SHOTS || '/tmp/shots';
const mobile = process.argv.includes('--mobile');
const want = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'proving,sumo,canyon,frostbite,foundry,skybridge,bog').split(',');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(' ') : [])] });
const page = await browser.newPage();
await page.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1500, height: 1000, deviceScaleFactor: 1 });
if (process.env.WEBGL1) await page.evaluateOnNewDocument(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return t === 'webgl2' ? null : g.call(this, t, ...a); }; }); // exercise the WebGL 1 path
const errors = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text().slice(0, 600)}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto('file://' + path.join(root, 'dist/index.html'));
const ready = () => page.waitForFunction(() => document.getElementById('busy').hidden && document.querySelectorAll('.vlabel').length > 0 && !document.getElementById('run').disabled, { timeout: 60000 });
await ready();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { const el = await page.$('.arena-canvas'); await el.screenshot({ path: `${out}/${name}.png` }); };
const scrub = (t) => page.evaluate((tt) => { const s = document.getElementById('scrub'); s.value = String(Math.min(Number(s.max), tt * 30)); s.dispatchEvent(new Event('input')); }, t);
for (const map of want) {
  const t0 = Date.now();
  await page.evaluate((m) => [...document.querySelectorAll('#mode-seg button')].find((b) => b.textContent === m).click(), map === 'bog' ? '2v2' : '1v1');
  await page.select('#map', map);
  await page.evaluate(() => document.getElementById('run').click());
  await sleep(500); await ready();
  await page.evaluate(() => document.getElementById('play').click()); // pause
  await page.select('#camera', 'iso'); await scrub(4); await sleep(1500); await shot(`${map}-wide`);
  await page.select('#camera', 'auto'); await scrub(9); await sleep(1500); await shot(`${map}-auto`);
  if (process.argv.includes('--zoom')) { const r = await page.evaluate(() => { const b = document.querySelector('.arena-canvas').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }); await page.mouse.move(r[0], r[1]); for (let i = 0; i < 5; i++) await page.mouse.wheel({ deltaY: -260 }); await sleep(1500); await shot(`${map}-zoom`); }
  await page.evaluate(() => document.getElementById('play').click());
  console.log(map, ((Date.now() - t0) / 1000).toFixed(1) + 's', 'scenery built in', await page.evaluate(() => window.__ironyard.renderer.lastLoadMs), 'ms');
}
console.log(await page.evaluate(() => { const r = window.__ironyard.renderer; return r && r.renderer ? 'webgl2=' + r.renderer.capabilities.isWebGL2 + ' maxTextures=' + r.renderer.capabilities.maxTextures : 'no 3D renderer'; }));
console.log(errors.length ? errors.slice(0, 10).join('\n') : 'no console errors');
await browser.close();
