// End-to-end check of the MCP server using the official SDK client, over both transports.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironyard-'));
const env = { ...process.env, IRONYARD_BOTS_DIR: path.join(tmp, 'bots'), IRONYARD_REPLAY_DIR: path.join(tmp, 'replays') };
const text = (r) => r.content.map((c) => c.text).join('\n');

const E = '.  .  .  .  .  .  .  .  .';
const DECK = [E, E,
  '.  .  .  /^ /^ /^ .  .  .',
  '.  .  .  :  :  :  .  .  .',
  '.  .  a  C^ C^ C^ a  .  .',
  '.  .  .  b  @  b  .  .  .',
  '.  .  .  .  g  .  .  .  .',
  E, E, E, E];
const CHASSIS = [E, E,
  '.  .  .  p  p  p  .  .  .',
  '.  .  .  p  p  p  .  .  .',
  '.  o  p  p  r  p  p  o  .',
  '.  .  p  p  r  p  p  .  .',
  '.  o  p  p  e  p  p  o  .',
  E, E, E, E];
const BOT = `
const meta = { name: 'E2E Striker', author: 'test', notes: 'three cannons firing over a slope glacis' };
const design = (ctx, api) => api.util.blueprint('Striker', {
  deck: ${JSON.stringify(DECK)},
  chassis: ${JSON.stringify(CHASSIS)},
}, { paint: { accent: 'red' } });
let route = null;
function tick(state, api) {
  const { self } = state, U = api.util;
  route ??= api.nav.follower();
  const foe = state.enemies[0];
  const goal = foe || state.lastSeen.find((l) => l.alive) || api.map.center;
  const cmd = U.driveTo(self, route.next(self, goal.x, goal.y, state.tick));
  if (foe) {
    const d = U.dist(self, foe);
    cmd.aim = U.lead(self, foe, 24);
    cmd.fire = d < 19 && api.nav.los(self.x, self.y, foe.x, foe.y);
    if (d < 14 && cmd.fire) { Object.assign(cmd, U.turnTo(self, cmd.aim.angle)); cmd.throttle = d < 8 ? -0.6 : 0; }
    if (state.tick % 600 === 0) api.log('range', d.toFixed(1));
  }
  return cmd;
}`;

async function exercise(client, label) {
  const info = client.getServerVersion();
  assert.equal(info.name, 'ironyard');
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['evaluate_bot', 'get_bot', 'get_rules', 'list_bots', 'list_maps', 'list_parts', 'run_match', 'run_tournament', 'submit_bot', 'validate_design']);

  const rules = text(await client.callTool({ name: 'get_rules', arguments: {} }));
  assert.match(rules, /controller contract/); assert.match(rules, /railgun/);

  const parts = JSON.parse(text(await client.callTool({ name: 'list_parts', arguments: { category: 'weapon' } })));
  assert.ok(parts.parts.cannon && !parts.parts.wheel);
  assert.deepEqual(parts.parts.mortar.size, [2, 2]); assert.equal(parts.parts.cannon.layer, 'deck');
  const decor = JSON.parse(text(await client.callTool({ name: 'list_parts', arguments: { category: 'decor' } })));
  assert.ok(decor.parts.flag && decor.parts.flag.cost === 0);

  const maps = JSON.parse(text(await client.callTool({ name: 'list_maps', arguments: { map: 'sumo' } })));
  assert.equal(maps.maps[0].layout.length, 20);

  // an illegal design gets precise feedback…
  const bad = JSON.parse(text(await client.callTool({ name: 'validate_design', arguments: { design: { parts: [
    { type: 'plate', x: 0, y: 0, z: 0 }, { type: 'plate', x: 0, y: 1, z: 0 }, { type: 'plate', x: 0, y: 2, z: 0 }, { type: 'plate', x: 0, y: 3, z: 0 },
    { type: 'core', x: 0, y: 0, z: 1 }, { type: 'cannon', x: 0, y: 1, z: 1, dir: 'N' }, { type: 'armor', x: 0, y: 3, z: 1 }, { type: 'mg', x: 1, y: 0, z: 1 }] } } })));
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /cannon at \(0, 1\) on deck facing N is blocked by armor at \(0, 3\) on deck/);
  assert.match(bad.errors.join(' '), /mg at \(1, 0\) on deck has nothing under it/);
  // …and a legal two-layer ASCII blueprint gets stats and a picture back
  const good = JSON.parse(text(await client.callTool({ name: 'validate_design', arguments: { blueprint: { deck: DECK, chassis: CHASSIS, accent: 'red' } } })));
  assert.equal(good.ok, true, good.errors.join('; ')); assert.ok(good.stats.cost <= 1200 && good.stats.topSpeed > 3); assert.equal(good.stats.weapons.cannon, 3);
  assert.match(good.picture, /DECK/); assert.match(good.picture, /CHASSIS/);

  // broken source is rejected and nothing is saved
  const broken = await client.callTool({ name: 'submit_bot', arguments: { name: 'broken', source: 'const design = {parts:[]}; function tick(){ return {} }' } });
  assert.equal(broken.isError, true); assert.match(text(broken), /not saved/);
  const syntax = await client.callTool({ name: 'submit_bot', arguments: { name: 'broken', source: 'function tick( {' } });
  assert.equal(syntax.isError, true);
  const shadow = await client.callTool({ name: 'submit_bot', arguments: { name: 'rookie', source: BOT } });
  assert.match(text(shadow), /built-in/);

  const name = 'e2e-' + label;
  const saved = JSON.parse(text(await client.callTool({ name: 'submit_bot', arguments: { name, source: BOT } })));
  assert.equal(saved.saved, name);
  assert.equal(saved.smokeTest.length, 1, 'one vehicle, fielded everywhere');
  assert.deepEqual(saved.smokeTest[0].fieldedAs, ['1v1 slot 0', '2v2 slot 0', '2v2 slot 1', '3v3 slot 0', '3v3 slot 1', '3v3 slot 2']);
  assert.equal(saved.smokeTest[0].weapons.cannon, 3);

  const bots = JSON.parse(text(await client.callTool({ name: 'list_bots', arguments: {} })));
  assert.ok(bots.bots.some((b) => b.name === name && b.kind === 'user'));
  assert.match(text(await client.callTool({ name: 'get_bot', arguments: { name } })), /E2E Striker/);

  const m1 = JSON.parse(text(await client.callTool({ name: 'run_match', arguments: { team_a: [name], team_b: ['rookie'], map: 'canyon', seed: 5, save_replay: true } })));
  const m2 = JSON.parse(text(await client.callTool({ name: 'run_match', arguments: { team_a: [name], team_b: ['rookie'], map: 'canyon', seed: 5 } })));
  assert.equal(m1.result, m2.result); assert.equal(m1.duration, m2.duration);
  assert.ok(fs.existsSync(m1.replayFile));
  assert.ok(JSON.parse(fs.readFileSync(m1.replayFile, 'utf8')).frames.length > 50);
  const team = JSON.parse(text(await client.callTool({ name: 'run_match', arguments: { team_a: [name, 'medic', 'bastion'], team_b: ['wolfpack'], mode: '3v3', map: 'bog' } })));
  assert.equal(team.vehicles.length, 6);

  const ev = JSON.parse(text(await client.callTool({ name: 'evaluate_bot', arguments: { name, maps: ['proving', 'sumo'], opponents: ['rookie', 'bulldozer', 'hornet'] } })));
  assert.equal(ev.matches, 12); assert.equal(ev.wins + ev.draws + ev.losses, 12);

  const tour = JSON.parse(text(await client.callTool({ name: 'run_tournament', arguments: { bots: [name, 'rookie', 'wasp'], maps: ['proving'] } })));
  assert.equal(tour.matches, 6); assert.equal(tour.standings.length, 3);

  const unknown = await client.callTool({ name: 'run_match', arguments: { team_a: ['nope'], team_b: ['rookie'] } });
  assert.equal(unknown.isError, true); assert.match(text(unknown), /unknown bot/);
  // arguments an agent gets nearly right are taken as meant; the rest are refused in words it can act on
  const loose = JSON.parse(text(await client.callTool({ name: 'run_match', arguments: { team_a: name, team_b: 'rookie', map: 'canyon', seed: '5' } })));
  assert.equal(loose.duration, m2.duration);
  const asText = JSON.parse(text(await client.callTool({ name: 'validate_design', arguments: { design: JSON.stringify({ parts: [{ type: 'plate', x: 0, y: 0, z: 0 }, { type: 'core', x: 0, y: 0, z: 1 }] }) } })));
  assert.equal(asText.ok, true);
  const refuse = async (tool, args, re) => { const r = await client.callTool({ name: tool, arguments: args }); assert.equal(r.isError, true); assert.match(text(r), re); };
  await refuse('run_match', { team_a: [name], team_b: ['rookie'], maps: ['sumo'] }, /run_match has no argument "maps"\. It takes: team_a \(required\), team_b \(required\), mode, map/);
  await refuse('run_match', { team_a: [name], team_b: ['rookie'], mode: '5v5' }, /argument "mode" must be one of 1v1, 2v2, 3v3, got "5v5"/);
  await refuse('run_match', { team_b: ['rookie'] }, /missing required argument "team_a"/);
  await refuse('validate_design', { design: { parts: [] }, budget: 50 }, /argument "budget" must be between 100 and 5000, got 50/);
  await refuse('submit_bot', { name: 'Bad Name', source: 'x' }, /argument "name" must match/);
  await refuse('submit_bot', { name: 'crasher', source: BOT.replace('const foe = state.enemies[0];', 'const foe = state.enemy[0];') }, /not saved — the controller failed in the smoke test: 1v1 slot 0: tick threw at t=0\.00: Cannot read properties of undefined \(reading '0'\) \(line \d+\)/);
  await refuse('submit_bot', { name: 'broken', source: BOT.replace('function tick(state, api) {', 'function tick(state, api) {\n  const = 1;') }, /failed to compile: .* \(line \d+\)/);

  const prompts = await client.listPrompts();
  assert.equal(prompts.prompts[0].name, 'build-a-bot');
  const p = await client.getPrompt({ name: 'build-a-bot', arguments: { mode: '2v2', idea: 'hover sniper' } });
  assert.match(p.messages[0].content.text, /hover sniper/);
  const res = await client.readResource({ uri: 'ironyard://rules' });
  assert.match(res.contents[0].text, /Ironyard/);
  console.log(`${label}: ok — ${name} vs rookie on canyon: ${m1.result} (${m1.reason}, ${m1.duration}s); eval ${ev.wins}W ${ev.draws}D ${ev.losses}L; standings ${tour.standings.map((s) => s.bot + ' ' + s.points).join(', ')}`);
}

// stdio
{
  const client = new Client({ name: 'e2e', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'node/mcp-server.js')], env, stderr: 'ignore' }));
  await exercise(client, 'stdio');
  await client.close();
}
// Streamable HTTP
{
  const port = 18787;
  const child = spawn(process.execPath, [path.join(root, 'node/mcp-server.js'), '--http', String(port)], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise((resolve, reject) => { child.stderr.on('data', (d) => /ready/.test(String(d)) && resolve()); child.on('exit', () => reject(new Error('server exited'))); });
  try {
    const client = new Client({ name: 'e2e', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    await exercise(client, 'http');
    await client.close();
    const evil = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
    assert.equal(evil.status, 403);
  } finally { child.kill(); }
}
// Streamable HTTP behind a token
{
  const port = 18788, url = `http://127.0.0.1:${port}/mcp`;
  const child = spawn(process.execPath, [path.join(root, 'node/mcp-server.js'), '--http', String(port)], { env: { ...env, IRONYARD_TOKEN: 'open-sesame' }, stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise((resolve, reject) => { child.stderr.on('data', (d) => /ready/.test(String(d)) && resolve()); child.on('exit', () => reject(new Error('server exited'))); });
  try {
    const ping = (headers) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
    assert.equal((await ping({})).status, 401);
    assert.equal((await ping({ authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await ping({ authorization: 'Bearer open-sesame' })).status, 200);
    const client = new Client({ name: 'e2e', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: 'Bearer open-sesame' } } }));
    assert.equal((await client.listTools()).tools.length, 10);
    await client.close();
    console.log('http with a token: ok');
  } finally { child.kill(); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('MCP end-to-end: all checks passed');
