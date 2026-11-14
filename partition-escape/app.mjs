import { initialState, transition, partnerObservation, validState, won } from './engine.mjs';
import { initialMemory, reply, localReport, actionName } from './partner.mjs';

const $ = id => document.getElementById(id);
const storageKey = 'partition-escape:v1';
const clone = value => structuredClone(value);
const fresh = () => ({ state: initialState(), memory: initialMemory(), started: false,
  selected: null, notes: [], log: [], hintLevel: 0 });
let game = fresh(), history = [], pending = null, modalKind = null, spoken = false, localVoice = null;
let renderedLog = '';
let restoreNotice = '';
const inspections = new Set(['power', 'door', 'plaque', 'hatch']);
function validGame(g) {
  return g && validState(g.state) && typeof g.started === 'boolean' &&
    (g.selected === null || inspections.has(g.selected)) &&
    g.memory && typeof g.memory.interlockReported === 'boolean' &&
    Number.isInteger(g.hintLevel) && g.hintLevel >= 0 && g.hintLevel <= 3 &&
    Array.isArray(g.notes) && g.notes.length <= 5 && g.notes.every(n =>
      n && ['power', 'plaque', 'east', 'support'].includes(n.id) &&
      ['title', 'body'].every(k => typeof n[k] === 'string' && n[k].length < 600)) &&
    Array.isArray(g.log) && g.log.length <= 100 && g.log.every(l =>
      l && ['partner', 'human', 'event'].includes(l.role) && typeof l.text === 'string' && l.text.length <= 1200);
}
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed.version !== 1 || !validGame(parsed.game)) throw new Error('Invalid save');
    game = parsed.game;
    // Only restore structurally valid, bounded snapshots. Unconfirmed proposals never survive reload.
    history = Array.isArray(parsed.history) ? parsed.history.filter(validGame).slice(-30) : [];
    restoreNotice = '已恢复本机进度。未确认的搭档动作不会自动执行。';
  }
} catch { restoreNotice = '旧进度无法读取，已安全回到开场。'; }

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, onClick, className = 'action-btn') {
  const b = el('button', text, className); b.type = 'button'; b.addEventListener('click', onClick); return b;
}
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, game, history }));
    $('save-status').textContent = game.started ? '进度已保存在本机 · 不上传对话' : '文字沟通，无需麦克风';
  } catch { $('save-status').textContent = '浏览器未允许保存 · 关闭页面会丢失进度'; }
}
function checkpoint() { history.push(clone(game)); history = history.slice(-30); }
function feedback(text, warning = false) {
  $('feedback-text').textContent = text; $('feedback').classList.toggle('warning', warning);
}
function stopSpeech() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
function say(text) {
  stopSpeech();
  if (!spoken || !localVoice || modalKind) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = localVoice; utterance.lang = localVoice.lang; utterance.rate = 1;
  speechSynthesis.speak(utterance);
}
function addLog(role, text) {
  game.log.push({ role, text }); game.log = game.log.slice(-100);
  if (role === 'partner') { say(text); $('unread').hidden = false; }
}
function note(id, title, body) {
  const entry = { id, title, body }, i = game.notes.findIndex(n => n.id === id);
  if (i < 0) game.notes.push(entry); else game.notes[i] = entry;
}
function report() {
  // Deliberately no world/notes/context argument to the companion except its allowed projection.
  const observation = partnerObservation(game.state);
  const text = localReport(observation);
  addLog('partner', text);
  if (observation.braceSeen) note('east', '阿澄的发现', '东闸后的木撑被风扇挡住。阿澄能操作手闸，但不能控制供电。');
  if (observation.braced) note('support', '支撑已经入槽', '木撑可以代替人手。断电并松开手闸，才能验证它是否真正承重。');
}
function blocked() { return !game.started || Boolean(modalKind) || won(game.state); }
function perform(action, actor) {
  if (blocked()) return;
  stopSpeech();
  const before = partnerObservation(game.state);
  const result = transition(game.state, action, actor);
  pending = null;
  if (result.ok) {
    checkpoint(); game.state = result.state; addLog('event', result.message);
    const after = partnerObservation(game.state);
    if (JSON.stringify(before) !== JSON.stringify(after)) report();
  }
  feedback(result.message, !result.ok); render(); save();
  if (won(game.state)) showWin();
  else if (actor === 'partner') $('message').focus({ preventScroll: true });
  else ($('object-detail').querySelector('button:not(:disabled)') || $('room-controls')).focus({ preventScroll: true });
}
function send(text) {
  if (blocked()) return;
  const input = String(text).trim().slice(0, 240);
  if (!input) return;
  stopSpeech(); checkpoint(); pending = null;
  addLog('human', input);
  const answer = reply(input, partnerObservation(game.state), game.memory);
  game.memory = answer.memory; addLog('partner', answer.text);
  pending = answer.proposal;
  $('message').value = '';
  feedback(answer.proposal ? '阿澄提出了一个动作。检查对讲机下方的确认卡；未确认前，房间不会变化。' : '消息已传到另一侧。房间状态没有改变。');
  render(); save();
}
function sharePlaque() { send('我看到铭牌：西门打开会切断动力，东闸必须有机械支撑。'); }

function inspect(id, moveFocus = false) {
  if (blocked() || !inspections.has(id)) return;
  game.selected = id;
  if (id === 'power') note('power', '一套共用的动力', '供电台同时驱动东侧闸门与风扇。开关不需要一直按着。');
  if (id === 'plaque') note('plaque', '西门的联锁铭牌', '推开西门会切断动力；东闸需要独立的机械支撑。阿澄看不到这块铭牌。');
  render(); save();
  if (moveFocus) $('room-controls').focus({ preventScroll: false });
}
function renderDetail() {
  const box = $('object-detail'); box.replaceChildren();
  const s = game.state, id = game.selected;
  let title = '从一个小发现开始', text = '先点一个物件。你看到的线索不会自动传给阿澄。';
  const controls = el('div', undefined, 'object-actions');
  const act = (label, action, enabled = true) => {
    const b = button(label, () => perform(action, 'player'), 'action-btn strong');
    b.disabled = !enabled || blocked(); controls.append(b);
  };
  if (id === 'power') {
    title = s.power ? '供电台 · 动力已开启' : '供电台 · 动力已关闭';
    text = s.doorOpen ? '出口门开着，联锁切断了动力。关上西门即可重新供电。' :
      '接通后，东侧闸门和风扇会一起启动。操作后保持状态，不用持续按住。';
    act(s.power ? '切断动力' : '接通动力', s.power ? 'power-off' : 'power-on', !s.doorOpen);
  } else if (id === 'door') {
    title = s.doorOpen ? '出口门 · 已开启' : s.unlocked ? '出口门 · 门锁已打开' : '出口门 · 上着锁';
    text = s.doorOpen ? '天光就在门外。你留在门边，等待另一侧的搭档。' : s.unlocked ?
      '钥匙留在锁孔里。打开门以前，可以先查看旁边的铭牌。' : s.keyTransferred ?
        '黄铜钥匙与锁孔吻合。开锁和推门是两个动作。' : '门锁需要一把黄铜钥匙。你这一侧没有钥匙；问问隔壁的阿澄。';
    if (!s.unlocked) act('用钥匙开锁', 'unlock', s.keyTransferred);
    else act(s.doorOpen ? '关上西门' : '推开西门', s.doorOpen ? 'close-door' : 'open-door');
    if (!s.keyTransferred) controls.append(button('向阿澄询问钥匙', () => send('能把钥匙递给我吗？')));
  } else if (id === 'plaque') {
    title = '联锁铭牌 · 只有你看得见';
    text = '“西门开启，切断整段动力。东闸须有独立机械支撑，方可撤离。”旁边画着门与电源之间的连线。';
    controls.append(button(game.memory.interlockReported ? '再向阿澄说明' : '把这条发现告诉阿澄', sharePlaque, 'action-btn strong'));
  } else if (id === 'hatch') {
    title = s.keyTransferred ? '传物槽 · 钥匙已收到' : '传物槽 · 连着隔壁';
    text = s.keyTransferred ? (s.unlocked ? '钥匙已经插在出口门的锁上。' : '黄铜钥匙收在这里，去出口门使用即可。') :
      '槽里暂时空着。它可以递小物件，但看不到另一侧的房间。';
    controls.append(button('问问另一侧的情况', () => send('你那边有什么？')));
  }
  const copy = el('div'); copy.append(el('h3', title), el('p', text)); box.append(copy, controls);
  for (const b of controls.querySelectorAll('button')) if (blocked()) b.disabled = true;
}
function renderChat() {
  const log = $('chat-log'), signature = JSON.stringify(game.log);
  if (signature !== renderedLog) {
    const old = renderedLog ? JSON.parse(renderedLog) : [];
    const appending = old.length <= game.log.length && old.every((l, i) => l.role === game.log[i].role && l.text === game.log[i].text);
    if (!appending) log.replaceChildren();
    for (const l of game.log.slice(appending ? old.length : 0)) {
      const row = el('div', undefined, `chat-msg ${l.role}`);
      row.append(el('small', l.role === 'human' ? '你 · 西间' : l.role === 'partner' ? '阿澄 · 东间' : '现场反馈'), el('p', l.text));
      log.append(row);
    }
    renderedLog = signature; log.scrollTop = log.scrollHeight;
  }
  const proposal = $('proposal'); proposal.replaceChildren(); proposal.hidden = !pending;
  if (pending) {
    proposal.append(el('small', '待你确认 · 尚未执行'), el('p', actionName(pending)));
    const buttons = el('div', undefined, 'proposal-actions');
    buttons.append(button('确认这个动作', () => { const action = pending; if (action) perform(action, 'partner'); }, 'action-btn strong'),
      button('先等等', () => { pending = null; stopSpeech(); feedback('已取消这次动作，双方保持原状。'); render(); }));
    proposal.append(buttons);
  }
  const prompts = $('quick-prompts'); prompts.replaceChildren();
  if (game.started && !won(game.state)) {
    prompts.append(button('你那边现在怎样？', () => send('你那边现在怎样？')));
    if (game.notes.some(n => n.id === 'plaque') && !game.memory.interlockReported)
      prompts.append(button('分享铭牌上的发现', sharePlaque));
  }
}
function renderNotes() {
  $('note-count').textContent = game.notes.length;
  const notes = $('notes'); notes.replaceChildren();
  if (!game.notes.length) notes.append(el('p', '查看过的重要线索会留在这里，不必靠记忆。', 'empty-note'));
  for (const n of game.notes) {
    const item = el('article', undefined, 'note');
    item.append(el('small', n.id === 'east' || n.id === 'support' ? '搭档已告诉你' : n.id === 'plaque' && game.memory.interlockReported ? '你的观察 · 已分享' : '你的观察'),
      el('h3', n.title), el('p', n.body));
    if (n.id === 'plaque' && !won(game.state)) item.append(button('告诉阿澄 →', sharePlaque));
    notes.append(item);
  }
}
function render() {
  const s = game.state, done = won(s);
  $('welcome').hidden = game.started;
  $('message').disabled = !game.started || done;
  $('send').disabled = !game.started || done;
  $('pause').disabled = !game.started || done;
  $('hint').disabled = !game.started || done;
  $('undo').disabled = history.length === 0;
  $('room-status').textContent = done ? '共同出口 · 已抵达' : s.doorOpen ? '西门开启 · 等待搭档' : s.power ? '动力已开启' : '动力已关闭';
  $('goal').textContent = done ? '两个人都出来了' : '让两个人一起抵达出口';
  $('partner-status').textContent = !game.started ? '还没有接通对讲机' : done ? '已和你会合' :
    s.braced ? '机械支撑已安装' : s.brake ? '正在保持手闸' : '在东间，等你交换发现';
  $('power-bulb').setAttribute('fill', s.power ? '#e8cd69' : '#858b75');
  $('power-line').setAttribute('stroke', s.power ? '#ead08c' : '#abaf8f');
  $('power-handle').setAttribute('transform', s.power ? 'rotate(-50 202 333)' : '');
  $('daylight-door').setAttribute('opacity', s.doorOpen ? '1' : '0');
  $('door-leaf').setAttribute('opacity', s.doorOpen ? '0' : '1');
  $('light-spill').setAttribute('opacity', s.doorOpen ? '.55' : '0');
  $('key-art').setAttribute('opacity', s.keyTransferred && !s.unlocked ? '1' : '0');
  for (const b of document.querySelectorAll('[data-inspect]')) {
    b.disabled = !game.started || done;
    b.classList.toggle('selected', b.dataset.inspect === game.selected);
    b.setAttribute('aria-pressed', String(b.dataset.inspect === game.selected));
  }
  renderDetail(); renderChat(); renderNotes();
}

function openModal(kind, title, paragraphs, actions = []) {
  stopSpeech(); modalKind = kind;
  const body = $('modal-body'); body.replaceChildren();
  const heading = el('h2', title, 'modal-title'); heading.id = 'modal-title'; body.append(heading);
  for (const p of paragraphs) body.append(el('p', p));
  const controls = el('div', undefined, 'modal-actions');
  for (const [label, action, strong] of actions) controls.append(button(label, action, strong ? 'primary' : 'action-btn'));
  body.append(controls);
  if (!$('modal').open) $('modal').showModal();
}
function closeModal() { $('modal').close(); modalKind = null; }
function showHelp() {
  openModal('help', '两边的发现，拼成一条退路。', [
    '点击房间里的标记或下方物件，查看你能观察、操作的东西。阿澄只能看到东间；重要发现可以通过文字或“分享”按钮告诉他。',
    '对讲机接受常见自然语言意图，例如询问现场、递物、保持或松开机关。搭档动作会先显示确认卡；不理解时会澄清，不猜着执行。这是规则模拟，不是真实语言模型。',
    '没有倒计时。随时停下、回看笔记，或撤回上一步。错误操作不会伤人，提前开门也可以关门重试。Enter 发送，Shift+Enter 换行，Tab 导航，Esc 关闭弹窗。',
    '当前没有语音识别，不使用麦克风。若浏览器提供已安装的本地中文声音，可选择朗读字幕；输入文字或暂停会立即停止朗读。不调用云端语音服务。'
  ], [['知道了', closeModal, true]]);
}
function showHint() {
  const level = Math.min(3, game.hintLevel + 1);
  const hints = [
    '先弄清两件事：你这边打开出口会怎样？另一侧除了闸门，还有什么？观察铭牌，再问阿澄。',
    '同一套动力既抬门又转风扇。可以让阿澄暂时保持门，再停电取物；最终需要一种不占人手的支撑。',
    '一条可行顺序：接通动力 → 请阿澄拉住手闸 → 切断动力 → 请他取出并放好木撑 → 松手验证。拿到钥匙、开锁并推门后，再约他一起离开。'
  ];
  openModal('hint', `提示 ${level} / 3`, [level === 1 ? '这一条只指方向，不给操作顺序。' : level === 2 ? '这一条会解释机关之间的关系。' : '这一条会给出完整解法。',
    '是否查看？提示不会执行任何动作。'], [
    ['先自己试试', closeModal, false], ['查看这一条', () => {
      game.hintLevel = level; save();
      openModal('hint', `提示 ${level} / 3`, [hints[level - 1]], [['继续探索', closeModal, true]]);
    }, true]
  ]);
}
function showWin() {
  openModal('win', '这一次，谁也没有落下。', [
    '木撑托住东闸，西门已经打开。阿澄来到你身旁，两个人一起走出了旧站房。',
    `你们完成了 ${game.state.moves} 次有效操作。你负责供电与西门；阿澄负责手闸、取物与支撑。${game.memory.interlockReported ? '你分享的联锁信息也进入了共同计划。' : '你没有通过对讲机分享铭牌；仍然靠机关配合完成了撤离。'}`,
    '这一关哪里让你改变了原来的计划？另一侧哪项发现或操作，是你自己做不到的？',
    '本次搭档为离线规则模拟。通关验证了机关闭环，并不代表真实模型合作能力已通过测试。'
  ], [['回看这次合作', closeModal, true], ['再玩一次', restart, false]]);
}
function restart() {
  closeModal(); stopSpeech(); game = fresh(); history = []; pending = null;
  $('unread').hidden = true;
  $('message').value = ''; render(); save(); feedback('新的开始。观察不消耗回合，也没有时间限制。'); $('start').focus();
}
$('start').addEventListener('click', () => {
  game.started = true; report(); render(); save();
  feedback('对讲机接通了。先查看你的房间，或直接问阿澄另一侧的情况。');
  document.querySelector('.object-tabs button').focus({ preventScroll: true });
});
for (const b of document.querySelectorAll('[data-inspect]'))
  b.addEventListener('click', () => inspect(b.dataset.inspect, b.classList.contains('hotspot')));
$('chat-form').addEventListener('submit', event => { event.preventDefault(); send($('message').value); });
$('message').addEventListener('input', stopSpeech);
$('message').addEventListener('focus', () => { $('unread').hidden = true; });
$('jump-room').addEventListener('click', () => {
  if (!game.started) $('start').focus();
  else $('room-controls').focus();
});
$('jump-chat').addEventListener('click', () => {
  $('unread').hidden = true;
  if (game.started && !won(game.state)) $('message').focus();
  else document.querySelector('.partner-panel').scrollIntoView({ block: 'start' });
});
$('message').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send($('message').value); }
});
$('help').addEventListener('click', showHelp);
$('pause').addEventListener('click', () => openModal('pause', '停在这里，也没关系。',
  ['双方和机关都保持原状。没有倒计时，你可以随时回来。'], [['继续这一关', closeModal, true]]));
$('restart').addEventListener('click', () => openModal('restart', '重新开始这一关？',
  ['这会清空本机保存的本关进度、笔记和对讲记录。'], [['保留进度', closeModal, false], ['重新开始', restart, true]]));
$('hint').addEventListener('click', showHint);
$('undo').addEventListener('click', () => {
  if (modalKind || !history.length) return;
  stopSpeech(); game = history.pop(); pending = null;
  render(); save(); feedback('已撤回上一步。房间、搭档记忆和对讲记录一起恢复；待确认动作已取消。');
});
$('modal-close').addEventListener('click', closeModal);
$('modal').addEventListener('cancel', () => { modalKind = null; });
$('modal').addEventListener('close', () => { modalKind = null; });
function refreshVoices() {
  localVoice = speechSynthesis.getVoices().find(v => v.localService === true && /^zh([_-]|$)/i.test(v.lang)) || null;
  $('sound').disabled = !localVoice;
  $('sound').textContent = localVoice ? spoken ? '朗读已开' : '朗读已关' : '朗读不可用';
  $('sound').setAttribute('aria-pressed', String(spoken));
}
if ('speechSynthesis' in window) {
  refreshVoices(); speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  $('sound').addEventListener('click', () => {
    spoken = !spoken; stopSpeech(); refreshVoices();
    if (spoken) say('朗读已开启。开始输入即可打断。所有内容也会保留为文字。');
  });
}
window.addEventListener('pagehide', stopSpeech);
render();
if (restoreNotice) feedback(restoreNotice);
save();
