// Server only. Private facts never ship as JavaScript to a player browser.
import {randomBytes} from 'node:crypto';
import {initialState, transition, gateOpen, won, actionsFor, braceAction, rating} from './engine.mjs';
import {RULES, makePuzzle, seeded} from './room-rules.mjs';

export const opposite = s => s === 'west' ? 'east' : 'west';
// Actions that change the other room too: one seat proposes, the other confirms. A room with a
// choice of supports adds putting one in (Room.joint): west holds the table that decides it.
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
// Only in a room with a choice of supports: what each mark bears, on the west wall.
const CHART = {id:'chart',name:'承重表',kind:'plaque',position:[2.2,1.6,-2.5]};
const CHART_LEAD = '机械支撑按刻着的记号查额定承重（公斤），额定承重不能低于闸重。读哪一列，要看东侧闸轨上检修牌的颜色。';
export class Room {
  // `rules` names a rule set of room-rules.json; `seed` makes its puzzle again. Without `rules` the
  // room is the one with a single brace and no battery.
  constructor(controllers={west:'human',east:'script'},{rules='classic',seed=randomBytes(4).readUInt32BE(0),config=RULES}={}) {
    if(!['west','east'].every(s=>['human','script','model','live'].includes(controllers[s]))) throw Error('无效控制器');
    const set=typeof rules==='string'&&Object.hasOwn(config.rule_sets,rules)?config.rule_sets[rules]:null;
    if(!set)throw Error('没有这套规则。');
    // The scripted and the model seat know one brace; they have not learned to choose among several.
    if(set.supports&&Object.values(controllers).some(c=>c==='script'||c==='model'))throw Error('脚本和模型席位还不会挑支撑，只能用没有支撑选择的规则。');
    if(!Number.isSafeInteger(seed)||seed<0)throw Error('无效种子：要一个不小于 0 的整数。');
    this.rules=rules; this.seed=seed; this.puzzle=makePuzzle(set,seeded(seed));
    const supports=this.puzzle?.supports||[];
    this.actions=actionsFor(this.puzzle);
    this.labels={...labels,...(this.puzzle?.cells?{'swap-pack':'换上备用电池组'}:{}),
      ...Object.fromEntries(supports.map((s,i)=>[braceAction(i),`装上刻着${s.mark}的支撑`]))};
    this.joint=new Set([...SHARED,...supports.map((_,i)=>braceAction(i))]);
    this.props=supports.length?{...props,west:[...props.west,CHART]}:props;
    this.id=randomBytes(8).toString('hex'); this.controllers={...controllers}; this.state=initialState(this.puzzle);
    this.tokens=Object.fromEntries(['west','east','watch'].map(s=>[s,randomBytes(24).toString('base64url')]));
    this.notes={west:[],east:[]}; this.shared=[]; this.messages=[]; this.events=[]; this.rev=0;
    this.paused=false; this.pending=null; this.hints={west:0,east:0}; this.worker={}; this.signals={}; this.created=Date.now();
    // Counts changes of the room itself: a mechanism moved, a proposal came or went, play paused or
    // resumed. `rev` counts every event, a look or a message included; this does not.
    this.changes=0;
    this.event('system','ready','两侧已接通。先查看自己房间里的物件，再把发现告诉另一侧。','rules');
  }
  role(token){return Object.keys(this.tokens).find(s=>this.tokens[s]===token);}
  actor(role){return role==='west'?'player':'partner';}
  // What a seat can see of the state from inside its own room.
  local(role,s=this.state){
    const p=this.puzzle;
    return role==='west' ? {power:s.power,keyHere:s.keyTransferred,unlocked:s.unlocked,doorOpen:s.doorOpen,
        ...(p?.cells?{charge:s.charge,cells:p.cells,packs:s.packs}:{})} :
      {gateOpen:gateOpen(s),fanSpinning:s.power,holdingBrake:s.brake,braceSeen:s.braceSeen,braced:s.braced,keyHere:!s.keyTransferred,outside:s.partnerOut,
        ...(p?.supports?{support:s.support===null?null:p.supports[s.support].mark}:{})};
  }
  // What one object in a seat's own room says. With a choice of supports the answer is split: the
  // weight and the table of ratings are west's, the supports, the slot and the tag are east's.
  fact(seat,id,s=this.state) {
    const p=this.puzzle,choice=p?.supports;
    const facts = seat === 'west' ? {
      plaque:['interlock','西门一旦推开，两侧动力立即断开。关门可恢复联锁。两个人必须一起走。'+(choice?`升降闸自重 ${p.weight} 公斤。`:'')],
      power:['coupling','这个开关同时驱动隔壁的升降闸和检修风扇，不能分别供电。'+(p?.cells?`备用电池每组 ${p.cells} 格，每次接通动力耗一格；一组用完，可以在这里换上备用组。`:'')],
      door:['west-exit','西门需要黄铜钥匙；开锁和推门是两个独立动作。'],
      hatch:['west-hatch','传物槽能从东侧送来小物件。西间原先没有钥匙。'],
      ...(choice?{chart:['load-chart',CHART_LEAD+
          p.tags.map(t=>`${t}牌一列：`+choice.map(x=>`${x.mark} ${x.ratings[t]} 公斤`).join('，')+'。').join(''),
        {caption:CHART_LEAD,columns:['记号',...p.tags.map(t=>t+'牌')],rows:choice.map(x=>[x.mark,...p.tags.map(t=>x.ratings[t])])}]}:{})
    } : {
      gate:['gate-rule','闸门靠动力抬升，断电会落下。轨道上有机械支撑槽。'+(choice?`支撑槽只放得进 ${p.slot[0]} 到 ${p.slot[1]} 厘米长的支撑。闸轨上挂着一块${p.tag}色检修牌。`:'')],
      brake:['brake-rule','手闸只能固定已经升起的闸门；我拉着它时不能离开，但还能用另一只手取物。'+(choice?'支撑承不承得住，要松开手闸才知道；承住了我才能走开。':'')],
      fan:!s.braceSeen ? ['fan-rule','检修风扇与闸门连着同一条动力轴。闸门升起后才能看清后面的检修格。'] :
        choice ? ['supports-found',`闸门后露出 ${choice.length} 根支撑，藏在风扇叶片后：`+choice.map(x=>`刻着${x.mark}的长 ${x.length} 厘米`).join('，')+
          '。记号代表承重等级，这里没有对照表，也不知道闸有多重。风扇停转且手闸保持时，才能取出并安装；装哪一根要西席确认。'] :
        ['brace-found','闸门后露出一块木撑，藏在风扇叶片后。风扇停转且手闸保持时，才能安全取出并安装。'],
      hatch:['key-found','黄铜钥匙原先挂在东间传物槽旁，可以从这里递给西席。']
    };
    const f=facts[id]; return f && {id:f[0],object:id,source:names[seat],text:f[1],...(f[2]?{table:f[2]}:{})};
  }
  // What confirming the waiting proposal right now would change in `role`'s own room, by the same
  // rules that will decide it: only what that seat can see, and only what would differ. Null when
  // nothing waits for this seat. A seat can foresee this from the facts of its own objects; said
  // outright, it is not left to be worked out wrongly (a gate dropped by a confirmation given too soon).
  preview(role){
    const p=this.pending;if(!p||p.from===role)return null;
    const trial=transition(this.state,p.action,this.actor(p.from),this.puzzle);if(!trial.ok)return null;
    const now=this.local(role),then=this.local(role,trial.state);
    const changed=Object.fromEntries(Object.keys(then).filter(k=>then[k]!==now[k]).map(k=>[k,then[k]]));
    // Whether a support that has not borne the gate yet will bear it is not something a seat can
    // foresee: it is what letting go finds out. When confirming would leave the gate on such a
    // support alone, what depends on that is left out and the seat is told so instead. Otherwise
    // this would say which support is the right one before it is tried.
    const s=this.state,t=trial.state;
    if(this.puzzle?.supports&&s.braced&&!s.loadTested&&!t.power&&!t.brake){
      for(const k of ['gateOpen','braced','support'])delete changed[k];
      if(role==='east')changed.untried_support='确认后只有支撑托着闸门。它还没有承过重，承不承得住到那时才知道。';
    }
    return changed;
  }
  // What a seat learns by simply looking around its own room: the current fact of each of its own
  // objects goes into its notes. No event and no revision, because nothing in the world changed.
  // For the voice partner, which cannot spend a turn on every object before it can be of any help.
  look(role){
    for(const p of this.props[role]||[]){
      const f=this.fact(role,p.id);
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
    // How it went, once both are out: a public outcome like the escape itself.
    const score=rating(this.state,this.puzzle);
    const base={id:this.id,role,rev:this.rev,paused:this.paused,complete:won(this.state),controllers:this.controllers,
      goal:'让两个人都走到墙外',pending:this.pending,messages:this.messages.slice(-40),shared:this.shared,
      events:this.events.slice(-60),signals:this.signals,worker:this.worker,...(score?{rating:score}:{})};
    // Public physical outcomes only; no private inventory, plaque, mechanism facts or legal-action oracle.
    if(role==='watch')return {...base,public:{doorOpen:this.state.doorOpen,gateOpen:gateOpen(this.state),power:this.state.power,escaped:won(this.state)},scene:[],notes:[]};
    const s=this.state,supports=this.puzzle?.supports;
    const local=this.local(role);
    const inspected=new Set(this.notes[role].map(n=>n.object));
    const objectActions=role==='west'? {power:[s.power?'power-off':'power-on',...(this.puzzle?.cells&&s.charge===0&&!s.power?['swap-pack']:[])],
        door:[!s.unlocked?'unlock':s.doorOpen?'close-door':'open-door']} :
      {hatch:!s.keyTransferred?['send-key']:[],brake:[s.brake?'release-brake':'hold-brake'],
        fan:s.braceSeen&&!s.braced?(supports?supports.map((_,i)=>braceAction(i)):['brace']):[],gate:['leave']};
    return {...base,local,notes:this.notes[role],hintLevel:this.hints[role],scene:this.props[role].map(p=>({...p,inspected:inspected.has(p.id),
      actions:(objectActions[p.id]||[]).map(id=>({id,label:this.labels[id],shared:this.joint.has(id)}))}))};
  }
  command(role,c) {
    const before=this.rev, pending=this.pending, physics=this.publicPhysics();
    const result=this.dispatch(role,c);
    const action=c?.type==='action' && Object.hasOwn(this.labels,c.id) ? c.id :
      ['accept','decline','cancel'].includes(c?.type) && pending?.id===c.id ? pending.action : null;
    const commandLabel=action ? `${({accept:'确认：',decline:'暂缓：',cancel:'撤回：'})[c.type]||''}${this.labels[action]}` :
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
      const f=this.fact(role,c.id);if(!f)return {ok:false,message:'你的房间没有这个物件。'};
      if(!this.notes[role].some(n=>n.id===f.id))this.notes[role].push(f);
      this.event(role,'inspect','查看了本侧物件。');return {ok:true,message:f.text};
    }
    if(c.type==='share'){
      const f=this.notes[role].find(n=>n.id===c.id);if(!f)return {ok:false,message:'只能分享自己已发现的线索。'};
      // The table is the half of the answer this seat is there to work out. Handed over whole, the
      // other seat could decide alone.
      if(f.table)return {ok:false,message:'这张表钉在墙上，只能自己看。需要的数字，说给搭档听。'};
      if(!this.shared.some(n=>n.id===f.id))this.shared.push({...f,seat:role});
      return this.say(role,f.text,'clue');
    }
    if(c.type==='say')return this.say(role,c.text);
    if(c.type==='hint'){
      const choice=!!this.puzzle?.supports;
      const list=role==='west'?['先查看本侧物件，问搭档看到了什么。','动力台和门锁上的说明可以一起考虑。',
          choice?'承重表要和铭牌上的闸重一起看。读哪一列，问搭档检修牌的颜色；装哪根支撑由你确认。':'可以先升起闸门。等搭档找到固定闸门的办法，再商量停机。']:
        ['先查看本侧物件，把发现分享给搭档。','关注闸门、手闸和风扇之间的关系。',
          choice?'把放得进槽的支撑记号和检修牌的颜色告诉搭档。装哪一根要西席确认，松手才知道承不承得住。':'闸门升起后查看风扇后方，考虑怎样让门保持开启、风扇却停下来。'];
      this.hints[role]=Math.min(3,this.hints[role]+1);return {ok:true,message:list[this.hints[role]-1]};
    }
    if(c.type==='accept'||c.type==='decline'){
      if(!this.pending||this.pending.id!==c.id)return {ok:false,code:'stale_proposal',retryable:true,message:'这个共同动作已过期，请重新查看。'};
      if(this.pending.from===role)return {ok:false,code:'permission_denied',message:'应由对面确认。'};
      const p=this.pending;this.pending=null;this.changes++;
      if(c.type==='decline'){this.event(role,'decision','暂缓共同动作，继续商量。',undefined,{proposalId:p.id,proposal:p.action,proposer:p.from,resolution:'decline'});return {ok:true,message:'已暂缓提议，机关保持原状。'};}
      const result=this.apply(p.from,p.action);
      if(result.ok)this.event(role,'decision',`确认共同动作：${this.labels[p.action]}，已执行。`,undefined,{proposalId:p.id,proposal:p.action,proposer:p.from,resolution:'accept'});
      // The seat that confirmed is the one that hears why it could not be done.
      return {ok:result.ok,message:result.ok?`${names[p.from]}已完成「${this.labels[p.action]}」。`:this.told(role,p.action,false,result.message)};
    }
    if(c.type==='action'){
      if(!this.actions[this.actor(role)].has(c.id))return {ok:false,code:'permission_denied',message:'这个机关不在你这一侧。'};
      if(this.joint.has(c.id)){
        // One shared action waits at a time. A seat's own controls stay free meanwhile: the point of
        // proposing is to let the other side get ready before it confirms, and getting ready is an
        // action (holding the gate before the power is cut). The rules decide again at confirm time.
        if(this.pending)return {ok:false,code:'proposal_pending',retryable:true,message:'已有一个共同动作在等确认。先确认或暂缓它，再提新的。'};
        const trial=transition(this.state,c.id,this.actor(role),this.puzzle);
        if(!trial.ok)return {ok:false,message:this.told(role,c.id,false,trial.message)};
        this.pending={id:randomBytes(6).toString('hex'),from:role,action:c.id,label:this.labels[c.id]};this.changes++;
        this.event(role,'request',`提议${this.labels[c.id]}，等待对面准备好。`);return {ok:true,message:'已经向对面提出，请等对面确认。'};
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
  // What the rules said, in the terms of the seat that is told. The rules name the partner in the
  // third person; told to the partner itself, "he" is "you" (the words are RETOLD_WORDS in
  // room-rules.mjs, which keeps them out of marks and tags).
  told(role,action,ok,text){
    let message=text.replaceAll('阿澄','东席搭档');
    if(role==='east'){
      message=message.replaceAll('需要你这边先供电','需要西席先供电').replaceAll('东席搭档','你').replaceAll('他','你')
        .replace('钥匙已经在你这边了。','钥匙已经递给西席了。');
      if(action==='send-key'&&ok)message='你把黄铜钥匙递给了西席。钥匙已不在你这边。';
      if(action==='leave'&&ok)message='你穿过稳住的东闸，与西席搭档一起走到墙外。';
    }
    return message;
  }
  // A seat's own move: carried out by the rules and told to that seat.
  execute(role,action){
    const r=this.apply(role,action);
    return {ok:r.ok,message:this.told(role,action,r.ok,r.message)};
  }
  // Carries `action` out for the seat it belongs to. The message is the rules' own wording.
  apply(role,action){
    const up=gateOpen(this.state),r=transition(this.state,action,this.actor(role),this.puzzle);
    if(r.ok){
      this.state=r.state;this.changes++;
      // Whether the gate is up is public, and the wall does not hide the sound of it moving: the
      // seat that cannot see the gate hears whether a support held.
      const heard=won(this.state)?'两个人一起走到了墙外。':up&&!gateOpen(this.state)?'墙后传来闸门落下的声音。':!up&&gateOpen(this.state)?'墙后传来闸门升起的声音。':'墙内传来机关动作的声音。';
      this.event(role,'action',`${names[role]} · ${this.labels[action]}。${heard}`);this.signals[action]=this.rev;
    }
    return r;
  }
}
