// Opens the built page in headless Chrome, reports console errors and takes screenshots.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.SHOTS || '/tmp/shots';
const steps = (process.argv[2] || 'arena').split(',');
const mobile = process.argv.includes('--mobile');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1360, height: 900, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto('file://' + path.join(root, 'dist/index.html'));
await page.waitForFunction(() => document.getElementById('busy').hidden && document.querySelectorAll('.vlabel').length > 0, { timeout: 30000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = mobile ? 'm' : 'd';
for (const step of steps) {
  if (step === 'arena') { await sleep(2500); }
  else if (step.startsWith('t=')) { await page.evaluate((t) => { const s = document.getElementById('scrub'); s.value = String(t * 30); s.dispatchEvent(new Event('input')); }, Number(step.slice(2))); await sleep(700); }
  else if (step === 'end') { await page.evaluate(() => { const s = document.getElementById('scrub'); s.value = String(Number(s.max) - 20); s.dispatchEvent(new Event('input')); }); await sleep(1800); }
  else if (step === '2d') { await page.click('#view2d'); await sleep(600); }
  else if (step === '3d') { await page.click('#view3d'); await sleep(600); }
  else if (step === 'top') { await page.select('#camera', 'top'); await sleep(500); }
  else if (step.startsWith('follow')) { await page.select('#camera', 'f' + step.slice(6)); await page.evaluate(() => { document.getElementById('speed').value = '0.5'; document.getElementById('speed').dispatchEvent(new Event('change')); }); await sleep(1800); }
  else if (step === 'zoom') { const r = await page.evaluate(() => { const b = document.querySelector('.arena-canvas').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }); await page.mouse.move(r[0], r[1]); for (let i = 0; i < 6; i++) await page.mouse.wheel({ deltaY: -260 }); await page.evaluate(() => document.getElementById('play').click()); await sleep(1500); }
  else if (step === 'pause') { await page.evaluate(() => document.getElementById('play').click()); await sleep(300); }
  else if (step.startsWith('map:')) { await page.select('#map', step.slice(4)); await page.evaluate(() => document.getElementById('run').click()); await sleep(400); await page.waitForFunction(() => document.getElementById('busy').hidden && !document.getElementById('run').disabled, { timeout: 30000 }); await sleep(1200); }
  else if (step.startsWith('mode:')) { await page.evaluate((m) => [...document.querySelectorAll('#mode-seg button')].find((b) => b.textContent === m).click(), step.slice(5)); await sleep(300); }
  else if (step === 'leaguerun') { await page.evaluate(() => document.getElementById('lg-run').click()); await page.waitForFunction(() => !document.getElementById('lg-result').hidden, { timeout: 120000 }); await sleep(300); }
  else if (step === 'labcheck') { await page.evaluate(() => document.getElementById('lab-check').click()); await sleep(2500); }
  else { await page.evaluate((t) => document.querySelector(`.tab[data-tab="${t}"]`).click(), step); await sleep(900); }
  await page.screenshot({ path: `${out}/${tag}-${step.replace(/[=:]/g, '')}.png`, fullPage: !/^(arena|t=|2d|3d|top|follow|zoom|pause|map:|mode:)/.test(step) || step === 'end' });
}
const info = await page.evaluate(() => ({ webgl: !!document.createElement('canvas').getContext('webgl'), view: document.getElementById('view3d').getAttribute('aria-pressed'),
  clock: document.getElementById('clock').textContent, labels: document.querySelectorAll('.vlabel').length, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
console.log(JSON.stringify(info));
console.log(errors.length ? errors.slice(0, 12).join('\n') : 'no console errors');
await browser.close();
