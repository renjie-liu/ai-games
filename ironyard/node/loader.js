// Node-side bot loading: reads controller files and compiles them in a fresh
// `vm` context per vehicle so instances cannot share state behind the engine's back.
// NOTE: `vm` keeps honest code honest; it is not a hardened security sandbox.
// Only run controllers you would be willing to run as a normal script.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrapBotSource } from '../engine/botwrap.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUILTIN_DIR = path.join(ROOT, 'bots');
export const USER_DIR = process.env.IRONYARD_BOTS_DIR ? path.resolve(process.env.IRONYARD_BOTS_DIR) : path.join(ROOT, 'user_bots');

export const BOT_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function listBots() {
  const out = [];
  for (const [dir, kind] of [[BUILTIN_DIR, 'builtin'], [USER_DIR, 'user']]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith('.js')) continue;
      const id = f.slice(0, -3);
      if (kind === 'user' && out.some((b) => b.id === id)) continue; // built-ins cannot be shadowed
      out.push({ id, kind, file: path.join(dir, f) });
    }
  }
  return out;
}

export function readBotSource(id) {
  if (!BOT_NAME_RE.test(id)) throw new Error(`bad bot name "${id}" (lowercase letters, digits, - and _ only)`);
  for (const dir of [BUILTIN_DIR, USER_DIR]) {
    const file = path.join(dir, id + '.js');
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  }
  throw new Error(`unknown bot "${id}". Known bots: ${listBots().map((b) => b.id).join(', ')}`);
}

/** Compile a controller source into a bot { id, factory } usable by runMatch. */
export function makeBot(id, source) {
  let script;
  try {
    script = new vm.Script(wrapBotSource(source), { filename: `${id}.js` });
  } catch (e) {
    throw new Error(`bot "${id}" failed to compile: ${e.message}`);
  }
  const factory = (env) => {
    const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
    const fn = script.runInContext(context, { timeout: 1000 });
    return fn(env);
  };
  return { id, factory };
}

const cache = new Map();
export function loadBot(id) {
  const source = readBotSource(id);
  const hit = cache.get(id);
  if (hit && hit.source === source) return hit.bot;
  const bot = makeBot(id, source);
  cache.set(id, { source, bot });
  return bot;
}

/** Accepts a bot id, or a path to a .js file. */
export function resolveBot(spec) {
  if (spec.endsWith('.js') || spec.includes('/')) {
    const file = path.resolve(spec);
    return makeBot(path.basename(file, '.js'), fs.readFileSync(file, 'utf8'));
  }
  return loadBot(spec);
}
