// Explicit OFFLINE RULE STUB, not an LLM. It only receives the east-room view
// and messages intentionally sent by the human. Never import global world/UI.
export const initialMemory = () => ({ interlockReported: false });
const names = { 'send-key': '递来黄铜钥匙', 'hold-brake': '拉住手闸', brace: '取出并放好木撑',
  'release-brake': '退到安全线后松开手闸', leave: '前往共同出口' };
export const actionName = action => names[action] || action;
export function localReport(o) {
  if (o.outside) return '我已经出来了。谢谢你没有只打开自己的门。';
  if (o.braced) return o.holdingBrake ? '木撑已经入槽。我还拉着手闸，可以先松手看看它是否承重。' :
    '木撑托住了门，我现在可以走开。你那边的出口准备好了吗？';
  if (o.holdingBrake) return o.fanSpinning ? '我扶着手闸，但风扇还在转，不能取后面的木撑。电源在你那边。' :
    '手闸撑着门，风扇也停了。现在我能拿到叶片后面的木撑。';
  if (o.gateOpen) return '门抬起来了，但风扇也在转。叶片后面有根木撑。我能拉住手闸，让门暂时保持开启。';
  return `我在东间，出口被闸门挡住。我能操作手闸，不能控制动力。${o.keyHere ? '这里还有一把黄铜钥匙，可以从传物槽递给你。' : '钥匙已递给你；你那边有控制动力的机关吗？'}`;
}
export function reply(input, observation, memory = initialMemory()) {
  const text = String(input).trim().toLowerCase();
  const o = observation;
  const m = { ...memory };
  const answer = (line, proposal = null) => ({ text: line, proposal, memory: m });
  if (!text) return answer('我在。你想问现场情况，还是让我试一个动作？');
  // Questions about mechanics are explanations, never implicit action requests.
  if (/(开门|出口|西门|door).*(断电|切断|掉电|关电|power)/.test(text) &&
      !/(不会|不切断|不断电|不掉电|吗|是否|是不是|\?)/.test(text)) {
    m.interlockReported = true;
    return answer('原来你那边开门会断电，这块铭牌我看不到。那只靠电力抬门不够，我得先找到能替代人手的支撑。' +
      (o.braceSeen ? '我这边的木撑也许能用。' : '先看看闸门后面有什么。'));
  }
  if (/(如果|要是|当.*时|等.*再|先.+再|然后|if |then )/.test(text))
    return answer('我还不能可靠执行条件句或一串动作。我们一次确认一步：先问我现场情况，或说“请拉住手闸”。');
  if (/(不要|不能|别|不许|先不|暂不|不要再|don.t|do not|not yet)/.test(text))
    return answer('好，我保持现状，不执行新的动作。需要继续时，告诉我一个具体动作。');
  if (/(为什么|为何|会怎样|会怎么样|会发生|有.*风险|是不是|是否|how |why |what happens)/.test(text))
    return answer(localReport(o) + (m.interlockReported ? '你告诉过我开门会切断动力，所以需要验证不靠供电也能撑住门。' : '你那边的机关规则，我需要听你说。'));
  const intents = [];
  if (/(钥匙|key)/.test(text) && /(给|递|送|拿|交|要|pass|send|give|can i|need)/.test(text)) intents.push('send-key');
  if (/(手闸|闸门|门|brake|gate)/.test(text) && /(拉住|扶住|按住|抓住|固定住|帮我撑|hold|keep.*open)/.test(text)) intents.push('hold-brake');
  if (/(木撑|支撑杆|支撑物|木楔|木头|brace|wedge)/.test(text) && /(拿|取|放|装|插|用|固定|get|take|put|install|place)/.test(text)) intents.push('brace');
  if (/(松开|松手|放开|release|let go)/.test(text)) intents.push('release-brake');
  if (/(一起走|一起出去|一起离开|出发|过来|出来吧|你也走|leave|let.s go|come out)/.test(text)) intents.push('leave');
  if (intents.length > 1) return answer('这里有不止一个动作。为免顺序理解错，请一次只确认一个；我先保持原状。');
  const intent = intents[0];
  if (intent) {
    if (intent === 'hold-brake' && !o.gateOpen) return answer('手闸只能锁住已经抬起的门。你能先接通动力吗？');
    if (intent === 'brace' && !o.braceSeen) return answer('我还没看见木撑的位置。现在闸门挡着视线，不能凭空拿到它。');
    if (intent === 'brace' && o.fanSpinning) return answer('木撑在风扇后，风扇仍在转。我不会伸手。你能控制供电，我能操作手闸。');
    return answer(`我理解的是：${names[intent]}。你确认后我再动手。`, intent);
  }
  if (/(开门|关门|开电|断电|电源|动力)/.test(text))
    return answer('动力开关和西门在你那边，我不能替你操作。点房间里的对应物件即可；你拿不准时，我们可以先对照现场。');
  if (/(情况|看见|看到|有什么|现状|现在|观察|你能|怎么办|下一步|帮忙|帮助|提示|你好|在吗|hello|help|status|look|see)/.test(text))
    return answer(localReport(o));
  return answer('这句话我还没理解清楚。这个离线规则搭档只识别常见意图；可以问“你那边有什么”，或用一句话说想让我做什么。我不会猜着执行。');
}
