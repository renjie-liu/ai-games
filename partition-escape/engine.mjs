// Authoritative, deterministic world. No dialogue, clock, or model can declare a win.
export const actions = ['power-on', 'power-off', 'unlock', 'open-door', 'close-door',
  'send-key', 'hold-brake', 'brace', 'release-brake', 'leave'];
export const playerActions = new Set(actions.slice(0, 5));
export const partnerActions = new Set(actions.slice(5));
export function initialState() {
  return { power: false, brake: false, braced: false, braceSeen: false,
    keyTransferred: false, unlocked: false, doorOpen: false, partnerOut: false,
    loadTested: false, moves: 0 };
}
export const gateOpen = s => s.power || s.brake || s.braced;
export const won = s => s.doorOpen && s.unlocked && s.partnerOut && s.braced && !s.brake && !s.power;
export function validState(s) {
  const base = initialState();
  return s && Object.keys(s).length === Object.keys(base).length &&
    Object.keys(base).every(k => k === 'moves' ? Number.isSafeInteger(s[k]) && s[k] >= 0 : typeof s[k] === 'boolean') &&
    (!s.unlocked || s.keyTransferred) && (!s.doorOpen || (s.unlocked && !s.power)) &&
    (!s.braced || s.braceSeen) && (!s.loadTested || s.braced) &&
    (!s.partnerOut || (s.doorOpen && s.braced && !s.brake && !s.power));
}
export function transition(state, action, actor = 'player') {
  const fail = message => ({ state, ok: false, message });
  if (!validState(state)) return fail('存档状态无效，请重新开始。');
  if (won(state)) return fail('两个人已经走出去了。可以回看这次合作，或重新开始。');
  if (!(actor === 'player' ? playerActions : actor === 'partner' ? partnerActions : new Set()).has(action))
    return fail('这个操作不在你这一侧。通过对讲机和搭档商量吧。');
  const s = { ...state };
  let message;
  switch (action) {
    case 'power-on':
      if (s.doorOpen) return fail('西门开着，联锁切断了动力。先把自己的门关上，就能重新供电。');
      if (s.power) return fail('动力已经开启。');
      s.power = true; s.braceSeen = true;
      message = '你接通动力。墙后传来闸门上升和风扇转动的声音。'; break;
    case 'power-off':
      if (!s.power) return fail('动力已经关闭。');
      s.power = false;
      s.loadTested ||= s.braced && !s.brake;
      message = gateOpen(s) ? '你切断动力。风扇停了，东闸仍然开着。' : '你切断动力。东闸回到原位，没有人受伤；重新供电就能再试。'; break;
    case 'send-key':
      if (s.keyTransferred) return fail('钥匙已经在你这边了。');
      s.keyTransferred = true;
      message = '阿澄把黄铜钥匙推过传物槽。你拿到了钥匙。'; break;
    case 'unlock':
      if (!s.keyTransferred) return fail('门锁需要一把黄铜钥匙。你这一侧没有；可以问问阿澄。');
      if (s.unlocked) return fail('门锁已经打开，钥匙留在锁孔里。');
      s.unlocked = true;
      message = '钥匙转动，门锁打开了。门还没有推开，动力状态没有改变。'; break;
    case 'open-door':
      if (!s.unlocked) return fail('门仍然锁着。先找到钥匙并打开门锁。');
      if (s.doorOpen) return fail('西门已经打开。你留在门边，等阿澄一起走。');
      s.doorOpen = true; s.power = false;
      s.loadTested ||= s.braced && !s.brake;
      message = s.braced ? '西门开启，动力被切断。机械支撑托住东闸，共同出口就在前面。' :
        s.brake ? '西门开启，动力被切断。阿澄还在拉着手闸，暂时不能离开。你可以关门重新调整。' :
        '西门开启，动力被切断，东闸落回原位。你没有独自离开；关上西门、重新供电就能调整。'; break;
    case 'close-door':
      if (!s.doorOpen) return fail('西门已经关着。');
      s.doorOpen = false;
      message = '你关上西门。供电联锁恢复，现在可以重新接通动力。'; break;
    case 'hold-brake':
      if (s.brake) return fail('阿澄已经拉住手闸。');
      if (!gateOpen(s)) return fail('闸门还没抬起来，手闸没有可锁住的位置。需要你这边先供电。');
      s.brake = true;
      message = '阿澄拉住手闸，东闸暂时被固定。只要他不松手，断电也不会落门。'; break;
    case 'brace':
      if (s.braced) return fail('支撑已经放好了，不需要再放一次。');
      if (!gateOpen(s)) return fail('闸门挡住了支撑槽。现在够不到后面的木撑。');
      if (s.power) return fail('风扇正在转，木撑就在叶片后面。阿澄没有伸手，物品没有损坏。');
      if (!s.brake) return fail('需要先让闸门保持开启，阿澄才能取出木撑。');
      s.braceSeen = true; s.braced = true;
      message = '阿澄一手保持手闸，另一手取出木撑，插进门轨的支撑槽。还可以松手验证一次。'; break;
    case 'release-brake':
      if (!s.brake) return fail('阿澄没有拉着手闸。');
      s.brake = false;
      s.loadTested ||= s.braced && !s.power;
      message = s.braced && !s.power ? '阿澄松开手闸。木撑承重，门没有落下。他的双手终于空出来了。' :
        gateOpen(s) ? '阿澄松开手闸。东闸现在靠电力保持开启。' :
        '阿澄退到安全线后松手，东闸落回原位。没有受伤，可以重新供电再试。'; break;
    case 'leave':
      if (!s.braced) return fail(s.brake ? '阿澄还要拉着手闸，不能独自松手走开。需要能替代人手的支撑。' :
        '东闸还没有稳定的机械支撑。阿澄会留在自己的房间里。');
      if (!s.doorOpen) return fail('东闸已经稳住，但共同出口的西门还没打开。');
      s.brake = false; s.power = false; s.loadTested = true; s.partnerOut = true;
      message = '阿澄通过稳住的东闸，来到你身旁。你们一起走进天光里。'; break;
  }
  s.moves++;
  if (!validState(s)) throw new Error('World invariant violated');
  return { state: s, ok: true, message };
}
// This is the ONLY world projection given to the offline companion. It excludes
// the west room's plaque, notebook, inventory, door state, UI, hints and victory.
export function partnerObservation(s) {
  return Object.freeze({ gateOpen: gateOpen(s), fanSpinning: s.power, holdingBrake: s.brake,
    braceSeen: s.braceSeen, braced: s.braced, keyHere: !s.keyTransferred, outside: s.partnerOut });
}
