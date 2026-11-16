// Ironyard web app: arena playback, garage, bot lab, league, rules, MCP guide.
/* global IY, THREE */
import { prepReplay, viewAt } from './replay.js';
import { SimHost } from './host.js';
import { Render3D, Preview3D } from './render3d.js';
import { Kit } from './kit.js';
import { Render2D } from './render2d.js';
import { mdToHtml, esc } from './md.js';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid);
  return n;
};
const TEAM_NAME = ['Orange', 'Blue'];
const TEAM_COL = ['var(--hazard)', 'var(--coolant)'];
const ABBR = { core: 'Co', plate: 'P1', plate2: 'P2', plate4: 'P4', brick: 'B1', brick2: 'B2', armor: 'A1', armor2: 'A2', slope: 'Sl', plow: 'Pw',
  wheel: 'Wh', bigwheel: 'MW', track: 'Tr', hover: 'Hv', thruster: 'Th', gyro: 'Gy', blower: 'Su', spoiler: 'Sp',
  mg: 'MG', cannon: 'Cn', railgun: 'RG', laser: 'Lz', missile: 'Ms', mortar: 'Mo', saw: 'Sw', spike: 'Sk', flamer: 'Fl', harpoon: 'Hp', piston: 'Pi', keg: 'Kg',
  battery: 'Bt', reactor: 'Rx', radar: 'Rd', shieldgen: 'Sh', repairer: 'Rp', tile: 'Ti', fin: 'Fn', pipe: 'Ex', lamp: 'Lt', flag: 'Fg' };
const CAT_NAME = { structure: 'Structure / defence', mobility: 'Mobility / steering', weapon: 'Weapons', utility: 'Utility', decor: 'Decor (free)' };
const ARROW = { N: '↑', E: '→', S: '↓', W: '←' };
const REASON_TEXT = { elimination: 'enemy wiped out', 'mutual destruction': 'mutual destruction', 'time: more vehicles alive': 'time up, more vehicles alive', 'time: more hull remaining': 'time up, more hull left',
  'time: more damage dealt': 'time up, more damage dealt', 'time: exact tie': 'time up, exact tie', 'stopped early': 'stopped early' };
const AI_TEMPLATES = {
  rookie: 'Mid-range gunner: closes to about 8 m and trades fire, backs off when crowded. Suits forward-facing guns.',
  thumper: 'Artillery: lobs mortar shells over walls at where the enemy will be, keeps a machine gun for self-defence, holds 13 to 19 m. Suits mortars.',
  bastion: 'Heavy tank push: inside 19 m it keeps its nose on the enemy and grinds forward, and heads for a repair pad when badly hurt. Suits forward cannons + thick armor.',
  longshot: 'Sniper kite: holds 13 to 19 m, aims for the core, reverses when the enemy closes in. Suits railguns and cannons.',
  bulldozer: 'Rammer: lines up on the enemy, fires its thrusters and crashes in, then saws at point-blank. Suits ram spikes, plows and buzz saws.',
  hornet: 'Port-side circler: keeps the enemy on its left and orbits counter-clockwise at 7 m. Mount the weapons facing left (←).',
  wasp: 'Hover kite: stays 15 to 22 m out, nose to the enemy, backing away while it launches missiles. Suits hover pads + missiles.',
  medic: 'Support: follows the most damaged teammate and repairs it, shooting when it can. Suits repair arms + a shield.',
  pyro: 'Arsonist: rushes inside 4 m and circles while spraying; once the target is burning it moves on to the next, and if it catches fire itself it heads for a repair pad. Suits flamethrowers.',
  sapper: 'Bomber: from 7 to 10 m it points its nose at where the enemy is heading and flings its forward-facing kegs; if the enemy closes in it throws while backing away. Suits powder kegs on the nose, facing forward.',
  angler: 'Hook and saw: fires the harpoon inside 11 m, reels the cable all the way in and holds the target against its saws; with lava behind it, it drags the target backwards. Suits a harpoon + buzz saws.',
  boxer: 'Boxer: circles until the enemy has a pit, lava or powder barrels at its back, then punches it in. Suits piston rams.',
};
const STORE_KEY = 'ironyard.v2';

// ── state ───────────────────────────────────────────────────────────────
const S = {
  tab: 'arena',
  custom: {},     // id -> source
  setup: { mode: '2v2', map: 'foundry', seed: 1, swap: false, budget: 1200, teams: [['bastion', 'hornet'], ['thumper', 'bulldozer']] },
  replay: null, time: 0, playing: true, speed: 1, view: '3d', follow: -1,
  garage: { parts: [], tool: 'plate', dir: 'N', erase: false, layer: 1, accent: 'white' },
  league: { bots: null, mode: '1v1', maps: null, seeds: 1, running: false },
};
const builtin = window.__BOT_SOURCES;
const allSources = () => ({ ...S.custom, ...builtin });
const botIds = () => [...Object.keys(builtin), ...Object.keys(S.custom).filter((id) => !builtin[id])];
const botLabel = (id) => {
  const src = allSources()[id] || '';
  const m = /name:\s*(['"`])((?:(?!\1).)*)\1/.exec(src);
  return (m ? m[2] : id) + (builtin[id] ? '' : ' ★');
};
const host = new SimHost(IY, $('engine-src').textContent, $('runner-src').textContent);
const leagueHost = new SimHost(IY, $('engine-src').textContent, $('runner-src').textContent);
const kit = typeof THREE !== 'undefined' ? new Kit(IY) : null;

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ custom: S.custom, setup: S.setup })); } catch { /* storage may be unavailable */ }
}
function restore(data) {
  let saved = data && data.custom ? data : null;
  if (!saved) { try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { saved = null; } }
  if (!saved) return;
  if (saved.custom && typeof saved.custom === 'object') for (const [id, src] of Object.entries(saved.custom)) if (typeof src === 'string' && IY_NAME.test(id)) S.custom[id] = src;
  if (saved.setup && IY.MAPS[saved.setup.map] && IY.MODES[saved.setup.mode] && Array.isArray(saved.setup.teams)) {
    const ok = saved.setup.teams.every((t) => Array.isArray(t) && t.every((id) => allSources()[id]));
    if (ok) Object.assign(S.setup, saved.setup);
  }
}
const IY_NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/;

let toastTimer = 0;
function toast(text) { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600); }
function msg(node, kind, text) { node.replaceChildren(text ? el('div', { class: 'msg ' + kind, text }) : ''); }
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed: long-press the text and copy it by hand'); } }

// ── tabs ────────────────────────────────────────────────────────────────
const TABS = ['arena', 'garage', 'lab', 'league', 'rules', 'mcp'];
function showTab(name, push = true) {
  if (!TABS.includes(name)) name = 'arena';
  S.tab = name;
  for (const t of TABS) $('tab-' + t).hidden = t !== name;
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  if (push && location.hash !== '#' + name) { try { history.replaceState(null, '', '#' + name); } catch { location.hash = name; } }
  if (name === 'arena' && renderer) renderer.resize();
  if (name === 'garage' || name === 'rules') ensurePreview(); // the rules table borrows the garage's rendered thumbnails
  if (name === 'garage' && preview) { preview.resize(); renderBlueprint(); }
  if (name === 'lab') refreshLabList();
  if (name === 'league') { renderLadder(); renderLeagueSetup(); }
}

// ── arena: setup form ───────────────────────────────────────────────────
function seg(node, options, get, set) {
  node.replaceChildren(...options.map(([val, label]) => el('button', { type: 'button', 'aria-pressed': String(get() === val), text: label,
    onclick: () => { set(val); seg(node, options, get, set); } })));
}
function botSelect(value, onchange) {
  const s = el('select', { 'aria-label': 'Choose a bot', onchange: (e) => onchange(e.target.value) });
  for (const id of botIds()) s.append(el('option', { value: id, text: `${botLabel(id)}  ·  ${id}`, selected: id === value }));
  return s;
}
function renderSetup() {
  const st = S.setup, size = IY.MODES[st.mode];
  seg($('mode-seg'), Object.keys(IY.MODES).map((m) => [m, m]), () => st.mode, (m) => { st.mode = m; renderSetup(); });
  const mapSel = $('map');
  mapSel.replaceChildren(...IY.MAP_IDS.map((id) => el('option', { value: id, text: IY.MAPS[id].name, selected: id === st.map })));
  const m = IY.MAPS[st.map];
  $('minimap').textContent = m.rows.join('\n');
  $('map-desc').textContent = `${m.width}×${m.height} m. ` + (MAP_DESC[st.map] || m.desc);
  $('seed').value = st.seed; $('swap').checked = st.swap; $('budget').value = String(st.budget);
  st.teams = st.teams.map((t) => { const out = t.slice(0, size); while (out.length < size) out.push(out[out.length - 1] || 'rookie'); return out; });
  [0, 1].forEach((t) => {
    $('slots' + t).replaceChildren(...st.teams[t].map((id, k) => botSelect(id, (v) => { st.teams[t][k] = v; persist(); })));
  });
}
const MAP_DESC = { // the page's own blurbs, with the setting; a map without one shows the engine's description
  proving: 'Concrete proving ground: a walled open arena with a few pillars and a mud patch in the middle. The fairest default.',
  sumo: 'A steel deck out at sea with no walls, an ice ring and a hole in the middle. Push them into the sea, or just hover.',
  canyon: 'Desert canyon: rock walls split it into three lanes. Long sightlines down the middle, a mud choke in the centre, rock pillars to hide behind on the flanks.',
  frostbite: 'Snowfield: a frozen lake fills the middle, with a dry island at its heart and pits in the four corners. Wheels slide; tracks and hover have the edge.',
  skybridge: 'Concrete platforms above the clouds, joined by bridges. Fall off and you are gone; hover craft can take the shortcut.',
  foundry: 'A foundry at night: pools of molten metal with narrow crossings between them, repair pads in the back corners.',
  bog: 'Big team map in a swamp: mud and standing water, sandbag cover you can shoot over, pits on the flanks, repair pads in the centre.',
};

// ── arena: running + playback ───────────────────────────────────────────
let renderer = null, rp = null, lastTs = 0, rosterNodes = [], labelNodes = [];

function makeRenderer() {
  if (renderer) renderer.dispose();
  const vp = $('viewport');
  if (S.view === '3d' && typeof THREE !== 'undefined') {
    try { renderer = new Render3D(vp, IY, kit); } catch (e) { S.view = '2d'; renderer = new Render2D(vp, IY); toast('WebGL is not available on this device; switched to the 2D view'); }
  } else { if (S.view === '3d') toast('The 3D library did not load; switched to the 2D view'); S.view = '2d'; renderer = new Render2D(vp, IY); }
  vp.prepend(renderer.canvas);
  $('view3d').setAttribute('aria-pressed', String(S.view === '3d'));
  $('view2d').setAttribute('aria-pressed', String(S.view === '2d'));
  renderer.follow = S.follow;
  renderer.onMode = (m) => { $('camera').value = m; };
  if (rp) renderer.load(rp);
  if ($('camera').value && $('camera').value[0] !== 'f') renderer.setPreset($('camera').value);
}

let matchRequest = 0;
async function runMatch(extra = {}, sources = allSources()) {
  const request = ++matchRequest;
  const st = S.setup;
  st.seed = Math.max(0, Math.floor(Number($('seed').value) || 0)); st.swap = $('swap').checked; st.budget = Number($('budget').value); st.map = $('map').value;
  persist();
  $('busy').hidden = false; $('banner').hidden = true; msg($('setup-msg'), '', '');
  $('run').disabled = true;
  try {
    host.setBots(sources);
    const res = await host.match({ map: st.map, mode: st.mode, seed: st.seed, swap: st.swap, budget: st.budget, teams: st.teams, ...extra });
    if (request === matchRequest) loadReplay(res);
  } catch (e) {
    if (request === matchRequest) msg($('setup-msg'), 'bad', 'Could not start the match: ' + e.message);
  } finally { if (request === matchRequest) { $('busy').hidden = true; $('run').disabled = false; } }
}

function loadReplay(res) {
  rp = prepReplay(res, IY);
  S.replay = res; S.time = 0; S.playing = true; S.follow = -1;
  if (!renderer) makeRenderer(); else { renderer.follow = -1; renderer.load(rp); renderer.setPreset('auto'); }
  $('scrub').max = String(Math.round(rp.duration * 30));
  $('banner').hidden = true;
  $('report-details').open = false;
  buildRoster(); buildLabels(); buildCamera(); renderReport();
  $('play').textContent = '❚❚';
}

function buildRoster() {
  rosterNodes = [];
  const cards = [0, 1].map((t) => {
    const rows = rp.vehicles.filter((v) => v.team === t).map((v) => {
      const hp = el('i'), en = el('i'), item = el('span', { class: 'num', style: 'text-align:center' });
      const row = el('button', { class: 'veh', type: 'button', 'aria-pressed': 'false', title: 'Follow this vehicle with the camera', onclick: () => setFollow(S.follow === v.id ? -1 : v.id) },
        el('span', { class: 'nm' }, v.name, el('small', { text: `${v.bot} · ${v.designStats.cost}cr, ${v.designStats.mass}kg ${v.designStats.weightClass || ''}` })),
        el('span', { class: 'bars' }, el('span', {}, hp), el('span', { class: 'e' }, en)), item);
      rosterNodes[v.id] = { row, hp, en, item };
      return row;
    });
    return el('div', { class: `sheet team-card t${t}` }, el('header', {}, el('h2', { class: 't' + t, text: TEAM_NAME[t] + ' team' }), el('span', { class: 'code', text: rp.res.teams[t].bots.join(' + ') })), ...rows);
  });
  $('roster').replaceChildren(...cards);
}
function buildLabels() {
  labelNodes = rp.vehicles.map((v) => {
    const hp = el('i', { style: `background:${TEAM_COL[v.team]}` }), en = el('i');
    const node = el('div', { class: 'vlabel' }, v.name, el('div', { class: 'bar' }, hp), el('div', { class: 'bar e' }, en));
    return { node, hp, en };
  });
  $('labels').replaceChildren(...labelNodes.map((l) => l.node));
}
function buildCamera() {
  const sel = $('camera');
  sel.replaceChildren(el('option', { value: 'auto', text: 'Camera: auto' }), el('option', { value: 'iso', text: 'Camera: overview' }), el('option', { value: 'top', text: 'Camera: top-down' }), el('option', { value: 'free', text: 'Camera: free' }),
    ...rp.vehicles.map((v) => el('option', { value: 'f' + v.id, text: `Follow ${v.name} (${TEAM_NAME[v.team].toLowerCase()})` })));
}
function setFollow(id) {
  S.follow = id; if (renderer) renderer.follow = id;
  rosterNodes.forEach((n, i) => n && n.row.setAttribute('aria-pressed', String(i === id)));
  $('camera').value = id >= 0 ? 'f' + id : 'auto';
  if (renderer) { if (id >= 0) { if (renderer.cam) renderer.cam.dist = Math.min(renderer.cam.dist, 30); } else renderer.setPreset('auto'); }
}

const count = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const fmtClock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0); lastTs = ts;
  if (S.tab === 'garage' && preview) { preview.render(ts / 1000); return; }
  if (!rp || !renderer || S.tab !== 'arena') return;
  if (S.playing) {
    S.time += dt * S.speed;
    if (S.time >= rp.duration) { S.time = rp.duration; S.playing = false; $('play').textContent = '▶'; showBanner(); }
  }
  const view = viewAt(rp, S.time);
  renderer.draw(view);
  // HUD
  $('clock').textContent = fmtClock(view.t);
  $('clock-sub').textContent = `/ ${fmtClock(IY.RULES.duration)} · ${IY.MAPS[rp.res.map].name} · ${rp.res.mode}`;
  $('zone-tag').textContent = view.zoneR < rp.zone.radius0 - 0.5 ? `Zone shrinking · radius ${view.zoneR.toFixed(0)} m` : '';
  const alive = [0, 0];
  view.vehicles.forEach((v, id) => {
    if (v.alive) alive[v.team]++;
    const L = labelNodes[id], R = rosterNodes[id];
    const p = renderer.project(v.x, v.y, 2.2);
    if (v.alive && p.ok) { L.node.style.display = ''; L.node.style.left = p.x + 'px'; L.node.style.top = (p.y - (S.view === '2d' ? 16 : 0)) + 'px'; L.hp.style.width = v.hp * 100 + '%'; L.en.style.width = v.energy * 100 + '%'; }
    else L.node.style.display = 'none';
    R.hp.style.width = (v.alive ? v.hp * 100 : 0) + '%'; R.en.style.width = (v.alive ? v.energy * 100 : 0) + '%';
    R.hp.style.background = v.hp > 0.5 ? 'var(--ok)' : v.hp > 0.25 ? 'var(--warn)' : 'var(--bad)';
    R.row.classList.toggle('dead', !v.alive);
    R.item.textContent = !v.alive ? '✕' : v.item ? IY.ITEMS[v.item].icon : (v.flags & 16 ? '💥' : v.flags & 32 ? '⚡' : v.flags & 4 ? '🌀' : '');
  });
  $('score0').textContent = alive[0]; $('score1').textContent = alive[1];
  const feed = $('feed');
  const key = view.feed.map((f) => f.t).join(',');
  if (feed.dataset.k !== key) { feed.dataset.k = key; feed.replaceChildren(...view.feed.map((f) => el('div', { style: `border-color:${TEAM_COL[f.team]}`, text: f.text }))); }
  if (document.activeElement !== $('scrub')) $('scrub').value = String(Math.round(S.time * 30));
  $('time').textContent = `${S.time.toFixed(1)} / ${rp.duration.toFixed(1)}s`;
}

function showBanner() {
  const r = rp.res, b = $('banner');
  const title = r.winner === null ? 'Replay over' : r.winner < 0 ? 'Draw' : `${TEAM_NAME[r.winner]} wins`;
  b.replaceChildren(el('b', { class: r.winner >= 0 ? 't' + r.winner : '', text: title }), el('span', { text: `${REASON_TEXT[r.reason] || r.reason} · ${r.duration}s` }),
    el('div', { class: 'row', style: 'justify-content:center' },
      el('button', { class: 'btn', type: 'button', text: 'Replay', onclick: () => { S.time = 0; S.playing = true; b.hidden = true; $('play').textContent = '❚❚'; } }),
      el('button', { class: 'btn primary', type: 'button', text: 'Next seed', onclick: () => { $('seed').value = String(S.setup.seed + 1); runMatch(); } })));
  b.hidden = false;
  $('report-details').open = true;
}

function renderReport() {
  const r = rp.res;
  const head = el('tr', {}, ...['Vehicle', 'Outcome', 'Hull', 'Dealt', 'Taken', 'Kills', 'Accuracy', 'Distance', 'Out of arc', 'No energy', 'Deflected', 'First parts lost'].map((h, i) => el('th', { class: i >= 2 && i <= 10 ? 'n' : '', text: h })));
  const lost = {};
  for (const e of r.events) if (e.k === 'part') { const d = IY.PARTS[r.vehicles[e.v].design.parts[e.i].type]; if (!d.decor) (lost[e.v] ||= []).push(d.name); }
  const rows = r.vehicles.map((v) => {
    const s = v.stats;
    return el('tr', {},
      el('td', {}, el('b', { class: 't' + v.team, text: v.name }), el('div', { class: 'note', text: v.bot })),
      el('td', { text: v.alive ? 'Alive' : `${v.deathT}s ${({ fell: 'fell', burn: 'burned', ram: 'rammed', melee: 'sawn up', kinetic: 'shot', explosive: 'blown up', energy: 'melted', fire: 'burned', wrecked: 'wrecked', torn: 'torn apart' })[v.deathCause] || v.deathCause}` }),
      el('td', { class: 'n', text: Math.round(v.hpFrac * 100) + '%' }), el('td', { class: 'n', text: Math.round(s.damageDealt) }), el('td', { class: 'n', text: Math.round(s.damageTaken) }),
      el('td', { class: 'n', text: s.kills }), el('td', { class: 'n', text: s.accuracy == null ? '–' : Math.round(s.accuracy * 100) + '%' }), el('td', { class: 'n', text: Math.round(s.distance) + ' m' }),
      el('td', { class: 'n', text: s.timeFireOutOfArc + 's' }), el('td', { class: 'n', text: s.timeEnergyStarved + 's' }), el('td', { class: 'n', text: Math.round(s.deflected || 0) }),
      el('td', { text: (lost[v.id] || []).slice(0, 5).join(', ') || '–' }));
  });
  const errs = r.vehicles.filter((v) => v.errors.length).map((v) => el('div', { class: 'msg bad', text: `${v.name}: ${v.errors.join('\n')}` }));
  const logs = r.vehicles.filter((v) => v.logs.length).map((v) => el('div', { class: 'msg', text: `${v.name} api.log:\n${v.logs.slice(0, 12).join('\n')}` }));
  $('report').replaceChildren(el('p', { class: 'note', text: `${r.mode} · ${IY.MAPS[r.map].name} · seed ${r.seed}${r.swap ? ' · spawns swapped' : ''} · ${r.winner === null ? '' : r.winner < 0 ? 'Draw' : TEAM_NAME[r.winner] + ' wins'} (${REASON_TEXT[r.reason] || r.reason}, ${r.duration}s)` }),
    el('table', {}, el('thead', {}, head), el('tbody', {}, ...rows)), ...errs, ...logs);
}

function bindArena() {
  $('setup').addEventListener('submit', (e) => { e.preventDefault(); runMatch(); });
  $('reseed').addEventListener('click', () => { $('seed').value = String((Number($('seed').value) || 0) + 1); runMatch(); });
  $('map').addEventListener('change', () => { S.setup.map = $('map').value; renderSetup(); persist(); });
  $('play').addEventListener('click', () => {
    if (!rp) return;
    if (!S.playing && S.time >= rp.duration) S.time = 0;
    S.playing = !S.playing; $('play').textContent = S.playing ? '❚❚' : '▶'; $('banner').hidden = true;
  });
  $('speed').addEventListener('change', (e) => { S.speed = Number(e.target.value); });
  $('scrub').addEventListener('input', (e) => {
    if (!rp) return;
    const atEnd = Number(e.target.value) >= Number(e.target.max);
    S.time = atEnd ? rp.duration : Math.max(0, Math.min(rp.duration, Number(e.target.value) / 30));
    if (atEnd) { S.playing = false; $('play').textContent = '▶'; showBanner(); }
    else $('banner').hidden = true;
  });
  $('view3d').addEventListener('click', () => { S.view = '3d'; makeRenderer(); });
  $('view2d').addEventListener('click', () => { S.view = '2d'; makeRenderer(); });
  $('camera').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v[0] === 'f') setFollow(Number(v.slice(1))); else { setFollow(-1); $('camera').value = v; renderer && renderer.setPreset(v); }
  });
  $('replay-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const res = JSON.parse(await f.text());
      if (!res.frames || !res.vehicles || !IY.MAPS[res.map]) throw new Error('not an Ironyard replay file');
      loadReplay(res); msg($('setup-msg'), 'ok', `Replay loaded: ${f.name}`);
    } catch (err) { msg($('setup-msg'), 'bad', 'Could not read this file: ' + err.message); }
    e.target.value = '';
  });
  if (window.ResizeObserver) new ResizeObserver(() => renderer && renderer.resize()).observe($('viewport'));
  else window.addEventListener('resize', () => renderer && renderer.resize());
}

// Part, pickup and tile descriptions come from the engine; it marks identifiers with backticks, which plain text does not need.
const plain = (text) => text.replace(/`/g, '');

// ── garage ──────────────────────────────────────────────────────────────
const G = S.garage;
let preview = null, thumbs = {};
const WCLASS_NAME = { featherweight: 'Featherweight', light: 'Light', medium: 'Medium', heavy: 'Heavy', 'super-heavy': 'Super-heavy' };
function designOf(parts) {
  return { name: $('g-name').value.trim() || 'Custom Car', paint: { accent: G.accent },
    parts: parts.map((p) => ({ type: p.type, x: p.x, y: p.y, z: p.z, ...(p.dir && p.dir !== 'N' ? { dir: p.dir } : IY.PARTS[p.type].directional ? { dir: 'N' } : {}) })) };
}
const sizeLabel = (p) => (p.size[0] * p.size[1] > 1 ? `${p.size[0]}×${p.size[1]}` : '');

function ensurePreview() {
  if (preview) return;
  if (typeof THREE === 'undefined') { $('g-preview').hidden = true; return; } // no WebGL library: the stud grid alone still works
  try {
    preview = new Preview3D($('g-preview'), IY, kit);
    $('g-preview').prepend(preview.canvas);
    thumbs = preview.thumbnails(Object.keys(IY.PARTS));
    renderPalette(); renderRules();
  } catch (e) { preview = null; $('g-preview').hidden = true; }
}

function renderPalette() {
  const wrap = $('palette'); wrap.replaceChildren();
  for (const [cat, title] of Object.entries(CAT_NAME)) {
    wrap.append(el('div', { class: 'cat-h', text: title }));
    const grid = el('div', { class: 'palette' });
    for (const p of Object.values(IY.PARTS).filter((x) => x.cat === cat)) {
      const pic = thumbs[p.id] ? el('span', { class: 'g' }, el('img', { src: thumbs[p.id], alt: '' })) : el('span', { class: 'g cell on', 'data-cat': p.cat, 'data-type': p.id, text: ABBR[p.id] });
      grid.append(el('button', { class: 'pbtn', type: 'button', 'aria-pressed': String(!G.erase && G.tool === p.id), onclick: () => { G.tool = p.id; G.erase = false; pickLayerFor(p); renderPalette(); showPartInfo(p.id); renderBlueprint(); } },
        pic, el('b', { text: p.name }), el('small', { text: p.decor ? 'free decor' : `${p.cost}cr · ${p.mass}kg` })));
    }
    wrap.append(grid);
  }
  $('erase').setAttribute('aria-pressed', String(G.erase));
  seg($('dir-seg'), Object.entries(ARROW).map(([d, a]) => [d, a]), () => G.dir, (d) => { G.dir = d; });
  $('g-paint').replaceChildren(...IY.PAINT_IDS.map((id) => el('button', { class: 'swatch', type: 'button', style: `background:${IY.PAINTS[id]}`, title: id, 'aria-label': 'Accent colour ' + id, 'aria-pressed': String(G.accent === id),
    onclick: () => { G.accent = id; renderPalette(); renderBlueprint(); } })));
}
function pickLayerFor(def) { if (def.layer === 'chassis') G.layer = 0; else if (def.layer === 'deck') G.layer = 1; }
function showPartInfo(id) {
  const p = IY.PARTS[id];
  const bits = [`${p.name} (${p.id})`, p.decor ? 'free' : `${p.cost} cr`, `${p.mass} kg`, `${p.hp} hp`, `${p.size[0]}×${p.size[1]} studs`, p.layer === 'any' ? 'either layer' : p.layer === 'deck' ? 'deck only' : 'chassis only'];
  if (p.dps) bits.push(`${p.dps} dps`); else if (p.dmg) bits.push(`${p.dmg}${p.salvo ? '×' + p.salvo : ''} dmg / ${p.cooldown}s`);
  if (p.range) bits.push(`range ${p.minRange ? p.minRange + '–' : ''}${p.range} m`);
  if (p.arc) bits.push(p.arc >= 3 ? '360° arc' : `arc ±${Math.round((p.arc * 180) / Math.PI)}°`);
  if (p.force) bits.push(`drive ${p.force} N`);
  if (p.max) bits.push(`max ${p.max}`);
  $('part-info').textContent = bits.join(' · ') + '. ' + plain(p.desc) + (p.lane === 'front' ? ' The way it faces must be clear to the edge on its own layer (low pieces on the deck do not block).' : ''); // a back lane (thruster exhaust) is spelled out in the engine's description
}

function renderBlueprint() {
  const val = IY.validateDesign(designOf(G.parts), { budget: S.setup.budget });
  seg($('layer-seg'), [[1, 'DECK'], [0, 'CHASSIS']], () => G.layer, (z) => { G.layer = z; renderBlueprint(); });
  const occ = [new Map(), new Map()];
  for (const p of G.parts) for (const [x, y] of IY.cellsOf(p)) occ[p.z].set(x + ',' + y, p);
  const bad = new Set();
  for (const e of val.errors) { const m = /at \((-?\d), (-?\d)\) on (deck|chassis)/.exec(e); if (m && (m[3] === 'deck') === (G.layer === 1)) bad.add(m[1] + ',' + m[2]); }
  const cells = [];
  for (let y = IY.GRID_HY; y >= -IY.GRID_HY; y--) for (let x = -IY.GRID_HX; x <= IY.GRID_HX; x++) {
    const p = occ[G.layer].get(x + ',' + y), d = p && IY.PARTS[p.type];
    const anchor = p && p.x === x && p.y === y;
    const other = occ[1 - G.layer].has(x + ',' + y);
    const [w, l] = d ? d.size : [1, 1];
    cells.push(el('button', { class: 'cell' + (p ? ' on' : '') + (p && !anchor ? ' cont' : '') + (!p && other ? ' under' : '') + (p && bad.has(p.x + ',' + p.y) ? ' err' : ''), type: 'button',
      'data-cat': d ? d.cat : null, 'data-type': p ? p.type : null, 'aria-label': `Stud ${x},${y}${p ? ' ' + d.name : ' empty'}`, onclick: () => tapCell(x, y) },
      anchor ? ABBR[p.type] : '', anchor && (d.directional || (w !== l && p.dir !== 'N')) ? el('span', { class: 'arr', text: ARROW[p.dir] }) : null));
  }
  $('bp').replaceChildren(...cells);
  $('g-hint').textContent = G.layer === 1 ? 'Deck: cockpit, turrets, armor. Light-blue ring = chassis underneath, so you can stack on it. A multi-stud piece puts its bottom-left corner on the stud you tap.' : 'Chassis: wheels, tracks, plates, ram spikes. Light-blue ring = a deck piece sits on top.';
  const s = val.stats;
  $('g-cost').textContent = s ? s.cost : 0; $('g-mass').textContent = s ? s.mass : 0; $('g-speed').textContent = s ? s.topSpeed.toFixed(1) : '0'; $('g-dps').textContent = s ? Math.round(s.dps) : 0;
  $('g-class').textContent = s ? WCLASS_NAME[s.weightClass] : '';
  const cost = s ? s.cost : 0, budget = S.setup.budget;
  $('g-budget-bar').style.width = Math.min(100, (cost / budget) * 100) + '%';
  $('g-budget-bar').style.background = cost > budget ? 'var(--bad)' : 'var(--hazard)';
  $('g-budget-text').textContent = `Budget ${cost} / ${budget}, ${cost > budget ? (cost - budget) + ' over' : (budget - cost) + ' left'}. Change the budget in the match setup.`;
  const kv = (k, v) => el('div', {}, el('small', { text: k }), el('b', { text: v }));
  $('g-stats').replaceChildren(...(s ? [
    kv('Class', WCLASS_NAME[s.weightClass]), kv('Parts / decor', `${s.parts - s.decor} / ${s.decor}`), kv('Studs chassis / deck', `${s.studs.chassis} / ${s.studs.deck}`), kv('Total HP', s.hp),
    kv('Acceleration', s.accel + ' m/s²'), kv('Turn rate', s.turnRate + ' rad/s'), kv('Side grip', '×' + s.sideGrip), kv('Max range', s.maxRange + ' m'),
    kv('Energy cap', s.energyCap), kv('Regen / peak drain', `${s.energyRegen} / ${s.energyDrain}`), kv('Sensor range', s.sensor + ' m'), kv('Shield', s.shield || 'none'),
    kv('Hover', s.hoverMovers ? (s.hovers ? `yes (lift ${s.lift})` : `no (lift ${s.lift})`) : 'none'), kv('Boosted top speed', s.boostSpeed ? s.boostSpeed + ' m/s' : '–'), kv('Hull radius', s.radius + ' m'),
  ] : []));
  $('g-msgs').replaceChildren(...val.errors.map((e) => el('div', { class: 'msg bad', text: e })), ...val.warnings.map((e) => el('div', { class: 'msg warn', text: e })),
    ...(val.ok && !val.warnings.length ? [el('div', { class: 'msg ok', text: 'Blueprint is valid.' })] : []));
  if (preview) preview.setDesign(designOf(G.parts), 0);
  return val;
}
function tapCell(x, y) {
  const at = (z) => G.parts.findIndex((p) => p.z === z && IY.cellsOf(p).some(([cx, cy]) => cx === x && cy === y));
  const i = at(G.layer), cur = i >= 0 ? G.parts[i] : null;
  if (G.erase) { if (cur) G.parts.splice(i, 1); }
  else if (cur && cur.type === G.tool) {
    const d = IY.PARTS[cur.type], [w, l] = d.size;
    if (d.directional && !d.fixedDir) cur.dir = 'NESW'[('NESW'.indexOf(cur.dir) + 1) % 4];
    else if (w !== l && !d.fixedDir) cur.dir = cur.dir === 'N' ? 'E' : 'N';
    else G.parts.splice(i, 1);
  } else {
    const def = IY.PARTS[G.tool];
    const z = def.layer === 'chassis' ? 0 : def.layer === 'deck' ? 1 : G.layer;
    if (z !== G.layer) { G.layer = z; toast(`${def.name} only fits on the ${z ? 'deck' : 'chassis'}; switched layer`); }
    const dir = def.fixedDir ? 'N' : def.directional || def.size[0] !== def.size[1] ? G.dir : 'N';
    const np = { type: G.tool, x, y, z, dir };
    const cells = IY.cellsOf(np);
    if (!cells.every(([cx, cy]) => IY.inGrid(cx, cy))) { toast('No room: this piece would stick out of the grid (the stud you tap is its bottom-left corner)'); return; }
    if (G.tool === 'core') G.parts = G.parts.filter((p) => p.type !== 'core');
    G.parts = G.parts.filter((p) => p.z !== z || !IY.cellsOf(p).some(([px, py]) => cells.some(([cx, cy]) => cx === px && cy === py)));
    G.parts.push(np);
  }
  renderBlueprint();
}
function mirrorGarage() {
  // left-only pieces are kept and copied across; pieces touching the centre column stay as they are; right-only pieces are replaced
  const out = [];
  for (const p of G.parts) {
    const [w] = IY.dimsOf(p.type, p.dir), right = p.x + w - 1;
    if (p.x > 0) continue;
    out.push(p);
    if (right < 0 && p.type !== 'core') out.push({ ...p, x: -right, dir: p.dir === 'E' ? 'W' : p.dir === 'W' ? 'E' : p.dir });
  }
  G.parts = out; renderBlueprint(); toast('Mirrored the left half onto the right');
}

async function loadDesignFrom(botId) {
  host.setBots(allSources());
  try {
    const d = await host.describe(botId, 5000);
    const v = d[S.setup.mode][0] || d['1v1'][0];
    G.parts = v.design.parts.map((p) => ({ ...p }));
    G.accent = v.design.paint.accent;
    $('g-name').value = v.design.name;
    renderPalette(); renderBlueprint();
  } catch (e) { toast('Load failed: ' + e.message); }
}

function slugify(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return 'my-' + (base || 'car-' + Object.keys(S.custom).length);
}
function garageSource() {
  const ai = $('g-ai').value, name = $('g-name').value.trim() || 'Custom Car';
  const design = designOf(G.parts);
  let src = builtin[ai];
  const json = JSON.stringify(design, null, 1).replace(/\{\n\s+"type"/g, '{ "type"').replace(/,\n\s+"(x|y|z|dir)"/g, ', "$1"').replace(/\n\s+\}/g, ' }').replace(/"paint": \{\s+"accent": ("[a-z]+")\s+\}/, '"paint": { "accent": $1 }');
  src = src.replace(/const design = \(ctx, api\) => api\.util\.blueprint\([\s\S]*?\n\}, \{ paint: [^\n]*\);/, () => 'const design = ' + json + ';');
  src = src.replace(/const meta = \{[^\n]*\};/, () => `const meta = { name: ${JSON.stringify(name)}, author: 'garage', notes: ${JSON.stringify('garage build + ' + ai + ' strategy template')} };`);
  return `// Made in the garage: the blueprint is the one you built, the strategy comes from the built-in ${ai} template. Change tick below as you like.\n` + src.replace(/^\/\/[^\n]*\n(\/\/[^\n]*\n)*/, '');
}
async function saveGarage(then) {
  const val = renderBlueprint();
  if (!val.ok) { msg($('g-save-msg'), 'bad', 'The blueprint is not valid yet: fix the problems marked in red above first.'); return; }
  const id = slugify($('g-name').value.trim());
  const src = garageSource();
  const chk = await host.checkSyntax(src);
  if (!chk.ok) { msg($('g-save-msg'), 'bad', chk.error); return; }
  S.custom[id] = src; persist(); renderSetup();
  msg($('g-save-msg'), 'ok', `Saved as ${id}.`);
  if (then === 'lab') { showTab('lab'); openInLab(id); }
  else { S.setup.teams[0][0] = id; renderSetup(); showTab('arena'); runMatch(); }
}
function bindGarage() {
  $('erase').addEventListener('click', () => { G.erase = !G.erase; renderPalette(); });
  $('g-clear').addEventListener('click', () => { G.parts = [{ type: 'plate', x: 0, y: 0, z: 0, dir: 'N' }, { type: 'core', x: 0, y: 0, z: 1, dir: 'N' }]; renderBlueprint(); });
  $('g-mirror').addEventListener('click', mirrorGarage);
  const load = $('g-load');
  const fill = () => load.replaceChildren(el('option', { value: '', text: 'Pick one…' }), ...botIds().map((id) => el('option', { value: id, text: botLabel(id) })));
  fill(); load.addEventListener('focus', fill);
  load.addEventListener('change', () => { if (load.value) loadDesignFrom(load.value); });
  const ai = $('g-ai');
  ai.replaceChildren(...Object.keys(AI_TEMPLATES).map((id) => el('option', { value: id, text: botLabel(id) + ' style' })));
  const note = () => { $('g-ai-note').textContent = AI_TEMPLATES[ai.value]; };
  ai.addEventListener('change', note); note();
  $('g-save').addEventListener('click', () => saveGarage('arena'));
  $('g-tolab').addEventListener('click', () => saveGarage('lab'));
  $('budget').addEventListener('change', () => { S.setup.budget = Number($('budget').value); renderBlueprint(); persist(); });
  if (window.ResizeObserver) new ResizeObserver(() => preview && preview.resize()).observe($('g-preview'));
}

// ── bot lab ─────────────────────────────────────────────────────────────
function refreshLabList(sel) {
  const s = $('lab-bot'), cur = sel || s.value || 'rookie';
  s.replaceChildren(...botIds().map((id) => el('option', { value: id, text: `${botLabel(id)}  ·  ${id}${builtin[id] ? ' (built-in)' : ''}`, selected: id === cur })));
}
function openInLab(id) {
  refreshLabList(id);
  $('lab-src').value = allSources()[id] || '';
  $('lab-name').value = builtin[id] ? '' : id;
  $('lab-delete').disabled = !!builtin[id];
  $('lab-msg').replaceChildren();
}
async function labCheck(save) {
  const out = $('lab-msg'), src = $('lab-src').value;
  let id = $('lab-name').value.trim().toLowerCase();
  out.replaceChildren(el('div', { class: 'msg', text: 'Checking…' }));
  if (save) {
    if (!IY_NAME.test(id)) { out.replaceChildren(el('div', { class: 'msg bad', text: 'A name may only use lowercase letters, digits, - and _, for example my-striker-v2.' })); return; }
    if (builtin[id]) { out.replaceChildren(el('div', { class: 'msg bad', text: `${id} is a built-in bot; pick another name.` })); return; }
  } else id = '__draft';
  const chk = await host.checkSyntax(src);
  if (!chk.ok) { out.replaceChildren(el('div', { class: 'msg bad', text: chk.error })); return; }
  try {
    host.setBots({ ...allSources(), [id]: src });
    const d = await host.describe(id, S.setup.budget);
    const nodes = [];
    const seen = new Set();
    for (const mode of Object.keys(d)) for (const v of d[mode]) {
      const key = JSON.stringify(v.design.parts);
      if (v.errors.length) nodes.push(el('div', { class: 'msg bad', text: `${mode} slot ${v.slot} failed while running:\n${v.errors.join('\n')}` }));
      if (seen.has(key)) continue; seen.add(key);
      nodes.push(el('div', { class: 'msg ok', text: `${v.design.name} (${mode} slot ${v.slot}): cost ${v.stats.cost}, ${v.stats.mass} kg, top speed ${v.stats.topSpeed} m/s, turn rate ${v.stats.turnRate} rad/s, ${v.stats.dps} dps, tick avg ${v.cpu ? v.cpu.avgMs : '?'} ms` }),
        el('pre', { text: IY.renderDesign(v.design) }));
    }
    if (save) {
      S.custom[id] = src; persist(); renderSetup(); refreshLabList(id); $('lab-delete').disabled = false;
      nodes.unshift(el('div', { class: 'msg ok', text: `Saved as ${id}. Pick it on the Arena tab.` }));
    }
    out.replaceChildren(...nodes);
  } catch (e) {
    out.replaceChildren(el('div', { class: 'msg bad', text: e.message }));
  } finally { host.setBots(allSources()); }
}
function bindLab() {
  $('lab-bot').addEventListener('change', (e) => openInLab(e.target.value));
  $('lab-check').addEventListener('click', () => labCheck(false));
  $('lab-save').addEventListener('click', () => labCheck(true));
  $('lab-copy').addEventListener('click', () => copyText($('lab-src').value));
  $('lab-delete').addEventListener('click', () => {
    const id = $('lab-bot').value;
    if (builtin[id] || !S.custom[id]) return;
    delete S.custom[id];
    S.setup.teams = S.setup.teams.map((t) => t.map((b) => (b === id ? 'rookie' : b)));
    persist(); renderSetup(); openInLab('rookie'); toast(`Deleted ${id}`);
  });
  $('lab-src').addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const t = e.target, s = t.selectionStart;
    t.setRangeText('  ', s, t.selectionEnd, 'end');
  });
}

// ── league ──────────────────────────────────────────────────────────────
const L = S.league;
// The ladder as `ironyard ladder --write` last saved it; the build puts it into the page. None: no card.
const LB = { queue: 'overview', by: 'bot' };
function renderLadder() {
  const data = window.__LADDER;
  if (!data || !data.queues) return;
  $('lb').hidden = false;
  const modes = Object.keys(data.queues), overview = LB.queue === 'overview';
  if (!overview && !data.queues[LB.queue]) LB.queue = modes[0];
  seg($('lb-mode'), [['overview', 'Overview'], ...modes.map((m) => [m, m])], () => LB.queue, (m) => { LB.queue = m; renderLadder(); });
  $('lb-by').hidden = overview;
  seg($('lb-by'), [['bot', 'By bot'], ['author', 'By author']], () => LB.by, (b) => { LB.by = b; renderLadder(); });
  const selected = overview ? Object.values(data.queues) : [data.queues[LB.queue]];
  const total = selected.reduce((n, q) => n + q.matches, 0);
  const done = selected.reduce((n, q) => n + (q.onFile ?? q.matches), 0);
  const errors = selected.reduce((n, q) => n + (q.errorCount || 0), 0);
  const status = errors ? 'Contains errors' : done < total ? 'Provisional' : 'Complete';
  $('lb-meta').textContent = `${status} · ${data.entrants} bots · ${done}/${total} matches · ${data.budget ?? 1200}cr`;
  const rank = (row, i) => row.length >= 9 ? (row[8] ?? '—') : row[3] ? i + 1 : '—';
  let head, rows, num;
  if (overview) {
    const bots = new Map();
    for (const mode of modes) data.queues[mode].standings.forEach((r, i) => {
      if (!bots.has(r[0])) bots.set(r[0], { row: r, ranks: {} });
      bots.get(r[0]).ranks[mode] = rank(r, i);
    });
    head = ['Bot', 'Author', 'Recorded model', ...modes.map(m => `${m} rank`)];
    rows = [...bots.values()].map(({ row: r, ranks }) => [botLabel(r[0]), r[1], r[7] || 'Not recorded', ...modes.map(m => ranks[m] ?? '—')]);
    num = i => i >= 3;
  } else {
    const q = data.queues[LB.queue], byBot = LB.by === 'bot';
    head = byBot ? ['#', 'Bot', 'Author', 'Recorded model', 'Rating', 'Played', 'W', 'D', 'L', 'Win %'] : ['#', 'Author', 'Bots', 'Best bot', 'Best rating', 'Mean rating'];
    rows = byBot
      ? q.standings.map((r, i) => [rank(r, i), botLabel(r[0]), r[1], r[7] || 'Not recorded', r[2], r[3], r[4], r[5], r[6], r[3] ? Math.round(r[4] / r[3] * 100) : 0])
      : q.authors.map(([author, bots, best, bestRating, meanRating], i) => [i + 1, author, bots, botLabel(best), bestRating, meanRating]);
    num = i => byBot ? i === 0 || i >= 4 : i === 0 || i === 2 || i >= 4;
  }
  $('lb-table').replaceChildren(el('table', {}, el('thead', {}, el('tr', {}, ...head.map((h, i) => el('th', { class: num(i) ? 'n' : '', text: h })))),
    el('tbody', {}, ...rows.map((r) => el('tr', {}, ...r.map((c, i) => el('td', { class: num(i) ? 'n' : '', text: String(c) })))))));
  const notes = overview
    ? 'Separate rankings for each mode; no overall or model ranking. Listed in 1v1 order. Model labels come from bot source metadata; missing attribution is not inferred.'
    : LB.by === 'author'
      ? 'Authors are ordered by their best bot, then mean rating. An author is a self-declared entrant label, not necessarily a model.'
      : LB.queue === '1v1'
        ? 'Every pair, all eight maps, seed 1, both spawn sides. Rating fits all results with a 1500 anchor; rank uses unrounded rating, not win percentage.'
        : '40 mixed-team rounds; each pairing plays every team slot from both spawn sides. Rating estimates individual contribution, accounting for teammates and opponents. Game counts and map exposure differ.';
  $('lb-note').textContent = `${notes} This is a saved snapshot; custom tournaments below do not change it.${errors ? ' Match errors require review before comparing scores.' : ''}`;
}

function renderLeagueSetup() {
  L.bots ||= new Set(Object.keys(builtin));
  L.maps ||= new Set(['proving', 'canyon', 'sumo']);
  for (const id of [...L.bots]) if (!allSources()[id]) L.bots.delete(id);
  const chips = (node, ids, set, label) => node.replaceChildren(...ids.map((id) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(set.has(id)), text: label(id),
    onclick: () => { if (set.has(id)) set.delete(id); else set.add(id); renderLeagueSetup(); } })));
  chips($('lg-bots'), botIds(), L.bots, botLabel);
  chips($('lg-maps'), IY.MAP_IDS, L.maps, (id) => IY.MAPS[id].name);
  seg($('lg-mode'), Object.keys(IY.MODES).map((m) => [m, m]), () => L.mode, (m) => { L.mode = m; renderLeagueSetup(); });
  L.seeds = Number($('lg-seeds').value);
  const n = L.bots.size, matches = (n * (n - 1)) / 2 * L.maps.size * L.seeds * 2;
  $('lg-count').textContent = n < 2 || !L.maps.size ? 'Pick at least 2 bots and 1 map' : `${count(matches, 'match', 'matches')} (${n} bots × ${count(L.maps.size, 'map')} × ${count(L.seeds, 'seed')} × both spawn sides)`;
  $('lg-run').disabled = L.running || n < 2 || !L.maps.size;
  $('lg-stop').hidden = !L.running;
  $('lg-seeds').disabled = L.running;
  for (const node of ['lg-bots', 'lg-maps', 'lg-mode']) $(node).querySelectorAll('button').forEach(b => { b.disabled = L.running; });
}
async function runLeague() {
  if (L.running) return;
  const ids = botIds().filter(id => L.bots.has(id)), maps = IY.MAP_IDS.filter(id => L.maps.has(id));
  if (ids.length < 2 || !maps.length) return;
  const seeds = Array.from({ length: L.seeds }, (_, i) => i + 1);
  const mode = L.mode, budget = S.setup.budget, sources = allSources();
  const names = Object.fromEntries(ids.map(id => [id, botLabel(id)]));
  const entrants = ids.map(id => ({ id, bots: [id] }));
  const schedule = IY.makeSchedule({ entrants, maps, seeds });
  L.running = true; renderLeagueSetup(); msg($('lg-msg'), '', '');
  $('lg-result').hidden = true; $('lg-bar').style.width = '0%';
  const results = [];
  const t0 = performance.now();
  let failure = null;
  try {
    leagueHost.setBots(sources);
    await leagueHost.tournament(schedule, mode, budget, r => {
      results.push({ ...schedule[r.i], ...r });
      $('lg-bar').style.width = (results.length / schedule.length) * 100 + '%';
    });
  } catch (e) { failure = e; }
  const status = IY.tournamentStatus(results, schedule.length);
  try {
    const table = IY.standings(entrants, results);
    const scored = results.filter(IY.scoredResult);
    const dur = scored.reduce((s, r) => s + (r.duration || 0), 0) / Math.max(1, scored.length);
    $('lg-meta').textContent = `${mode} · ${status.scoredMatches}/${schedule.length} scored · ${status.unscoredMatches} unscored · avg ${dur.toFixed(0)}s`;
    $('lg-table').replaceChildren(el('table', {}, el('thead', {}, el('tr', {}, ...['#', 'bot', 'Pts', 'W', 'D', 'L', 'Win %', 'Hull diff', 'Unscored'].map((h, i) => el('th', { class: i >= 2 ? 'n' : '', text: h })))),
      el('tbody', {}, ...table.map((r, i) => el('tr', {}, el('td', { class: 'n', text: r.played ? i + 1 : "—" }), el('td', {}, el('b', { text: names[r.id] }), el('div', { class: 'note', text: r.id })),
        el('td', { class: 'n', text: r.points }), el('td', { class: 'n', text: r.w }), el('td', { class: 'n', text: r.d }), el('td', { class: 'n', text: r.l }),
        el('td', { class: 'n', text: Math.round(r.winRate * 100) + '%' }), el('td', { class: 'n', text: (r.hullDiff > 0 ? '+' : '') + r.hullDiff.toFixed(1) }), el('td', { class: 'n', text: r.unscored }))))));
    $('lg-h2h').replaceChildren(el('table', {}, el('thead', {}, el('tr', {}, el('th', {}), ...table.map((c) => el('th', { text: c.id.slice(0, 7) })))),
      el('tbody', {}, ...table.map((r) => el('tr', {}, el('th', { text: r.id }), ...table.map((c) => {
        if (c.id === r.id) return el('td', { class: 'h2h', text: '·' });
        const v = r.vs[c.id] || { w: 0, d: 0, l: 0 };
        const played = results.find(m => IY.scoredResult(m) && !m.forfeit && ((m.a === r.id && m.b === c.id) || (m.a === c.id && m.b === r.id)));
        return el('td', { class: 'h2h', style: v.w > v.l ? 'color:var(--ok)' : v.w < v.l ? 'color:var(--bad)' : '' },
          played ? el('button', { type: 'button', title: `Watch ${played.map}, seed ${played.seed}${played.swap ? ', sides swapped' : ''}`, text: `${v.w}-${v.d}-${v.l}`, onclick: () => watch(played, mode, budget, sources) }) : `${v.w}-${v.d}-${v.l}`);
      }))))));
    $('lg-result').hidden = false;
    const errs = results.filter(r => r.error);
    const label = failure ? (failure.name === 'AbortError' ? 'Stopped' : 'Interrupted') : status.complete ? 'Complete' : 'Provisional';
    msg($('lg-msg'), failure && failure.name !== 'AbortError' ? 'bad' : errs.length || !status.complete ? 'warn' : 'ok',
      `${label} in ${((performance.now() - t0) / 1000).toFixed(1)}s. ${status.scoredMatches}/${schedule.length} scored; ${status.unscoredMatches} unscored; ${status.remainingMatches} remaining.`
      + (failure && failure.name !== 'AbortError' ? ` ${failure.message}` : '')
      + (errs.length ? ` ${errs.length} match errors, for example: ${errs[0].error}` : ''));
  } finally { L.running = false; renderLeagueSetup(); }
}
function watch(match, mode, budget, sources) {
  Object.assign(S.setup, { mode, budget, map: match.map, seed: match.seed, swap: match.swap, teams: match.teams.map(t => [...t]) });
  renderSetup(); showTab('arena');
  runMatch({ mode, budget, map: match.map, seed: match.seed, swap: match.swap, teams: match.teams }, sources);
}

// ── rules + MCP pages ───────────────────────────────────────────────────
function renderRules() {
  const LAYER_LABEL = { chassis: 'chassis', deck: 'deck', any: 'either' };
  const partRows = Object.values(IY.PARTS).map((p) => el('tr', {}, el('td', {}, thumbs[p.id] ? el('img', { class: 'thumb', src: thumbs[p.id], alt: '' }) : el('span', { class: 'cell on', 'data-cat': p.cat, 'data-type': p.id, style: 'display:inline-grid;width:26px;font-size:13px', text: ABBR[p.id] })),
    el('td', {}, el('b', { text: p.name }), el('div', { class: 'note', text: `${p.id} · ${p.size[0]}×${p.size[1]} · ${LAYER_LABEL[p.layer]}` })), el('td', { class: 'n', text: p.decor ? 'free' : p.cost }), el('td', { class: 'n', text: p.mass }), el('td', { class: 'n', text: p.hp }), el('td', { text: plain(p.desc) })));
  const itemRows = Object.values(IY.ITEMS).map((it) => el('tr', {}, el('td', { text: it.icon + ' ' + it.name }), el('td', { text: it.held ? 'Held; useItem fires it' : 'Works on pickup' }), el('td', { text: plain(it.desc) })));
  const tileRows = Object.entries(IY.TILES).map(([id, t]) => el('tr', {}, el('td', {}, el('code', { text: t.ch })), el('td', { text: t.name }), el('td', { text: plain(t.desc || 'Plain ground.') })));
  const R = IY.RULES;
  $('rules').replaceChildren(
    el('div', { class: 'sheet' }, el('header', {}, el('h2', { text: 'The game on one page' }), el('span', { class: 'code', text: 'Quick start' })), el('div', { class: 'pad prose', html: `
      <p>Every entrant submits <strong>one JavaScript file</strong>: a blueprint (<code>design</code>: which parts go where) plus a decision function (<code>tick</code>). Once a match starts no model takes part: the engine steps at a fixed rate, and the same files with the same seed always give the same result.</p>
      <ul>
        <li><strong>Building</strong>: a baseplate of ${IY.GRID_W}×${IY.GRID_L} studs (${IY.CELL} m each). <code>y+</code> is the front, <code>x+</code> is the right side, and there are two layers: <strong>chassis</strong> and <strong>deck</strong>. Like bricks, parts cover 1×1 up to 2×2 or 1×3 studs: wheels, tracks, plows and saws go on the chassis only; guns, radar and shields on the deck only; the cockpit, plates, bricks and armor fit either layer.</li>
        <li><strong>Three building rules</strong>: exactly one cockpit (the core); every deck part has at least one stud resting on a chassis part; every part connects to the core (edge to edge on the same layer, or stacked). The total cost must stay within the budget (light ${IY.BUDGETS.light} / standard ${IY.BUDGETS.standard} / heavy ${IY.BUDGETS.heavy}).</li>
        <li><strong>Firing lanes</strong>: no tall part may sit on the same layer between a gun and the edge it faces. Low parts such as plates, slopes and radar do not block, so slope armor can go right in front of the muzzle. The mortar lobs its shells and needs no lane.</li>
        <li><strong>How the two layers take hits</strong>: bullets, beams and blasts hit the deck part on that stud first and only reach the chassis once it is gone; rams, saws and mines hit the chassis first. A slope facing the shot takes only 45%.</li>
        <li><strong>Parts get shot off</strong>: every brick has its own hit points, and when it goes its function goes with it; whatever is cut off from the core falls away in one piece; when the core goes, the vehicle goes. How you lay the parts out is your armor scheme.</li>
        <li><strong>Decor and paint</strong>: fins, exhaust stacks, light bars, flags and livery tiles are free, weigh nothing and do not stop shots, up to ${IY.DECOR_LIMIT} of them; each vehicle may pick one accent colour. Purely for looks, with no effect on who wins.</li>
        <li><strong>The physics is computed</strong>: wheels steer by left/right differential, and the wider apart they sit the faster you turn; heavier is slower; the centre of mass shifts as parts fall off; hovering needs enough lift and enough energy.</li>
        <li><strong>Energy</strong>: firing, lasers, thrusters, hovering, shields and repairs all draw energy; whatever cannot be paid for on a step does not work on that step.</li>
        <li><strong>Matches</strong>: 1v1 / 2v2 / 3v3, physics at ${R.tickRate} Hz, <code>tick</code> runs ${R.tickRate / R.decisionEvery} times a second, a match lasts at most ${R.duration} seconds. From ${R.zoneStart} seconds the safe zone shrinks, and every part outside it loses ${R.zoneDps} hp a second. Eliminate the other team to win; when time runs out it goes to vehicles alive, then hull remaining, then damage dealt.</li>
        <li><strong>Vision</strong>: an enemy is visible only inside the sensor range of someone on your team (core ${IY.PARTS.core.sensor} m, radar +${IY.PARTS.radar.sensor} m), and firing reveals a vehicle for ${R.revealTime} seconds. Teammates can only talk through <code>say</code>.</li>
      </ul>` })),
    el('div', { class: 'sheet' }, el('header', {}, el('h2', { text: 'Parts list' }), el('span', { class: 'code', text: `${Object.keys(IY.PARTS).length} parts` })),
      el('div', { class: 'scroll-x' }, el('table', {}, el('thead', {}, el('tr', {}, ...['', 'Part', 'Cost', 'kg', 'hp', 'What it does'].map((h, i) => el('th', { class: i >= 2 && i <= 4 ? 'n' : '', text: h })))), el('tbody', {}, ...partRows)))),
    el('div', { class: 'sheet' }, el('header', {}, el('h2', { text: 'Pickups' }), el('span', { class: 'code', text: `first at ${R.itemFirstSpawn}s · back ${R.itemRespawn}s after pickup` })),
      el('div', { class: 'scroll-x' }, el('table', {}, el('tbody', {}, ...itemRows)))),
    el('div', { class: 'sheet' }, el('header', {}, el('h2', { text: 'Terrain' }), el('span', { class: 'code', text: `1 tile = ${IY.TILE} m` })),
      el('div', { class: 'scroll-x' }, el('table', {}, el('tbody', {}, ...tileRows)))),
    el('div', { class: 'sheet' }, el('header', {}, el('h2', { text: 'Full rulebook (the text agents read)' }), el('span', { class: 'code', text: 'AGENTS.md' })),
      el('details', {}, el('summary', { text: 'Expand: state fields, command fields, helper API, every number' }), el('div', { class: 'pad prose prose-wide', html: mdToHtml(IY.rulesMarkdown()) }))));
}

function renderMcp() {
  const tools = [['get_rules', 'Read the full rulebook and the controller contract'], ['list_parts', 'JSON tables of parts, pickups, terrain and constants'], ['list_maps', 'Maps as ASCII, with coordinates'], ['list_bots / get_bot', 'See which bots exist and read their source'],
    ['validate_design', 'Check a blueprint only: errors, warnings, derived stats, ASCII drawing'], ['submit_bot', 'Compile + smoke-test in all three modes; saved only if it passes'], ['run_match', 'Run one match and get the battle report (damage breakdown, accuracy, time spent stuck, what fell off first)'],
    ['evaluate_bot', 'Play a field of opponents across maps and seeds, both sides; returns a win-rate table and the worst losses'], ['run_tournament', 'Round-robin standings']];
  const code = (text) => { const pre = el('pre', { text }); return el('div', {}, el('button', { class: 'btn copy', type: 'button', text: 'Copy', onclick: () => copyText(text) }), pre); };
  $('mcp').replaceChildren(
    el('p', { text: 'The engine in this page is the same code the command line and the MCP server run. Put the project on your machine (clone the repository or unpack the project archive) and any agent that speaks MCP (Claude Code, Codex, Cursor, OpenCode…) can read the rules, design blueprints, write strategy, run matches, read the battle reports and iterate by itself, entirely offline.' }),
    el('h2', { text: '1. Start' }),
    code('cd ironyard                                 # Node 20+; the engine and the MCP server have no dependencies\nnode node/cli.js tournament                 # first watch the built-in bots play a round'),
    el('h2', { text: '2. Connect it to your agent' }),
    el('h3', { text: 'Claude Code (stdio)' }), code('claude mcp add ironyard -- node /absolute/path/to/ironyard/node/mcp-server.js'),
    el('h3', { text: 'Generic JSON config (Cursor, Codex and others)' }), code('{\n  "mcpServers": {\n    "ironyard": { "command": "node", "args": ["/absolute/path/to/ironyard/node/mcp-server.js"] }\n  }\n}'),
    el('h3', { text: 'HTTP (Streamable HTTP, for remote agents or several agents sharing one server)' }), code('node node/mcp-server.js --http 8787\nclaude mcp add --transport http ironyard http://127.0.0.1:8787/mcp\n\n# let other machines connect: listen on every interface and require a token\nIRONYARD_TOKEN=your-token node node/mcp-server.js --http 8787 --host 0.0.0.0\nclaude mcp add --transport http ironyard http://your-server:8787/mcp --header "Authorization: Bearer your-token"'),
    el('h2', { text: '3. Tools the agent can use' }),
    el('div', { class: 'scroll-x' }, el('table', {}, el('tbody', {}, ...tools.map(([n, d]) => el('tr', {}, el('td', {}, el('code', { text: n })), el('td', { text: d })))))),
    el('h2', { text: '4. One sentence to get going' }),
    code('Use the ironyard tools: call get_rules first, then design two complementary vehicles for 2v2 and write their controller; after submit_bot, iterate with evaluate_bot until the win rate against every built-in bot is above 60%.'),
    el('p', { class: 'note', text: 'The server also comes with a build-a-bot prompt template and an ironyard://rules resource. Bots the agent submits are stored in user_bots/; run_match with save_replay writes the replay to replays/, and "Import replay JSON" on the Arena tab plays it here.' }),
    el('h2', { text: 'Security boundary' }),
    el('p', { text: 'Each vehicle\'s controller runs in its own vm context. Only strings and numbers pass between it and the engine, and it is never handed one of the engine\'s own objects: it cannot reach process, require, files or the network, cannot change what the engine or the other vehicles see, has no clock, and none of its code runs outside its turn; infinite loops and memory exhaustion are handled by the worker thread\'s watchdog and charged to that controller. That is far stronger than a lock that only keeps honest people out, but vm is not a security boundary the way a process or a container is: if you open submissions to strangers, put the whole server in a container. HTTP mode listens on 127.0.0.1 only by default; there is a single token, and everyone who connects shares one bot directory. In this web page the engine and the controllers share one Web Worker with no isolation: what runs here is code you pasted in yourself.' }));
}

// ── boot ────────────────────────────────────────────────────────────────
function start(data) {
  restore(data);
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1), false));
  renderSetup(); bindArena(); renderPalette(); bindGarage(); bindLab(); renderRules(); renderMcp();
  $('lg-run').addEventListener('click', runLeague);
  $('lg-stop').addEventListener('click', () => leagueHost.cancel());
  $('lg-seeds').addEventListener('change', renderLeagueSetup);
  showPartInfo(G.tool);
  openInLab('rookie');
  G.parts = [{ type: 'plate', x: 0, y: 0, z: 0, dir: 'N' }, { type: 'core', x: 0, y: 0, z: 1, dir: 'N' }];
  renderBlueprint();
  loadDesignFrom('rookie');
  showTab((data && data.tab) || location.hash.slice(1) || 'arena', false);
  requestAnimationFrame(frame);
  runMatch();
  try { window.claude?.hot?.snapshot(() => ({ custom: S.custom, setup: S.setup, tab: S.tab })); } catch { /* not in the viewer */ }
}
window.__ironyard = { get renderer() { return renderer; }, get replay() { return rp; }, state: S, setup: renderSetup }; // for tests and the console
if (window.claude?.hot?.ready) window.claude.hot.ready(start); else start(window.claude?.hot?.data ?? {});
