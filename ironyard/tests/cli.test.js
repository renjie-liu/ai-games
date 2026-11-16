import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('CLI reports runtime failures as unscored and returns a failing exit code', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ironyard-cli-'));
  try {
    const source = fs.readFileSync(new URL('../bots/rookie.js', import.meta.url), 'utf8');
    const bot = path.join(dir, 'late-failure.js');
    fs.writeFileSync(bot, source.replace('function tick(state, api) {', 'function tick(state, api) { if (state.t > 9) throw new Error("late fixture failure");'));
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ['node/cli.js', 'tournament', '--bots', bot + ',rookie', '--maps', 'proving', '--seeds', '1', '--json'], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8', timeout: 30000 });
    assert.ifError(run.error);
    assert.equal(run.status, 1, run.stderr);
    assert.ok(run.stdout.trim(), run.stderr);
    const out = JSON.parse(run.stdout);
    assert.equal(out.complete, false); assert.equal(out.unscoredMatches, 2);
    assert.ok(out.standings.every(r => r.points === 0 && r.d === 0 && r.played === 0));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
