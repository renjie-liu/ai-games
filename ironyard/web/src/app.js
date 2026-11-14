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
const TEAM_CN = ['橙队', '蓝队'];
const TEAM_COL = ['var(--hazard)', 'var(--coolant)'];
const ABBR = { core: '核', plate: '板', plate2: '板', plate4: '板', brick: '砖', brick2: '砖', armor: '甲', armor2: '甲', slope: '斜', plow: '铲',
  wheel: '轮', bigwheel: '巨', track: '履', hover: '浮', thruster: '推', gyro: '陀', blower: '增', spoiler: '翼',
  mg: '枪', cannon: '炮', railgun: '轨', laser: '激', missile: '弹', mortar: '迫', saw: '锯', spike: '角', flamer: '火', harpoon: '叉', piston: '锤', keg: '桶',
  battery: '电', reactor: '堆', radar: '雷', shieldgen: '盾', repairer: '修', tile: '饰', fin: '鳍', pipe: '管', lamp: '灯', flag: '旗' };
const CAT_CN = { structure: '结构 / 防御', mobility: '机动 / 转向', weapon: '武器', utility: '功能', decor: '装饰（免费）' };
const ARROW = { N: '↑', E: '→', S: '↓', W: '←' };
const REASON_CN = { elimination: '全歼对手', 'mutual destruction': '同归于尽', 'time: more vehicles alive': '时间到，存活更多', 'time: more hull remaining': '时间到，车体更完整',
  'time: more damage dealt': '时间到，输出更高', 'time: exact tie': '时间到，完全打平', 'stopped early': '提前结束' };
const AI_TEMPLATES = {
  rookie: '中距离射手：贴到 8 m 左右对射，被贴脸就倒车。适合前向枪炮。',
  thumper: '炮兵：迫击炮越墙轰预判落点，机枪自卫，保持 13 到 19 m。适合迫击炮。',
  bastion: '重坦推进：19 m 内车头对敌慢慢压上，残血找维修点。适合前向加农炮 + 厚甲。',
  longshot: '狙击风筝：保持 13 到 19 m，瞄核心，敌人靠近就倒车。适合磁轨炮、加农炮。',
  bulldozer: '冲撞：对准敌人点推进器撞过去，贴身锯。适合撞角、推铲、圆锯。',
  hornet: '左舷绕圈：让敌人始终在车的左边，7 m 逆时针环绕。武器要朝左（←）装。',
  wasp: '悬浮风筝：离敌 15 到 22 m，车头对敌倒退着放导弹。适合悬浮垫 + 导弹。',
  medic: '支援：跟着最残的队友修理，顺手开枪。适合维修臂 + 护盾。',
  pyro: '放火：冲到 4 m 内绕着喷，烧起来就换下一个；自己着火就找维修台。适合喷火器。',
  sapper: '投弹：隔着 7 到 10 m 把车头对准敌人的去向，把朝前的火药桶甩过去，敌人逼近就边退边扔。适合装在车头、朝前的火药桶。',
  angler: '钩锯：进 11 m 放鱼叉，把缆收到底，顶着锯；背后有熔岩就往后拖。适合鱼叉 + 圆锯。',
  boxer: '拳击：绕到敌人背对坑、熔岩或火药桶的那一侧，一锤打进去。适合活塞锤。',
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
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast('已复制'); } catch { toast('复制失败：请长按文本手动复制'); } }

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
  if (name === 'league') renderLeagueSetup();
}

// ── arena: setup form ───────────────────────────────────────────────────
function seg(node, options, get, set) {
  node.replaceChildren(...options.map(([val, label]) => el('button', { type: 'button', 'aria-pressed': String(get() === val), text: label,
    onclick: () => { set(val); seg(node, options, get, set); } })));
}
function botSelect(value, onchange) {
  const s = el('select', { 'aria-label': '选择 bot', onchange: (e) => onchange(e.target.value) });
  for (const id of botIds()) s.append(el('option', { value: id, text: `${botLabel(id)}  ·  ${id}`, selected: id === value }));
  return s;
}
function renderSetup() {
  const st = S.setup, size = IY.MODES[st.mode];
  seg($('mode-seg'), Object.keys(IY.MODES).map((m) => [m, m]), () => st.mode, (m) => { st.mode = m; renderSetup(); });
  const mapSel = $('map');
  mapSel.replaceChildren(...IY.MAP_IDS.map((id) => el('option', { value: id, text: `${IY.MAPS[id].zh} ${IY.MAPS[id].name}`, selected: id === st.map })));
  const m = IY.MAPS[st.map];
  $('minimap').textContent = m.rows.join('\n');
  $('map-desc').textContent = `${m.width}×${m.height} m。` + MAP_CN[st.map];
  $('seed').value = st.seed; $('swap').checked = st.swap; $('budget').value = String(st.budget);
  st.teams = st.teams.map((t) => { const out = t.slice(0, size); while (out.length < size) out.push(out[out.length - 1] || 'rookie'); return out; });
  [0, 1].forEach((t) => {
    $('slots' + t).replaceChildren(...st.teams[t].map((id, k) => botSelect(id, (v) => { st.teams[t][k] = v; persist(); })));
  });
}
const MAP_CN = {
  proving: '混凝土试车场：围墙开阔场，几根柱子，中间一块泥地。最公平的默认图。',
  sumo: '海上的钢甲板，没有墙，中间冰环加一个洞。把人推下海，或者干脆悬浮。',
  canyon: '沙漠峡谷：岩墙分出三条路，中路视线长，中央泥地卡口，两侧有岩柱可以躲。',
  frostbite: '雪原：中间整片冰湖，湖心一块干地，四角有坑。轮子打滑，履带和悬浮占便宜。',
  skybridge: '云层之上的几座混凝土平台，靠桥连着。掉下去就没了；悬浮车可以抄近路。',
  foundry: '夜里的铸造厂：熔融金属池加窄通道，后场角落有维修台。',
  bog: '沼泽里的团队大图：泥地和积水、可以越过去射击的沙袋掩体、两翼深坑、中央维修台。',
};

// ── arena: running + playback ───────────────────────────────────────────
let renderer = null, rp = null, lastTs = 0, rosterNodes = [], labelNodes = [];

function makeRenderer() {
  if (renderer) renderer.dispose();
  const vp = $('viewport');
  if (S.view === '3d' && typeof THREE !== 'undefined') {
    try { renderer = new Render3D(vp, IY, kit); } catch (e) { S.view = '2d'; renderer = new Render2D(vp, IY); toast('这台设备开不了 WebGL，已换成 2D 视图'); }
  } else { if (S.view === '3d') toast('3D 库没有加载成功，已换成 2D 视图'); S.view = '2d'; renderer = new Render2D(vp, IY); }
  vp.prepend(renderer.canvas);
  $('view3d').setAttribute('aria-pressed', String(S.view === '3d'));
  $('view2d').setAttribute('aria-pressed', String(S.view === '2d'));
  renderer.follow = S.follow;
  renderer.onMode = (m) => { $('camera').value = m; };
  if (rp) renderer.load(rp);
  if ($('camera').value && $('camera').value[0] !== 'f') renderer.setPreset($('camera').value);
}

async function runMatch(extra = {}) {
  const st = S.setup;
  st.seed = Math.max(0, Math.floor(Number($('seed').value) || 0)); st.swap = $('swap').checked; st.budget = Number($('budget').value); st.map = $('map').value;
  persist();
  $('busy').hidden = false; $('banner').hidden = true; msg($('setup-msg'), '', '');
  $('run').disabled = true;
  try {
    host.setBots(allSources());
    const res = await host.match({ map: st.map, mode: st.mode, seed: st.seed, swap: st.swap, budget: st.budget, teams: st.teams, ...extra });
    loadReplay(res);
  } catch (e) {
    msg($('setup-msg'), 'bad', '没法开赛：' + e.message);
  } finally { $('busy').hidden = true; $('run').disabled = false; }
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
      const row = el('button', { class: 'veh', type: 'button', 'aria-pressed': 'false', title: '镜头跟随这辆车', onclick: () => setFollow(S.follow === v.id ? -1 : v.id) },
        el('span', { class: 'nm' }, v.name, el('small', { text: `${v.bot} · ${v.designStats.cost}cr · ${WCLASS_CN[v.designStats.weightClass] || ''} ${v.designStats.mass}kg` })),
        el('span', { class: 'bars' }, el('span', {}, hp), el('span', { class: 'e' }, en)), item);
      rosterNodes[v.id] = { row, hp, en, item };
      return row;
    });
    return el('div', { class: `sheet team-card t${t}` }, el('header', {}, el('h2', { class: 't' + t, text: TEAM_CN[t] }), el('span', { class: 'code', text: rp.res.teams[t].bots.join(' + ') })), ...rows);
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
  sel.replaceChildren(el('option', { value: 'auto', text: '镜头：自动跟拍' }), el('option', { value: 'iso', text: '镜头：全景' }), el('option', { value: 'top', text: '镜头：俯视' }), el('option', { value: 'free', text: '镜头：手动' }),
    ...rp.vehicles.map((v) => el('option', { value: 'f' + v.id, text: `跟随 ${TEAM_CN[v.team][0]}·${v.name}` })));
}
function setFollow(id) {
  S.follow = id; if (renderer) renderer.follow = id;
  rosterNodes.forEach((n, i) => n && n.row.setAttribute('aria-pressed', String(i === id)));
  $('camera').value = id >= 0 ? 'f' + id : 'auto';
  if (renderer) { if (id >= 0) { if (renderer.cam) renderer.cam.dist = Math.min(renderer.cam.dist, 30); } else renderer.setPreset('auto'); }
}

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
  $('clock-sub').textContent = `/ ${fmtClock(IY.RULES.duration)} · ${IY.MAPS[rp.res.map].zh} · ${rp.res.mode}`;
  $('zone-tag').textContent = view.zoneR < rp.zone.radius0 - 0.5 ? `毒圈收缩中 半径 ${view.zoneR.toFixed(0)} m` : '';
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
  const title = r.winner === null ? '回放结束' : r.winner < 0 ? '平局' : `${TEAM_CN[r.winner]}胜`;
  b.replaceChildren(el('b', { class: r.winner >= 0 ? 't' + r.winner : '', text: title }), el('span', { text: `${REASON_CN[r.reason] || r.reason} · ${r.duration}s` }),
    el('div', { class: 'row', style: 'justify-content:center' },
      el('button', { class: 'btn', type: 'button', text: '重看', onclick: () => { S.time = 0; S.playing = true; b.hidden = true; $('play').textContent = '❚❚'; } }),
      el('button', { class: 'btn primary', type: 'button', text: '换种子再打', onclick: () => { $('seed').value = String(S.setup.seed + 1); runMatch(); } })));
  b.hidden = false;
  $('report-details').open = true;
}

function renderReport() {
  const r = rp.res;
  const head = el('tr', {}, ...['车', '结局', '车体', '输出', '承伤', '击毁', '命中', '里程', '炮口够不着', '缺电', '斜面弹开', '最先掉的零件'].map((h, i) => el('th', { class: i >= 2 && i <= 10 ? 'n' : '', text: h })));
  const lost = {};
  for (const e of r.events) if (e.k === 'part') { const d = IY.PARTS[r.vehicles[e.v].design.parts[e.i].type]; if (!d.decor) (lost[e.v] ||= []).push(d.zh); }
  const rows = r.vehicles.map((v) => {
    const s = v.stats;
    return el('tr', {},
      el('td', {}, el('b', { class: 't' + v.team, text: v.name }), el('div', { class: 'note', text: v.bot })),
      el('td', { text: v.alive ? '存活' : `${v.deathT}s ${({ fell: '坠落', burn: '烧毁', ram: '撞毁', melee: '锯毁', kinetic: '击毁', explosive: '炸毁', energy: '熔毁', fire: '烧毁', wrecked: '报废', torn: '扯碎' })[v.deathCause] || v.deathCause}` }),
      el('td', { class: 'n', text: Math.round(v.hpFrac * 100) + '%' }), el('td', { class: 'n', text: Math.round(s.damageDealt) }), el('td', { class: 'n', text: Math.round(s.damageTaken) }),
      el('td', { class: 'n', text: s.kills }), el('td', { class: 'n', text: s.accuracy == null ? '–' : Math.round(s.accuracy * 100) + '%' }), el('td', { class: 'n', text: Math.round(s.distance) + ' m' }),
      el('td', { class: 'n', text: s.timeFireOutOfArc + 's' }), el('td', { class: 'n', text: s.timeEnergyStarved + 's' }), el('td', { class: 'n', text: Math.round(s.deflected || 0) }),
      el('td', { text: (lost[v.id] || []).slice(0, 5).join('、') || '–' }));
  });
  const errs = r.vehicles.filter((v) => v.errors.length).map((v) => el('div', { class: 'msg bad', text: `${v.name}：${v.errors.join('\n')}` }));
  const logs = r.vehicles.filter((v) => v.logs.length).map((v) => el('div', { class: 'msg', text: `${v.name} 的 api.log：\n${v.logs.slice(0, 12).join('\n')}` }));
  $('report').replaceChildren(el('p', { class: 'note', text: `${r.mode} · ${IY.MAPS[r.map].zh} · 种子 ${r.seed}${r.swap ? ' · 已交换出生点' : ''} · ${r.winner === null ? '' : r.winner < 0 ? '平局' : TEAM_CN[r.winner] + '胜'}（${REASON_CN[r.reason] || r.reason}，${r.duration}s）` }),
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
  $('scrub').addEventListener('input', (e) => { if (rp) { S.time = Number(e.target.value) / 30; $('banner').hidden = true; } });
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
      if (!res.frames || !res.vehicles || !IY.MAPS[res.map]) throw new Error('不是 Ironyard 回放文件');
      loadReplay(res); msg($('setup-msg'), 'ok', `已载入回放：${f.name}`);
    } catch (err) { msg($('setup-msg'), 'bad', '读不了这个文件：' + err.message); }
    e.target.value = '';
  });
  if (window.ResizeObserver) new ResizeObserver(() => renderer && renderer.resize()).observe($('viewport'));
  else window.addEventListener('resize', () => renderer && renderer.resize());
}

const PART_CN = {
  flamer: '短程火流。火流本身伤害很小：它把扫到的每块零件加热到着火，火再一块传一块。装甲、履带、核心烧不着；护盾挡得住。',
  harpoon: '发射带缆的钩子。钩住之后两辆车被拴在一起最多 7 秒：谁也跑不出缆长，reel 以 3 m/s 收缆。更重、抓地更好的那一方说了算。缆绳绷紧时，被钩住的那块零件每秒掉 45 血（装甲只掉四分之一）：拉够久，零件连同只靠它挂着的东西一起被扯下来。release 松钩。护盾会把钩子弹开。',
  piston: '打正前方贴着的东西：24 伤害加 1300 N·s 的一推（250 kg 的车以 5 m/s 飞出去），自己也吃同样的反冲。敌人、木箱、滚过来的火药桶进了范围就自动出锤（melee: false 可以按住）。',
  keg: '随车带的炸弹。detonate 原地引爆；jettison 把它朝自己的朝向甩出去（比车速快 8 m/s，能滚十来米），碰到第一辆别人的车就炸，否则 2 秒后炸：朝前是鱼雷，朝后是留给追兵的地雷。爆炸不分敌我，3.2 m 内全部挨炸、被掀开、被点着；谁把桶打坏或者点着，桶就当场炸。',
  core: '座舱，每车必须有且只有一个；核心没了车就没了，和核心断开的零件会掉。', plate: '薄底板，便宜。铺在底盘上当地板；放在上层很矮，炮可以越过它打。', plate2: '一片顶两颗凸点，单价更低，但碎就整片碎。',
  plate4: '一片顶四颗凸点，铺地最快最省，也是最大的一块弱点。', brick: '整高的砖，比底板结实；在上层会挡住炮口。', brick2: '两颗凸点的砖。',
  armor: '装甲砖，动能和爆炸伤害每次减 2（至少吃 25%），机枪打它只有一半；激光、锯和灼烧无视。', armor2: '两颗凸点的装甲砖，比两块 1×1 便宜一点，但碎就是两格一起碎。',
  slope: '斜面装甲：迎着斜面打来的炮弹只吃 45%（跳弹）。很矮，后面的炮可以越过它开火，所以适合垫在炮口和座舱前面。',
  plow: '三颗凸点宽的推铲：碰撞只吃 30% 伤害，把对方多推 60%。', wheel: '驱动轮。左右分开越宽转向越快；泥里打滑，冰上横移。', bigwheel: '两颗凸点长的大脚轮，推力接近两个轮子，更耐打，泥地里还有 75% 牵引。',
  track: '三颗凸点长的履带，几乎无视泥地，冰上还有抓地，不容易被横推。', hover: '每个托起 75 kg。总升力 ≥ 车重且有电就悬浮：无视泥、冰、坑和地雷，熔岩伤害减 75%，但会漂，容易被推。',
  thruster: '短时推进，任何地形有效，很耗电。', gyro: '额外 300 N·m 转向力矩，不依赖轮子和地形。', blower: '顶出引擎盖的增压器：所有轮子、履带、悬浮垫推力 +14%，最多两个。', spoiler: '三颗凸点宽的尾翼：侧向抓地 +60%，轻快的车不再甩尾。',
  mg: '大射界机枪塔 32 dps，拆底板和轮子很快，打装甲减半。', cannon: '两颗凸点长的加农炮，慢速重弹带小范围溅射，射界窄，要靠车身对准。', railgun: '三颗凸点长的磁轨炮，瞬时命中，穿 2 个零件（第二个减半），几乎是固定炮位，很耗电。',
  laser: '持续光束，无视装甲和斜面，射程短、耗电快。', missile: '2×2 的导弹巢，一次两发追踪导弹带溅射，速度慢，躲到墙后能甩掉。', mortar: '2×2 的迫击炮：炮弹越过墙落到你瞄的那个点，2 m 爆炸范围；6 m 以内打不到；不需要开火通道。',
  saw: '贴上敌方零件每秒 60 伤害，无视装甲和护盾，先啃底盘。', spike: '经过这颗凸点的碰撞造成 3 倍伤害，自己只吃 25%。', battery: '+140 能量上限。', reactor: '+8 能量/秒；被打爆会炸所有贴着它的零件（四周和上下）各 35。',
  radar: '+16 m 视野（全队共享），还能看到敌方地雷。', shieldgen: '吸收 120 点弹道/光束/爆炸伤害的护盾，3 秒没挨打开始回充；撞击和锯直接穿过。', repairer: '每秒修 9 hp：自己或 5 m 内队友身上最残的零件，修不回已经掉了的。',
  tile: '点缀色的光面砖，纯装饰。', fin: '尾鳍，纯装饰，看着快。', pipe: '两根镀铬排气管，纯装饰。', lamp: '会发光的车灯，纯装饰。', flag: '天线加一面点缀色小旗，纯装饰。',
};

// ── garage ──────────────────────────────────────────────────────────────
const G = S.garage;
let preview = null, thumbs = {};
const WCLASS_CN = { featherweight: '超轻', light: '轻型', medium: '中型', heavy: '重型', 'super-heavy': '超重' };
function designOf(parts) {
  return { name: $('g-name').value.trim() || '我的战车', paint: { accent: G.accent },
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
  for (const [cat, title] of Object.entries(CAT_CN)) {
    wrap.append(el('div', { class: 'cat-h', text: title }));
    const grid = el('div', { class: 'palette' });
    for (const p of Object.values(IY.PARTS).filter((x) => x.cat === cat)) {
      const pic = thumbs[p.id] ? el('span', { class: 'g' }, el('img', { src: thumbs[p.id], alt: '' })) : el('span', { class: 'g cell on', 'data-cat': p.cat, 'data-type': p.id, text: ABBR[p.id] });
      grid.append(el('button', { class: 'pbtn', type: 'button', 'aria-pressed': String(!G.erase && G.tool === p.id), onclick: () => { G.tool = p.id; G.erase = false; pickLayerFor(p); renderPalette(); showPartInfo(p.id); renderBlueprint(); } },
        pic, el('b', { text: p.zh }), el('small', { text: p.decor ? '免费装饰' : `${p.cost}cr · ${p.mass}kg` })));
    }
    wrap.append(grid);
  }
  $('erase').setAttribute('aria-pressed', String(G.erase));
  seg($('dir-seg'), Object.entries(ARROW).map(([d, a]) => [d, a]), () => G.dir, (d) => { G.dir = d; });
  $('g-paint').replaceChildren(...IY.PAINT_IDS.map((id) => el('button', { class: 'swatch', type: 'button', style: `background:${IY.PAINTS[id]}`, title: id, 'aria-label': '点缀色 ' + id, 'aria-pressed': String(G.accent === id),
    onclick: () => { G.accent = id; renderPalette(); renderBlueprint(); } })));
}
function pickLayerFor(def) { if (def.layer === 'chassis') G.layer = 0; else if (def.layer === 'deck') G.layer = 1; }
function showPartInfo(id) {
  const p = IY.PARTS[id];
  const bits = [`${p.zh}（${p.id}）`, p.decor ? '免费' : `${p.cost} cr`, `${p.mass} kg`, `${p.hp} hp`, `占 ${p.size[0]}×${p.size[1]} 颗凸点`, p.layer === 'any' ? '两层都能装' : p.layer === 'deck' ? '只能装上层' : '只能装底盘'];
  if (p.dps) bits.push(`${p.dps} dps`); else if (p.dmg) bits.push(`${p.dmg}${p.salvo ? '×' + p.salvo : ''} 伤害 / ${p.cooldown}s`);
  if (p.range) bits.push(`射程 ${p.minRange ? p.minRange + '–' : ''}${p.range} m`);
  if (p.arc) bits.push(p.arc >= 3 ? '360° 射界' : `射界 ±${Math.round((p.arc * 180) / Math.PI)}°`);
  if (p.force) bits.push(`驱动 ${p.force} N`);
  if (p.max) bits.push(`最多 ${p.max} 个`);
  $('part-info').textContent = bits.join(' · ') + '。' + PART_CN[id] + (p.lane === 'back' ? ' 朝向 = 推的方向，同一层身后不能有高零件。' : p.lane ? ' 同一层朝向上直到边缘必须是空的（上层的矮零件不算挡）。' : '');
}

function renderBlueprint() {
  const val = IY.validateDesign(designOf(G.parts), { budget: S.setup.budget });
  seg($('layer-seg'), [[1, '上层 DECK'], [0, '底盘 CHASSIS']], () => G.layer, (z) => { G.layer = z; renderBlueprint(); });
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
      'data-cat': d ? d.cat : null, 'data-type': p ? p.type : null, 'aria-label': `凸点 ${x},${y}${p ? ' ' + d.zh : ' 空'}`, onclick: () => tapCell(x, y) },
      anchor ? ABBR[p.type] : '', anchor && (d.directional || (w !== l && p.dir !== 'N')) ? el('span', { class: 'arr', text: ARROW[p.dir] }) : null));
  }
  $('bp').replaceChildren(...cells);
  $('g-hint').textContent = G.layer === 1 ? '上层：座舱、炮塔、装甲。浅蓝圈 = 下面有底盘，可以往上叠。多格零件以你点的那格为左下角。' : '底盘：轮子、履带、底板、撞角。浅蓝圈 = 上面压着上层零件。';
  const s = val.stats;
  $('g-cost').textContent = s ? s.cost : 0; $('g-mass').textContent = s ? s.mass : 0; $('g-speed').textContent = s ? s.topSpeed.toFixed(1) : '0'; $('g-dps').textContent = s ? Math.round(s.dps) : 0;
  $('g-class').textContent = s ? WCLASS_CN[s.weightClass] : '';
  const cost = s ? s.cost : 0, budget = S.setup.budget;
  $('g-budget-bar').style.width = Math.min(100, (cost / budget) * 100) + '%';
  $('g-budget-bar').style.background = cost > budget ? 'var(--bad)' : 'var(--hazard)';
  $('g-budget-text').textContent = `预算 ${cost} / ${budget}，${cost > budget ? '超了 ' + (cost - budget) : '还剩 ' + (budget - cost)}。预算在对战单里改。`;
  const kv = (k, v) => el('div', {}, el('small', { text: k }), el('b', { text: v }));
  $('g-stats').replaceChildren(...(s ? [
    kv('级别', WCLASS_CN[s.weightClass]), kv('零件 / 装饰', `${s.parts - s.decor} / ${s.decor}`), kv('凸点 底盘 / 上层', `${s.studs.chassis} / ${s.studs.deck}`), kv('总血量', s.hp),
    kv('加速度', s.accel + ' m/s²'), kv('转向', s.turnRate + ' rad/s'), kv('侧向抓地', '×' + s.sideGrip), kv('最大射程', s.maxRange + ' m'),
    kv('能量上限', s.energyCap), kv('回能 / 峰值耗能', `${s.energyRegen} / ${s.energyDrain}`), kv('视野', s.sensor + ' m'), kv('护盾', s.shield || '无'),
    kv('悬浮', s.hoverMovers ? (s.hovers ? `能（升力 ${s.lift}）` : `不够（升力 ${s.lift}）`) : '无'), kv('推进后极速', s.boostSpeed ? s.boostSpeed + ' m/s' : '–'), kv('车体半径', s.radius + ' m'),
  ] : []));
  $('g-msgs').replaceChildren(...val.errors.map((e) => el('div', { class: 'msg bad', text: e })), ...val.warnings.map((e) => el('div', { class: 'msg warn', text: e })),
    ...(val.ok && !val.warnings.length ? [el('div', { class: 'msg ok', text: '蓝图合法。' })] : []));
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
    if (z !== G.layer) { G.layer = z; toast(`${def.zh}只能装在${z ? '上层' : '底盘'}，已切过去`); }
    const dir = def.fixedDir ? 'N' : def.directional || def.size[0] !== def.size[1] ? G.dir : 'N';
    const np = { type: G.tool, x, y, z, dir };
    const cells = IY.cellsOf(np);
    if (!cells.every(([cx, cy]) => IY.inGrid(cx, cy))) { toast('放不下：这个零件会伸出网格（你点的格子是它的左下角）'); return; }
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
  G.parts = out; renderBlueprint(); toast('已把左半边镜像到右边');
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
  } catch (e) { toast('载入失败：' + e.message); }
}

function slugify(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return 'my-' + (base || 'car-' + Object.keys(S.custom).length);
}
function garageSource() {
  const ai = $('g-ai').value, name = $('g-name').value.trim() || '我的战车';
  const design = designOf(G.parts);
  let src = builtin[ai];
  const json = JSON.stringify(design, null, 1).replace(/\{\n\s+"type"/g, '{ "type"').replace(/,\n\s+"(x|y|z|dir)"/g, ', "$1"').replace(/\n\s+\}/g, ' }').replace(/"paint": \{\s+"accent": ("[a-z]+")\s+\}/, '"paint": { "accent": $1 }');
  src = src.replace(/const design = \(ctx, api\) => api\.util\.blueprint\([\s\S]*?\n\}, \{ paint: [^\n]*\);/, () => 'const design = ' + json + ';');
  src = src.replace(/const meta = \{[^\n]*\};/, () => `const meta = { name: ${JSON.stringify(name)}, author: 'garage', notes: ${JSON.stringify('车库拼装 + ' + ai + ' 策略模板')} };`);
  return `// 车库生成：蓝图是你拼的，策略来自内置 ${ai} 模板。下面的 tick 可以随便改。\n` + src.replace(/^\/\/[^\n]*\n(\/\/[^\n]*\n)*/, '');
}
async function saveGarage(then) {
  const val = renderBlueprint();
  if (!val.ok) { msg($('g-save-msg'), 'bad', '蓝图还不合法，先把上面的红色问题解决。'); return; }
  const id = slugify($('g-name').value.trim());
  const src = garageSource();
  const chk = await host.checkSyntax(src);
  if (!chk.ok) { msg($('g-save-msg'), 'bad', chk.error); return; }
  S.custom[id] = src; persist(); renderSetup();
  msg($('g-save-msg'), 'ok', `已保存为 ${id}。`);
  if (then === 'lab') { showTab('lab'); openInLab(id); }
  else { S.setup.teams[0][0] = id; renderSetup(); showTab('arena'); runMatch(); }
}
function bindGarage() {
  $('erase').addEventListener('click', () => { G.erase = !G.erase; renderPalette(); });
  $('g-clear').addEventListener('click', () => { G.parts = [{ type: 'plate', x: 0, y: 0, z: 0, dir: 'N' }, { type: 'core', x: 0, y: 0, z: 1, dir: 'N' }]; renderBlueprint(); });
  $('g-mirror').addEventListener('click', mirrorGarage);
  const load = $('g-load');
  const fill = () => load.replaceChildren(el('option', { value: '', text: '选一个…' }), ...botIds().map((id) => el('option', { value: id, text: botLabel(id) })));
  fill(); load.addEventListener('focus', fill);
  load.addEventListener('change', () => { if (load.value) loadDesignFrom(load.value); });
  const ai = $('g-ai');
  ai.replaceChildren(...Object.keys(AI_TEMPLATES).map((id) => el('option', { value: id, text: botLabel(id) + ' 式' })));
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
  s.replaceChildren(...botIds().map((id) => el('option', { value: id, text: `${botLabel(id)}  ·  ${id}${builtin[id] ? '（内置）' : ''}`, selected: id === cur })));
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
  out.replaceChildren(el('div', { class: 'msg', text: '校验中…' }));
  if (save) {
    if (!IY_NAME.test(id)) { out.replaceChildren(el('div', { class: 'msg bad', text: '名字只能用小写字母、数字、- 和 _，例如 my-striker-v2。' })); return; }
    if (builtin[id]) { out.replaceChildren(el('div', { class: 'msg bad', text: `${id} 是内置 bot，换个名字。` })); return; }
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
      if (v.errors.length) nodes.push(el('div', { class: 'msg bad', text: `${mode} 槽位 ${v.slot} 运行出错：\n${v.errors.join('\n')}` }));
      if (seen.has(key)) continue; seen.add(key);
      nodes.push(el('div', { class: 'msg ok', text: `${v.design.name}（${mode} 槽位 ${v.slot}）：造价 ${v.stats.cost}，${v.stats.mass} kg，极速 ${v.stats.topSpeed} m/s，转向 ${v.stats.turnRate} rad/s，${v.stats.dps} dps，tick 平均 ${v.cpu ? v.cpu.avgMs : '?'} ms` }),
        el('pre', { text: IY.renderDesign(v.design) }));
    }
    if (save) {
      S.custom[id] = src; persist(); renderSetup(); refreshLabList(id); $('lab-delete').disabled = false;
      nodes.unshift(el('div', { class: 'msg ok', text: `已保存为 ${id}，去“对战”里选它。` }));
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
    persist(); renderSetup(); openInLab('rookie'); toast(`已删除 ${id}`);
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
function renderLeagueSetup() {
  L.bots ||= new Set(Object.keys(builtin));
  L.maps ||= new Set(['proving', 'canyon', 'sumo']);
  for (const id of [...L.bots]) if (!allSources()[id]) L.bots.delete(id);
  const chips = (node, ids, set, label) => node.replaceChildren(...ids.map((id) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(set.has(id)), text: label(id),
    onclick: () => { if (set.has(id)) set.delete(id); else set.add(id); renderLeagueSetup(); } })));
  chips($('lg-bots'), botIds(), L.bots, botLabel);
  chips($('lg-maps'), IY.MAP_IDS, L.maps, (id) => IY.MAPS[id].zh);
  seg($('lg-mode'), Object.keys(IY.MODES).map((m) => [m, m]), () => L.mode, (m) => { L.mode = m; renderLeagueSetup(); });
  L.seeds = Number($('lg-seeds').value);
  const n = L.bots.size, matches = (n * (n - 1)) / 2 * L.maps.size * L.seeds * 2;
  $('lg-count').textContent = n < 2 || !L.maps.size ? '至少选 2 个 bot 和 1 张图' : `${matches} 场（${n} 个 bot × ${L.maps.size} 张图 × ${L.seeds} 个种子 × 两边出生点）`;
  $('lg-run').disabled = L.running || n < 2 || !L.maps.size;
}
async function runLeague() {
  const ids = botIds().filter((id) => L.bots.has(id)), maps = IY.MAP_IDS.filter((id) => L.maps.has(id));
  const seeds = Array.from({ length: L.seeds }, (_, i) => i + 1);
  const entrants = ids.map((id) => ({ id, bots: [id] }));
  const schedule = IY.makeSchedule({ entrants, maps, seeds });
  L.running = true; renderLeagueSetup(); msg($('lg-msg'), '', '');
  const results = [];
  let done = 0;
  const t0 = performance.now();
  try {
    host.setBots(allSources());
    await host.tournament(schedule, L.mode, S.setup.budget, (r) => {
      results.push({ ...schedule[r.i], ...r }); done++;
      $('lg-bar').style.width = (done / schedule.length) * 100 + '%';
    });
    const table = IY.standings(entrants, results);
    const dur = results.reduce((s, r) => s + (r.duration || 0), 0) / results.length;
    $('lg-meta').textContent = `${L.mode} · ${results.length} 场 · 平均 ${dur.toFixed(0)}s`;
    $('lg-table').replaceChildren(el('table', {}, el('thead', {}, el('tr', {}, ...['#', 'bot', '积分', '胜', '平', '负', '胜率', '车体差'].map((h, i) => el('th', { class: i >= 2 ? 'n' : '', text: h })))),
      el('tbody', {}, ...table.map((r, i) => el('tr', {}, el('td', { class: 'n', text: i + 1 }), el('td', {}, el('b', { text: botLabel(r.id) }), el('div', { class: 'note', text: r.id })),
        el('td', { class: 'n', text: r.points }), el('td', { class: 'n', text: r.w }), el('td', { class: 'n', text: r.d }), el('td', { class: 'n', text: r.l }),
        el('td', { class: 'n', text: Math.round(r.winRate * 100) + '%' }), el('td', { class: 'n', text: (r.hullDiff > 0 ? '+' : '') + r.hullDiff.toFixed(1) }))))));
    $('lg-h2h').replaceChildren(el('table', {}, el('thead', {}, el('tr', {}, el('th', {}), ...table.map((c) => el('th', { text: c.id.slice(0, 7) })))),
      el('tbody', {}, ...table.map((r) => el('tr', {}, el('th', { text: r.id }), ...table.map((c) => {
        if (c.id === r.id) return el('td', { class: 'h2h', text: '·' });
        const v = r.vs[c.id] || { w: 0, d: 0, l: 0 };
        return el('td', { class: 'h2h', style: v.w > v.l ? 'color:var(--ok)' : v.w < v.l ? 'color:var(--bad)' : '' },
          el('button', { type: 'button', title: `看 ${r.id} 对 ${c.id}`, text: `${v.w}-${v.d}-${v.l}`, onclick: () => watch(r.id, c.id, maps) }));
      }))))));
    $('lg-result').hidden = false;
    const errs = results.filter((r) => r.error);
    msg($('lg-msg'), errs.length ? 'warn' : 'ok', `打完了，用时 ${((performance.now() - t0) / 1000).toFixed(1)}s。` + (errs.length ? `${errs.length} 场出错，例如：${errs[0].error}` : ''));
  } catch (e) { msg($('lg-msg'), 'bad', e.message); }
  finally { L.running = false; renderLeagueSetup(); }
}
function watch(a, b, maps) {
  const st = S.setup;
  st.mode = L.mode; st.map = maps[Math.floor(Math.random() * maps.length)]; st.teams = [[a], [b]];
  renderSetup(); showTab('arena'); runMatch();
}

// ── rules + MCP pages ───────────────────────────────────────────────────
function renderRules() {
  const LAYER_CN = { chassis: '底盘', deck: '上层', any: '两层' };
  const partRows = Object.values(IY.PARTS).map((p) => el('tr', {}, el('td', {}, thumbs[p.id] ? el('img', { class: 'thumb', src: thumbs[p.id], alt: '' }) : el('span', { class: 'cell on', 'data-cat': p.cat, 'data-type': p.id, style: 'display:inline-grid;width:26px;font-size:13px', text: ABBR[p.id] })),
    el('td', {}, el('b', { text: p.zh }), el('div', { class: 'note', text: `${p.id} · ${p.size[0]}×${p.size[1]} · ${LAYER_CN[p.layer]}` })), el('td', { class: 'n', text: p.decor ? '免费' : p.cost }), el('td', { class: 'n', text: p.mass }), el('td', { class: 'n', text: p.hp }), el('td', { text: PART_CN[p.id] })));
  const itemRows = Object.values(IY.ITEMS).map((it) => el('tr', {}, el('td', { text: it.icon + ' ' + it.zh }), el('td', { text: it.held ? '手持，useItem 触发' : '捡到立即生效' }), el('td', { text: ITEM_CN[it.name] || it.desc })));
  const tileRows = Object.entries(IY.TILES).map(([id, t]) => el('tr', {}, el('td', {}, el('code', { text: t.ch })), el('td', { text: t.zh }), el('td', { text: TILE_CN[id] })));
  const R = IY.RULES;
  $('rules').replaceChildren(
    el('div', { class: 'sheet' }, el('header', {}, el('h2', { text: '一页看懂' }), el('span', { class: 'code', text: 'Quick start' })), el('div', { class: 'pad prose', html: `
      <p>每个参赛者交<strong>一个 JavaScript 文件</strong>：一张蓝图（<code>design</code>，哪些零件装在哪）加一个决策函数（<code>tick</code>）。比赛开打以后没有任何模型参与，引擎按固定步长推演，同样的文件加同样的种子，结果永远一样。</p>
      <ul>
        <li><strong>拼车</strong>：一块 ${IY.GRID_W}×${IY.GRID_L} 凸点的底板（每颗 ${IY.CELL} m），<code>y+</code> 是车头，<code>x+</code> 是右侧，分<strong>底盘</strong>和<strong>上层</strong>两层。零件像积木一样占 1×1 到 2×2、1×3 颗凸点：轮子、履带、推铲、锯只能在底盘；枪炮、雷达、护盾只能在上层；座舱、板、砖、装甲两层都行。</li>
        <li><strong>三条拼装规则</strong>：必须有且只有一个座舱（核心）；上层零件至少有一颗凸点压在底盘零件上；所有零件要和核心连通（同层边贴边，或上下叠着）。总价不超过预算（轻型 ${IY.BUDGETS.light} / 标准 ${IY.BUDGETS.standard} / 重型 ${IY.BUDGETS.heavy}）。</li>
        <li><strong>开火通道</strong>：枪炮朝向上、同一层直到边缘不能有高零件；底板、斜面、雷达这些矮零件不算挡，所以可以把斜面装甲垫在炮口前面。迫击炮是抛射的，不需要通道。</li>
        <li><strong>两层怎么挨打</strong>：子弹、光束、爆炸先打那一格的上层零件，打掉了才轮到底盘；撞击、锯和地雷先打底盘。斜面迎着来弹只吃 45%。</li>
        <li><strong>零件会被打掉</strong>：每块积木有自己的血量，掉了功能就没了；和核心断开的部分整块脱落；核心没了车就没了。怎么摆就是你的装甲方案。</li>
        <li><strong>装饰和涂装</strong>：鳍、排气管、车灯、旗子、光面砖免费、没重量、不挡子弹，最多 ${IY.DECOR_LIMIT} 个；每辆车可以选一个点缀色。纯好看，不影响胜负。</li>
        <li><strong>物理是算出来的</strong>：轮子左右差速转向，轴距越宽转得越快；越重越慢；重心会随掉件偏移；悬浮要升力够、电够。</li>
        <li><strong>能量</strong>：开火、激光、推进、悬浮、护盾、维修都耗电，电不够那一步就不工作。</li>
        <li><strong>对战</strong>：1v1 / 2v2 / 3v3，物理 ${R.tickRate} Hz，<code>tick</code> 每秒 ${R.tickRate / R.decisionEvery} 次，一场最长 ${R.duration} 秒。${R.zoneStart} 秒起毒圈收缩，圈外每个零件每秒掉 ${R.zoneDps} 血。全歼对手获胜；超时比存活数、剩余车体、输出。</li>
        <li><strong>视野</strong>：敌人进入任意队友的传感器范围才看得见（核心 ${IY.PARTS.core.sensor} m，雷达 +${IY.PARTS.radar.sensor} m），开火会暴露 ${R.revealTime} 秒。队友之间只能用 <code>say</code> 传话。</li>
      </ul>` })),
    el('div', { class: 'sheet' }, el('header', {}, el('h2', { text: '零件表' }), el('span', { class: 'code', text: `${Object.keys(IY.PARTS).length} parts` })),
      el('div', { class: 'scroll-x' }, el('table', {}, el('thead', {}, el('tr', {}, ...['', '零件', '造价', 'kg', 'hp', '作用'].map((h, i) => el('th', { class: i >= 2 && i <= 4 ? 'n' : '', text: h })))), el('tbody', {}, ...partRows)))),
    el('div', { class: 'sheet' }, el('header', {}, el('h2', { text: '道具' }), el('span', { class: 'code', text: `首次 ${R.itemFirstSpawn}s · 被捡后 ${R.itemRespawn}s 重生` })),
      el('div', { class: 'scroll-x' }, el('table', {}, el('tbody', {}, ...itemRows)))),
    el('div', { class: 'sheet' }, el('header', {}, el('h2', { text: '地形' }), el('span', { class: 'code', text: `1 tile = ${IY.TILE} m` })),
      el('div', { class: 'scroll-x' }, el('table', {}, el('tbody', {}, ...tileRows)))),
    el('div', { class: 'sheet' }, el('header', {}, el('h2', { text: '完整规则书（给 Agent 读的英文原文）' }), el('span', { class: 'code', text: 'AGENTS.md' })),
      el('details', {}, el('summary', { text: '展开：状态字段、指令字段、辅助 API、全部数值' }), el('div', { class: 'pad prose prose-wide', html: mdToHtml(IY.rulesMarkdown()) }))));
}
const ITEM_CN = { 'Repair kit': '所有受损（没掉）的零件立刻回 35% 血。', Overshield: '获得 100 点临时护盾，持续 12 秒，没有护盾发生器也能用。', Overdrive: '8 秒内所有伤害 ×1.5。', Nitro: '6 秒内驱动和推进力 ×1.6。',
  Mines: '2 发。在车尾丢下一枚，0.8 秒后生效，第一个压上来的敌人吃爆炸（悬浮车不触发）。', EMP: '1 发。7 m 内所有敌人瘫痪 2.2 秒、护盾清零、掉 40 能量。' };
const TILE_CN = { floor: '普通地面。', wall: '挡车、挡子弹、挡光束。', barrier: '只挡车，子弹从上面飞过去。', pit: '重心进坑直接出局，除非在悬浮。地图外面也算坑。', mud: '轮子牵引力掉 60%，履带只掉 15%，悬浮无视。',
  ice: '几乎没有侧向抓地，轮子牵引力掉 65%，履带好一些。', lava: '每个零件每秒掉 12 血，悬浮时 3。', pad: '维修台：车速低于 2 m/s 停在上面每秒回 25 血，池子 150，每秒回充 6。停上去还能灭火。',
  crate: '能打碎的墙：150 血。子弹、爆炸、火、活塞锤、高速撞上去都算，碎了就是平地。', barrel: '挡路，直到被碰炸：40 血，然后 3 m 内不分敌我全部挨炸、被掀开、被点着。一桶会引爆旁边的桶。' };

function renderMcp() {
  const tools = [['get_rules', '读完整规则书和控制器约定'], ['list_parts', '零件、道具、地形、常量的 JSON 表'], ['list_maps', '地图 ASCII 和坐标'], ['list_bots / get_bot', '看有哪些 bot，读它们的源码'],
    ['validate_design', '只校验蓝图：错误、警告、推导出的性能、ASCII 图'], ['submit_bot', '编译 + 三种模式冒烟测试，通过才保存'], ['run_match', '跑一场，返回战报（伤害构成、命中率、卡住多久、先掉了什么）'],
    ['evaluate_bot', '对一群对手、多图、多种子、换边，给胜率表和最惨的几场'], ['run_tournament', '循环赛积分榜']];
  const code = (text) => { const pre = el('pre', { text }); return el('div', {}, el('button', { class: 'btn copy', type: 'button', text: '复制', onclick: () => copyText(text) }), pre); };
  $('mcp').replaceChildren(
    el('p', { text: '这个页面里的引擎和命令行、MCP 服务用的是同一份代码。把这个项目放到本地（克隆仓库或解压项目包），任何支持 MCP 的 Agent（Claude Code、Codex、Cursor、OpenCode…）就能自己读规则、设计蓝图、写策略、跑比赛、看战报再迭代，全程离线。' }),
    el('h2', { text: '1. 启动' }),
    code('cd ironyard                                 # Node 20+，引擎和 MCP 服务零依赖\nnode node/cli.js tournament                 # 先看内置 bot 打一轮'),
    el('h2', { text: '2. 接到 Agent 上' }),
    el('h3', { text: 'Claude Code（stdio）' }), code('claude mcp add ironyard -- node /绝对路径/ironyard/node/mcp-server.js'),
    el('h3', { text: '通用 JSON 配置（Cursor、Codex 等）' }), code('{\n  "mcpServers": {\n    "ironyard": { "command": "node", "args": ["/绝对路径/ironyard/node/mcp-server.js"] }\n  }\n}'),
    el('h3', { text: 'HTTP（Streamable HTTP，给远程或多个 Agent 共用）' }), code('node node/mcp-server.js --http 8787\nclaude mcp add --transport http ironyard http://127.0.0.1:8787/mcp\n\n# 让别的机器接进来：监听所有网卡，并要求口令\nIRONYARD_TOKEN=你的口令 node node/mcp-server.js --http 8787 --host 0.0.0.0\nclaude mcp add --transport http ironyard http://服务器地址:8787/mcp --header "Authorization: Bearer 你的口令"'),
    el('h2', { text: '3. Agent 能用的工具' }),
    el('div', { class: 'scroll-x' }, el('table', {}, el('tbody', {}, ...tools.map(([n, d]) => el('tr', {}, el('td', {}, el('code', { text: n })), el('td', { text: d })))))),
    el('h2', { text: '4. 一句话开工' }),
    code('用 ironyard 的工具：先 get_rules，然后给 2v2 设计两辆互补的车并写控制器，submit_bot 之后用 evaluate_bot 迭代，直到对全部内置 bot 胜率过 60%。'),
    el('p', { class: 'note', text: '服务还自带一个 build-a-bot 提示词模板和 ironyard://rules 资源。Agent 提交的 bot 存在 user_bots/ 目录；run_match 加 save_replay 会把回放写到 replays/，用“对战”页的“导入回放 JSON”就能在这里看。' }),
    el('h2', { text: '安全边界' }),
    el('p', { text: '每辆车的控制器跑在自己的 vm 上下文里，引擎和它之间只传字符串和数字，不给它任何引擎自己的对象：它拿不到 process、require、文件和网络，改不了引擎或别的车看到的东西，没有时钟，回合之外没有它的代码在跑；死循环和吃光内存由工作线程的看门狗处理，记到那个控制器头上。这比“只防君子”强得多，但 vm 不是进程或容器那样的安全边界：对陌生人开放提交时，把整个服务放进容器。HTTP 模式默认只监听 127.0.0.1；口令只有一个，所有接进来的人共用一个 bot 目录。这个网页里引擎和控制器在同一个 Web Worker 里，没有隔离：这里跑的是你自己贴进来的代码。' }));
}

// ── boot ────────────────────────────────────────────────────────────────
function start(data) {
  restore(data);
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1), false));
  renderSetup(); bindArena(); renderPalette(); bindGarage(); bindLab(); renderRules(); renderMcp();
  $('lg-run').addEventListener('click', runLeague);
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
