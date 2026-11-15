// Drives the built page like a user: garage -> save -> arena, bot lab errors, watchdog, replay import, league.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { runMatch } from '../engine/index.js';
import { loadBot } from '../node/loader.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appUrl = (file = 'index.html', hash = '') => (process.env.IRONYARD_TEST_BASE_URL
  ? new URL(file, process.env.IRONYARD_TEST_BASE_URL).href : 'file://' + path.join(root, 'dist', file)) + hash;
// a replay file to import later, made with the same engine the page runs
const replayFile = path.join(os.tmpdir(), 'ironyard-replay-test.json');
fs.writeFileSync(replayFile, JSON.stringify(runMatch({ mode: '1v1', map: 'canyon', seed: 4, teams: [[loadBot('hornet')], [loadBot('wasp')]] })));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.goto(appUrl());
const ready = () => page.waitForFunction(() => document.getElementById('busy').hidden && document.querySelectorAll('.vlabel').length > 0 && !document.getElementById('run').disabled, { timeout: 30000 });
await ready();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (sel) => page.$eval(sel, (n) => n.textContent);
const tab = (t) => page.evaluate((x) => document.querySelector(`.tab[data-tab="${x}"]`).click(), t);

// Saved ladder: attribution, per-mode ranks, author grouping and partial-season state.
await tab('league');
const snapshot = await page.evaluate(() => window.__LADDER);
assert.equal(await page.$$eval('#lb-table tbody tr', rows => rows.length), snapshot.entrants);
assert.match(await text('#lb-table'), /Recorded model/);
assert.match(await text('#lb-table'), /gpt-6-astra/);
assert.match(await text('#lb-table'), /Not recorded/);
assert.match(await text('#lb-note'), /no overall or model ranking/);
const selectQueue = async q => page.evaluate(q => [...document.querySelectorAll('#lb-mode button')].find(b => b.textContent === q).click(), q);
await selectQueue('2v2');
assert.equal(await page.$eval('#lb-table tbody tr td:nth-child(2)', n => n.textContent), 'Astra — Starforge');
assert.match(await text('#lb-note'), /every team slot/);
await page.evaluate(() => [...document.querySelectorAll('#lb-by button')].find(b => b.textContent === 'By author').click());
assert.match(await text('#lb-note'), /ordered by their best bot/);
await page.evaluate(() => { window.__LADDER.queues['2v2'].onFile = 0; });
await selectQueue('2v2');
assert.match(await text('#lb-meta'), /Provisional/);
await page.evaluate(s => { window.__LADDER = s; }, snapshot);
await selectQueue('Overview');

// 1. garage: build a small two-layer car by tapping studs, mirror it, save, land in the arena with it
await tab('garage');
await page.waitForFunction(() => !!document.querySelector('#g-preview canvas') && document.querySelectorAll('#palette .pbtn img').length > 30, { timeout: 20000 });
await page.click('#g-clear');
const layer = (name) => page.evaluate((n) => [...document.querySelectorAll('#layer-seg button')].find((b) => b.textContent.includes(n)).click(), name);
const tap = async (tool, cells, dir) => {
  if (dir) await page.evaluate((d) => [...document.querySelectorAll('#dir-seg button')].find((b) => b.textContent === d).click(), dir);
  await page.evaluate((t) => [...document.querySelectorAll('.pbtn')].find((b) => b.querySelector('b').textContent === t).click(), tool);
  for (const [x, y] of cells) await page.evaluate((i) => document.querySelectorAll('#bp .cell')[i].click(), (5 - y) * 9 + (x + 4));
};
const cellAt = (x, y) => page.evaluate((i) => { const c = document.querySelectorAll('#bp .cell')[i]; return { type: c.dataset.type || null, cont: c.classList.contains('cont') }; }, (5 - y) * 9 + (x + 4));
await layer('CHASSIS');
await tap('Plate 2x2', [[-1, -1]]);                      // covers x -1..0, y -1..0 and replaces the starter plate
assert.deepEqual(await cellAt(0, 0), { type: 'plate4', cont: true });
await tap('Plate 1x1', [[-1, 1], [0, 1]]);
await tap('Wheel', [[-2, -1], [-2, 1]]);
await tap('Reactor', [[0, -2]]);
await tap('Machine-gun turret', [[-1, 1]], '↑');         // deck-only piece: the editor switches layer by itself
assert.equal(await page.evaluate(() => document.querySelector('#layer-seg button[aria-pressed="true"]').textContent.includes('DECK')), true);
await tap('Cannon 1x2', [[0, 1]], '↑');                  // two studs long: (0,1) and (0,2)
assert.deepEqual(await cellAt(0, 2), { type: 'cannon', cont: true });
await page.click('#g-mirror');                           // wheels, the left plate and the gun get a twin on the right
assert.equal((await cellAt(1, 1)).type, 'mg');
await layer('CHASSIS');
assert.equal((await cellAt(2, -1)).type, 'wheel'); assert.equal((await cellAt(2, 1)).type, 'wheel'); assert.equal((await cellAt(1, 1)).type, 'plate');
assert.match(await text('#g-msgs'), /wheel at \(2, -1\) on chassis is not connected/); // the 2x2 plate straddles the centre line, so it has no twin
await tap('Plate 1x1', [[1, -1], [1, 0]]);
assert.match(await text('#g-msgs'), /Blueprint is valid|slow turn|lopsided|energy/);
assert.equal(await text('#g-cost'), String(18 + 5 * 6 + 4 * 30 + 75 + 110 + 2 * 70));
assert.equal(await text('#g-class'), 'Featherweight');
// an illegal move is explained: a tall brick in front of the left gun (with a plate under it so support is not the issue)
await tap('Plate 1x1', [[-1, 2]]);
await layer('DECK');
await tap('Brick 1x1', [[-1, 2]]);
assert.match(await text('#g-msgs'), /mg at \(-1, 1\) on deck facing N is blocked by brick/);
// a slope in the same spot is low, so the gun fires over it
await tap('Slope armor', [[-1, 2]], '↑');
assert.doesNotMatch(await text('#g-msgs'), /blocked/);
await page.click('#erase'); await page.evaluate((i) => document.querySelectorAll('#bp .cell')[i].click(), (5 - 2) * 9 + 3); await page.click('#erase');
assert.equal((await cellAt(-1, 2)).type, null);
await page.evaluate(() => document.querySelector('#g-paint .swatch[title="lime"]').click());
await page.$eval('#g-name', (n) => { n.value = 'Test Car'; });
await page.select('#g-ai', 'rookie');
await page.click('#g-save');
await page.waitForFunction(() => /Test Car/.test(document.getElementById('roster').textContent), { timeout: 30000 });
await ready();
assert.match(await text('#roster'), /Test Car/);
assert.match(await text('#roster'), /my-test-car/);
assert.equal(await page.evaluate(() => location.hash), '#arena');
assert.equal(await page.evaluate(() => window.__ironyard.replay.vehicles[0].design.paint.accent), 'lime');

// 2. bot lab: syntax error gets a line number, bad design gets the validator message
await tab('lab');
await page.select('#lab-bot', 'my-test-car');
const src = await page.$eval('#lab-src', (n) => n.value);
assert.match(src, /Made in the garage/); assert.match(src, /"type": "cannon", "x": 0, "y": 1, "z": 1/); assert.match(src, /"accent": "lime"/);
await page.$eval('#lab-src', (n) => { n.value = 'const design = {parts: []};\nfunction tick( {'; });
await page.click('#lab-check'); await sleep(800);
assert.match(await text('#lab-msg'), /near line \d+|Unexpected|SyntaxError/);
await page.$eval('#lab-src', (n) => { n.value = 'const design = {parts: [{type:"wheel",x:0,y:0}]};\nfunction tick() { return {}; }'; });
await page.click('#lab-check'); await sleep(1200);
assert.match(await text('#lab-msg'), /at least 1 core/);

// 3. watchdog: a controller that never returns is killed, the page stays usable
await page.$eval('#lab-src', (n, s) => { n.value = s.replace('function tick(state, api) {', 'function tick(state, api) { if (state.t > 0.2) for (;;) {}'); }, src);
await page.$eval('#lab-name', (n) => { n.value = 'hang'; });
const t0 = Date.now();
await page.click('#lab-save');
await page.waitForFunction(() => /infinite loop/.test(document.getElementById('lab-msg').textContent), { timeout: 40000 });
console.log(`watchdog fired after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ironyard.v2')).custom).includes('hang')), false);

// 4. the arena still works after the worker was killed; replay import
await tab('arena');
await page.click('#reseed'); await ready();
const up = await page.$('#replay-file');
await up.uploadFile(replayFile);
await page.waitForFunction(() => /Replay loaded/.test(document.getElementById('setup-msg').textContent), { timeout: 10000 });
assert.match(await text('#roster'), /Hornet/); assert.match(await text('#roster'), /Wasp/);

// 5. playback controls: jump to the end -> banner + report
await page.evaluate(() => { const s = document.getElementById('scrub'); s.value = s.max; s.dispatchEvent(new Event('input')); });
await page.waitForFunction(() => !document.getElementById('banner').hidden, { timeout: 5000 });
assert.match(await text('#banner'), /wins|Draw/);
assert.match(await text('#report'), /Accuracy/);

// 6. league with the custom bot, then jump from the head-to-head grid into a match
await tab('league');
await page.evaluate(() => { for (const b of document.querySelectorAll('#lg-bots .chip')) if (!/Rookie|Test Car|Hornet/.test(b.textContent) && b.getAttribute('aria-pressed') === 'true') b.click(); });
await page.evaluate(() => { for (const b of document.querySelectorAll('#lg-bots .chip')) if (/Test Car/.test(b.textContent) && b.getAttribute('aria-pressed') !== 'true') b.click(); });
assert.match(await text('#lg-count'), /^18 matches/);
await page.click('#lg-run');
await page.waitForFunction(() => !document.getElementById('lg-result').hidden, { timeout: 60000 });
assert.equal(await page.$$eval('#lg-table tbody tr', (r) => r.length), 3);
await page.evaluate(() => document.querySelector('#lg-h2h td.h2h button').click());
await ready();
assert.equal(await page.evaluate(() => location.hash), '#arena');

// 7. deep link + reload keeps the custom bot
await page.goto(appUrl('index.html', '#rules'));
await sleep(1500);
assert.equal(await page.evaluate(() => document.getElementById('tab-rules').hidden), false);
assert.match(await text('#rules'), /Parts list/);
assert.ok(await page.evaluate(() => 'my-test-car' in JSON.parse(localStorage.getItem('ironyard.v2')).custom));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert.ok(overflow <= 1, 'no sideways page scroll on a phone (' + overflow + 'px)');
assert.deepEqual(errors, []);

// 8. the hosted build takes three.js from a CDN: if that request fails the page must still boot, in 2D
{
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const errs2 = [];
  p2.on('pageerror', (e) => errs2.push(e.message));
  await p2.setRequestInterception(true);
  p2.on('request', (r) => (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(appUrl('artifact.html')).origin ? r.abort() : r.continue()));
  await p2.goto(appUrl('artifact.html'), { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => document.getElementById('busy').hidden && document.querySelectorAll('.vlabel').length > 0, { timeout: 40000 });
  assert.equal(await p2.evaluate(() => typeof THREE), 'undefined');
  assert.equal(await p2.$eval('#view2d', (n) => n.getAttribute('aria-pressed')), 'true');
  await p2.evaluate(() => document.querySelector('.tab[data-tab="garage"]').click());
  await sleep(600);
  assert.equal(await p2.$eval('#g-preview', (n) => n.hidden), true);
  assert.equal(await p2.$$eval('#bp .cell', (n) => n.length), 99);
  assert.deepEqual(errs2, []);
  await p2.close();
}
console.log('UI end-to-end: all checks passed');
await browser.close();
