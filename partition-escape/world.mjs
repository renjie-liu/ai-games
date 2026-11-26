// Server only. Private facts never ship as JavaScript to a player browser.
import {randomBytes} from 'node:crypto';
import {initialState, transition, gateOpen, won, playerActions, partnerActions} from './engine.mjs';

export const opposite = s => s === 'west' ? 'east' : 'west';
// Actions that change the other room too: one seat proposes, the other confirms.
export const SHARED = new Set(['power-off','open-door','send-key']);
export const names = {west:'西席', east:'东席'};
export const labels = {'power-on':'接通动力','power-off':'切断动力',unlock:'转动钥匙','open-door':'推开西门','close-door':'关上西门',
  'send-key':'递出钥匙','hold-brake':'拉住手闸',brace:'取出并安装木撑','release-brake':'松开手闸',leave:'走向共同出口'};
const props = {
  west:[{id:'plaque',name:'出口铭牌',kind:'plaque',position:[-2,1.6,-2.5]},
    {id:'power',name:'动力台',kind:'console',position:[-2,0.5,0.3]},
    {id:'door',name:'西门',kind:'door',position:[0.5,0,-2.7]},
    {id:'hatch',name:'传物槽',kind:'hatch',position:[2.6,0.9,0.1]}],
  east:[{id:'gate',name:'升降闸',kind:'gate',position:[0,0,-2.6]},
    {id:'brake',name:'手闸',kind:'lever',position:[1.9,0.6,-0.4]},
    {id:'fan',name:'检修风扇',kind:'fan',position:[-1.8,1.3,-2.6]},
    {id:'hatch',name:'传物槽',kind:'hatch',position:[-2.6,0.9,0.1]}]
};
// What a seat can see of the state from inside its own room.
const localOf = (role,s) => role==='west' ? {power:s.power,keyHere:s.keyTransferred,unlocked:s.unlocked,doorOpen:s.doorOpen} :
  {gateOpen:gateOpen(s),fanSpinning:s.power,holdingBrake:s.brake,braceSeen:s.braceSeen,braced:s.braced,keyHere:!s.keyTransferred,outside:s.partnerOut};
function fact(seat,id,s) {
  const facts = seat === 'west' ? {
    plaque:['interlock','西门一旦推开，两侧动力立即断开。关门可恢复联锁。两个人必须一起走。'],
    power:['coupling','这个开关同时驱动隔壁的升降闸和检修风扇，不能分别供电。'],
    door:['west-exit','西门需要黄铜钥匙；开锁和推门是两个独立动作。'],
    hatch:['west-hatch','传物槽能从东侧送来小物件。西间原先没有钥匙。']
  } : {
    gate:['gate-rule','闸门靠动力抬升，断电会落下。轨道上有机械支撑槽。'],
    brake:['brake-rule','手闸只能固定已经升起的闸门；我拉着它时不能离开，但还能用另一只手取物。'],
    fan:s.braceSeen ? ['brace-found','闸门后露出一块木撑，藏在风扇叶片后。风扇停转且手闸保持时，才能安全取出并安装。'] : ['fan-rule','检修风扇与闸门连着同一条动力轴。闸门升起后才能看清后面的检修格。'],
    hatch:['key-found','黄铜钥匙原先挂在东间传物槽旁，可以从这里递给西席。']
  };
  const f=facts[id]; return f && {id:f[0],object:id,source:names[seat],text:f[1]};
}
export class Room {
  constructor(controllers={west:'human',east:'script'}) {
    if(!['west','east'].every(s=>['human','script','model','live'].includes(controllers[s]))) throw Error('无效控制器');
    this.id=randomBytes(8).toString('hex'); this.controllers={...controllers}; this.state=initialState();
    this.tokens=Object.fromEntries(['west','east','watch'].map(s=>[s,randomBytes(24).toString('base64url')]));
    this.notes={west:[],east:[]}; this.shared=[]; this.messages=[]; this.events=[]; this.rev=0;
    this.paused=false; this.pending=null; this.hints={west:0,east:0}; this.worker={}; this.signals={}; this.created=Date.now();
    // Counts changes of the room itself: a mechanism moved, a proposal came or went, play paused or
    // resumed. `rev` counts every event, a look or a message included; this does not.
    this.changes=0;
    this.event('system','ready','两侧已接通。先查看自己房间里的物件，再把发现告诉另一侧。','rules');
  }
  role(token){return Object.keys(this.tokens).find(s=>this.tokens[s]===token);}
  // What confirming the waiting proposal right now would change in `role`'s own room, by the same
  // rules that will decide it: only what that seat can see, and only what would differ. Null when
  // nothing waits for this seat. A seat can foresee this from the facts of its own objects; said
  // outright, it is not left to be worked out wrongly (a gate dropped by a confirmation given too soon).
  preview(role){
    const p=this.pending;if(!p||p.from===role)return null;
    const trial=transition(this.state,p.action,p.from==='west'?'player':'partner');if(!trial.ok)return null;
    const now=localOf(role,this.state),then=localOf(role,trial.state);
    return Object.fromEntries(Object.keys(then).filter(k=>then[k]!==now[k]).map(k=>[k,then[k]]));
  }
  // What a seat learns by simply looking around its own room: the current fact of each of its own
  // objects goes into its notes. No event and no revision, because nothing in the world changed.
  // For the voice partner, which cannot spend a turn on every object before it can be of any help.
  look(role){
    for(const p of props[role]||[]){
      const f=fact(role,p.id,this.state);
      if(f&&!this.notes[role].some(n=>n.id===f.id))this.notes[role].push(f);
    }
  }
  event(seat,type,text,source=this.controllers[seat]||'rules',details={}) {
    if(source==='live'&&this.liveFixture)source='offline-fixture';
    this.rev++; this.events.push({id:this.rev,at:new Date().toISOString(),seat,type,text,source,...details});
    if(this.events.length>400)this.events.shift();
  }
  view(role) {
    if(!['west','east','watch'].includes(role))throw Error('没有该席位权限');
    const base={id:this.id,role,rev:this.rev,paused:this.paused,complete:won(this.state),controllers:this.controllers,
      goal:'让两个人都走到墙外',pending:this.pending,messages:this.messages.slice(-40),shared:this.shared,
      events:this.events.slice(-60),signals:this.signals,worker:this.worker};
    // Public physical outcomes only; no private inventory, plaque, mechanism facts or legal-action oracle.
    if(role==='watch')return {...base,public:{doorOpen:this.state.doorOpen,gateOpen:gateOpen(this.state),power:this.state.power,escaped:won(this.state)},scene:[],notes:[]};
    const s=this.state;
    const local=localOf(role,s);
    const inspected=new Set(this.notes[role].map(n=>n.object));
    const objectActions=role==='west'? {power:[s.power?'power-off':'power-on'],door:[!s.unlocked?'unlock':s.doorOpen?'close-door':'open-door']} :
      {hatch:!s.keyTransferred?['send-key']:[],brake:[s.brake?'release-brake':'hold-brake'],fan:s.braceSeen&&!s.braced?['brace']:[],gate:['leave']};
    return {...base,local,notes:this.notes[role],hintLevel:this.hints[role],scene:props[role].map(p=>({...p,inspected:inspected.has(p.id),
      actions:(objectActions[p.id]||[]).map(id=>({id,label:labels[id],shared:SHARED.has(id)}))}))};
  }
  command(role,c) {
    const before=this.rev, pending=this.pending, physics=this.publicPhysics();
    const result=this.dispatch(role,c);
    const action=c?.type==='action' && Object.hasOwn(labels,c.id) ? c.id :
      ['accept','decline','cancel'].includes(c?.type) && pending?.id===c.id ? pending.action : null;
    const commandLabel=action ? `${({accept:'确认：',decline:'暂缓：',cancel:'撤回：'})[c.type]||''}${labels[action]}` :
      ({inspect:'查看本侧物件',share:'主动分享已发现线索',say:'发送消息',hint:'请求本席提示',pause:'暂停/恢复'})[c?.type]||'未支持的操作';
    const events=this.events.filter(e=>e.id>before);
    const outcome=!result.ok ? result.retryable?'waiting':'rejected' :
      events.some(e=>e.type==='request')?'proposed':events.some(e=>e.type==='action')?'applied':'recorded';
    const after=this.publicPhysics();
    const changes=Object.fromEntries(Object.keys(after).filter(k=>after[k]!==physics[k]).map(k=>[k,after[k]]));
    // A separate, server-authored public receipt; never echo input prose, private facts or rejection details.
    const receipt={requestId:randomBytes(12).toString('hex'),source:'rules',seat:role,
      command:commandLabel,outcome,code:result.code||(!result.ok?'rule_rejected':'ok'),
      roomEventIds:events.map(e=>e.id),changes,
      proposalId:events.some(e=>e.type==='request')?this.pending.id:pending?.id||null};
    return {...result,receipt};
  }
  publicPhysics(){return {doorOpen:this.state.doorOpen,gateOpen:gateOpen(this.state),power:this.state.power,escaped:won(this.state)};}
  dispatch(role,c) {
    if(!['west','east'].includes(role))return {ok:false,code:'permission_denied',message:'观众只有只读权限。'};
    if(typeof c!=='object'||!c)return {ok:false,message:'无效操作。'};
    if(c.type==='pause'){this.paused=!this.paused;this.changes++;this.event(role,'pause',this.paused?'已暂停双方行动。':'双方继续探索。');return {ok:true};}
    if(c.type==='cancel'){
      if(!this.pending||this.pending.id!==c.id)return {ok:false,code:'stale_proposal',retryable:true,message:'提议已过期，请重新查看。'};
      if(this.pending.from!==role)return {ok:false,code:'permission_denied',message:'只能撤回自己仍在等待的提议。'};
      const p=this.pending;this.pending=null;this.changes++;
      this.event(role,'decision','撤回了共同动作，可以继续探索。',undefined,{proposalId:p.id,proposal:p.action,proposer:p.from,resolution:'cancel'});
      return {ok:true,message:'已撤回提议，机关保持原状。'};
    }
    if(this.paused)return {ok:false,code:'paused',retryable:true,message:'已暂停。恢复后再行动。'};
    if(c.type==='inspect'){
      const f=fact(role,c.id,this.state);if(!f)return {ok:false,message:'你的房间没有这个物件。'};
      if(!this.notes[role].some(n=>n.id===f.id))this.notes[role].push(f);
      this.event(role,'inspect','查看了本侧物件。');return {ok:true,message:f.text};
    }
    if(c.type==='share'){
      const f=this.notes[role].find(n=>n.id===c.id);if(!f)return {ok:false,message:'只能分享自己已发现的线索。'};
      if(!this.shared.some(n=>n.id===f.id))this.shared.push({...f,seat:role});
      return this.say(role,f.text,'clue');
    }
    if(c.type==='say')return this.say(role,c.text);
    if(c.type==='hint'){
      const list=role==='west'?['先查看本侧物件，问搭档看到了什么。','动力台和门锁上的说明可以一起考虑。','可以先升起闸门。等搭档找到固定闸门的办法，再商量停机。']:
        ['先查看本侧物件，把发现分享给搭档。','关注闸门、手闸和风扇之间的关系。','闸门升起后查看风扇后方，考虑怎样让门保持开启、风扇却停下来。'];
      this.hints[role]=Math.min(3,this.hints[role]+1);return {ok:true,message:list[this.hints[role]-1]};
    }
    if(c.type==='accept'||c.type==='decline'){
      if(!this.pending||this.pending.id!==c.id)return {ok:false,code:'stale_proposal',retryable:true,message:'这个共同动作已过期，请重新查看。'};
      if(this.pending.from===role)return {ok:false,code:'permission_denied',message:'应由对面确认。'};
      const p=this.pending;this.pending=null;this.changes++;
      if(c.type==='decline'){this.event(role,'decision','暂缓共同动作，继续商量。',undefined,{proposalId:p.id,proposal:p.action,proposer:p.from,resolution:'decline'});return {ok:true,message:'已暂缓提议，机关保持原状。'};}
      const result=this.execute(p.from,p.action);
      if(result.ok)this.event(role,'decision',`确认共同动作：${labels[p.action]}，已执行。`,undefined,{proposalId:p.id,proposal:p.action,proposer:p.from,resolution:'accept'});
      return {...result,message:result.ok?`${names[p.from]}已完成「${labels[p.action]}」。`:result.message};
    }
    if(c.type==='action'){
      const allowed=role==='west'?playerActions:partnerActions;
      if(!allowed.has(c.id))return {ok:false,code:'permission_denied',message:'这个机关不在你这一侧。'};
      if(SHARED.has(c.id)){
        // One shared action waits at a time. A seat's own controls stay free meanwhile: the point of
        // proposing is to let the other side get ready before it confirms, and getting ready is an
        // action (holding the gate before the power is cut). The rules decide again at confirm time.
        if(this.pending)return {ok:false,code:'proposal_pending',retryable:true,message:'已有一个共同动作在等确认。先确认或暂缓它，再提新的。'};
        const trial=transition(this.state,c.id,role==='west'?'player':'partner');
        if(!trial.ok)return {ok:false,message:trial.message};
        this.pending={id:randomBytes(6).toString('hex'),from:role,action:c.id,label:labels[c.id]};this.changes++;
        this.event(role,'request',`提议${labels[c.id]}，等待对面准备好。`);return {ok:true,message:'已经向对面提出，请等对面确认。'};
      }
      return this.execute(role,c.id);
    }
    return {ok:false,message:'没有理解这个操作。请使用物件按钮；文字消息只会发送给搭档。'};
  }
  say(role,text,type='message') {
    if(typeof text!=='string'||!text.trim()||text.length>500)return {ok:false,message:'请用 1–500 个字描述。'};
    const msg={seat:role,text:text.trim(),source:this.controllers[role],at:Date.now()};
    this.messages.push(msg);this.event(role,type,msg.text);return {ok:true,message:'已发送。文字不会自动操作机关。'};
  }
  execute(role,action){
    const r=transition(this.state,action,role==='west'?'player':'partner');
    if(r.ok){this.state=r.state;this.changes++;this.event(role,'action',`${names[role]} · ${labels[action]}。${won(this.state)?'两个人一起走到了墙外。':'墙内传来机关动作的声音。'}`);this.signals[action]=this.rev;}
    let message=r.message.replaceAll('阿澄','东席搭档');
    if(role==='east'){
      // The rules speak of the partner in the third person; told to the partner itself, "he" is "you".
      message=message.replaceAll('需要你这边先供电','需要西席先供电').replaceAll('东席搭档','你').replaceAll('他','你');
      if(action==='send-key')message=r.ok?'你把黄铜钥匙递给了西席。钥匙已不在你这边。':'钥匙已经递给西席了。';
      if(action==='leave'&&r.ok)message='你穿过稳住的东闸，与西席搭档一起走到墙外。';
    }
    return {ok:r.ok,message};
  }
}
