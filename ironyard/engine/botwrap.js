// Turns a controller source file into a factory function body.
//
// A controller is ONE plain JavaScript file that defines, at top level:
//   design   object, or function (ctx, api) => blueprint            (required)
//   tick     function (state, api) => command                       (required)
//   init     function (info, api)                                   (optional)
//   meta     { name, author, model, notes }                         (optional)
// `export` keywords are accepted and ignored. No imports.

const SHADOWED = ['Date', 'performance', 'globalThis', 'self', 'window', 'document', 'process', 'require',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'postMessage', 'setTimeout', 'setInterval',
  'queueMicrotask', 'navigator', 'location', 'localStorage', 'indexedDB', 'Worker', 'crypto'];

export function preprocessBotSource(source) {
  if (typeof source !== 'string') throw new Error('controller source must be a string');
  if (source.length > 200_000) throw new Error('controller source is too large (limit 200 kB)');
  if (/^\s*import\s[^(]/m.test(source)) throw new Error('imports are not allowed: a controller is one self-contained file');
  // `import(...)` is the one piece of syntax that asks the host for something. With the static form
  // refused above, the word has no other use in a script, so it is refused wherever it stands.
  const hit = /\bimport\b/.exec(source);
  if (hit) throw new Error(`the word "import" cannot appear in a controller, not even in a comment (line ${source.slice(0, hit.index).split('\n').length}): there is nothing to import`);
  if (/^\s*export\s+default\b/m.test(source)) throw new Error('`export default` is not supported: define top-level `design` and `tick`');
  return source
    .replace(/^(\s*)export\s+(?=(?:const|let|var|function|async|class)\b)/gm, '$1')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '');
}

/** Lines wrapBotSource puts before the controller's first line (for turning a stack line back into a source line). */
export const WRAP_LINES = 5;

/** Returns the text of a function expression: (function (__env) { ... return {meta, design, init, tick}; }) */
export function wrapBotSource(source) {
  const code = preprocessBotSource(source);
  return `(function (__env) {
"use strict";
const Math = __env.Math, console = __env.console;
const ${SHADOWED.map((n) => `${n} = undefined`).join(', ')};
return (function () {
${code}
;return {
  meta: typeof meta !== 'undefined' ? meta : undefined,
  design: typeof design !== 'undefined' ? design : undefined,
  init: typeof init === 'function' ? init : undefined,
  tick: typeof tick === 'function' ? tick : undefined,
};
})();
})`;
}

/** Compile with the Function constructor (Node tests / environments where eval is allowed). */
export function compileBotSource(source) {
  // eslint-disable-next-line no-new-func
  return new Function(`return ${wrapBotSource(source)};`)();
}
