// Node-side bot loading: reads controller files and gives every vehicle its own
// sealed realm — a fresh `vm` context that is handed text and numbers, never an
// engine object (see engine/realm.js for the protocol).
//
// What that buys: a controller cannot reach `process`, `require`, the file system
// or the network through anything the engine gives it, cannot rewrite what the
// engine or another controller sees, cannot tell the time, and cannot leave work
// running after its turn. What it does not buy: Node's `vm` is not a security
// boundary the way a separate process or a container is — a bug in V8 or in this
// file is all it takes — and a controller can still burn CPU and memory until the
// watchdog in runner.js ends the match. Run strangers' controllers in a container.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrapBotSource, WRAP_LINES } from '../engine/botwrap.js';
import { realmSource } from '../engine/realm.js';

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

// The language itself and nothing else. Whatever V8 or Node adds to a fresh context later
// (a clock, a locale service, threads, a way to watch the garbage collector) stays out
// until someone adds it here on purpose.
const KEEP = ['Object', 'Function', 'Array', 'Number', 'parseFloat', 'parseInt', 'Infinity', 'NaN', 'undefined', 'Boolean', 'String',
  'Symbol', 'Promise', 'RegExp', 'Error', 'AggregateError', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError',
  'URIError', 'globalThis', 'JSON', 'Math', 'ArrayBuffer', 'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array',
  'Int32Array', 'Float32Array', 'Float64Array', 'Uint8ClampedArray', 'BigUint64Array', 'BigInt64Array', 'DataView', 'Map', 'BigInt',
  'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'isFinite', 'isNaN', 'Iterator'];
const STRIP = new vm.Script(`(function () {
"use strict";
const keep = ${JSON.stringify(KEEP)};
for (const name of Object.getOwnPropertyNames(globalThis)) if (!keep.includes(name)) delete globalThis[name];
Math.random = function () { return 0.5; }; // a controller's Math is a copy with the seeded source; this one is never reached
})()`, { filename: 'ironyard-realm-setup.js' });
const REALM = new vm.Script(realmSource(), { filename: 'ironyard-realm.js' });

/**
 * Compile a controller source into a bot usable by runMatch: { id, file, open }.
 * `open(host, boot)` builds a new sealed realm and loads the controller in it; the engine
 * calls it once per vehicle, so no two vehicles share anything.
 */
export function makeBot(id, source) {
  const file = `${id}.js`;
  let script;
  try {
    script = new vm.Script(wrapBotSource(source), { filename: file });
  } catch (e) {
    // a SyntaxError's stack starts with "file.js:LINE"
    const at = e && typeof e.stack === 'string' && e.stack.startsWith(file + ':') ? parseInt(e.stack.slice(file.length + 1), 10) - WRAP_LINES : NaN;
    throw new Error(`bot "${id}" failed to compile: ${e.message}${at > 0 ? ` (line ${at})` : ''}`);
  }
  const open = (host, boot) => {
    // No strings-to-code, no WebAssembly, and a microtask queue of its own that nobody drains:
    // a promise a controller makes never settles, so nothing of its runs after its turn.
    const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false }, microtaskMode: 'afterEvaluate' });
    STRIP.runInContext(context);
    const realm = REALM.runInContext(context);
    const factory = script.runInContext(context, { timeout: 1000 });
    return realm(factory, host, boot);
  };
  return { id, file, open };
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
