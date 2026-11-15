// Builds the single-file web app.
//   dist/index.html     standalone: three.js inlined, opens from disk with no network
//   dist/artifact.html  same page, three.js loaded from cdnjs (for hosting where inline size matters)
// Also regenerates AGENTS.md from the engine tables.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const bundle = async (entry, extra = {}) => {
  const r = await build({ entryPoints: [path.join(here, 'src', entry)], bundle: true, format: 'iife', write: false, minify: true, target: 'es2020', legalComments: 'none', ...extra });
  return r.outputFiles[0].text;
};
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

const engine = safe(await bundle('engine-entry.js', { globalName: 'IY' }));
const app = safe(await bundle('app.js'));
const runner = fs.readFileSync(path.join(here, 'src/worker-runner.js'), 'utf8');
const bots = {};
for (const f of fs.readdirSync(path.join(root, 'bots')).sort()) if (f.endsWith('.js')) bots[f.slice(0, -3)] = fs.readFileSync(path.join(root, 'bots', f), 'utf8');
const three = fs.readFileSync(path.join(root, 'node_modules/three/build/three.min.js'), 'utf8');
const threeVersion = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/three/package.json'), 'utf8')).version;
if (!threeVersion.startsWith('0.128.')) throw new Error('the page is written against three r128 (matches the cdnjs UMD build)');

// the standings `ironyard ladder --write` last saved, shown on the page's League tab (none: the card stays hidden)
const ladderFile = path.join(here, 'ladder.json');
const ladderSnapshot = fs.existsSync(ladderFile) ? JSON.parse(fs.readFileSync(ladderFile, 'utf8')) : null;

const tpl = fs.readFileSync(path.join(here, 'index.template.html'), 'utf8');
const fill = (threeTag) => tpl
  .replace('<!--THREE-->', () => threeTag)
  .replace('/*ENGINE*/', () => engine)
  .replace('/*RUNNER*/', () => runner)
  .replace('/*BOTS*/{}', () => safe(JSON.stringify(bots)))
  .replace('/*LADDER*/null', () => safe(JSON.stringify(ladderSnapshot)))
  .replace('/*APP*/', () => app);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), fill(`<script>${safe(three)}</script>`));
fs.writeFileSync(path.join(root, 'dist/artifact.html'), fill('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>'));

const { rulesMarkdown } = await import('../engine/rulesdoc.js');
fs.writeFileSync(path.join(root, 'AGENTS.md'), rulesMarkdown());
const kb = (f) => (fs.statSync(path.join(root, f)).size / 1024).toFixed(0) + ' kB';
console.log(`engine ${(engine.length / 1024).toFixed(0)} kB, app ${(app.length / 1024).toFixed(0)} kB, ${Object.keys(bots).length} bots`);
console.log(`dist/index.html ${kb('dist/index.html')}, dist/artifact.html ${kb('dist/artifact.html')}, AGENTS.md ${kb('AGENTS.md')}`);
