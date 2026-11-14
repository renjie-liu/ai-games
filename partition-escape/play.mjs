import {RoomScene} from './scene.mjs';
import {setupTts} from './voice-client.mjs';
import {setupLive} from './live-client.mjs';
// Following a different invite in an existing tab creates a new page/seat session.
// Hash-only navigation must not retain the previous room's credential or modal.
window.addEventListener('hashchange',()=>location.reload());
const $=s=>document.querySelector(s), app=$('#app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.hash.slice(1)), room=params.get('room'), key=params.get('key');
const seatName={west:'西席',east:'东席',watch:'观众'}, kindName={human:'真人',script:'脚本 stub',model:'真实模型',live:'Gemini Live', 'offline-fixture':'离线 fixture · 非模型'};
let reading=false,voice=null,lastSpoken=0,ttsClient=null,liveClient=null;
let view,scene,selected=null,tab='objects',detailMessage='',previousRender='',overlayClosed=false,commandTail=Promise.resolve();
let lastEventId=0,peerQueue=[],peerCurrent=null,peerUntil=0,peerTimer=null,pendingFocus=null,ownProposal=null,lastLocalCommand=null;
const brand=`<div class="brand"><span class="brand-mark" aria-hidden="true"></span><strong>隔墙</strong><span class="top-sub">THE OTHER SIDE</span></div>`;
async function api(suffix='',data){
  const r=await fetch(`/api/rooms/${room}${suffix}`,{method:data?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  const result=await r.json();if(!r.ok)throw Error(result.error||'连接失败');return result;
}
function notice(text,error=false){const n=$('#feedback');if(n){n.textContent=text;n.classList.toggle('error',error);n.classList.remove('flash');void n.offsetWidth;n.classList.add('flash');}}
// Public partner activity has its own ordered lane. It never replaces my command result.
function advancePeerCue(){
  clearTimeout(peerTimer);
  if(!peerQueue.length||view.paused)return;
  peerCurrent=peerQueue.shift();peerUntil=Date.now()+3800;
  const prefix=seatName[peerCurrent.seat]+' · ';
  $('#peer-text').textContent=peerCurrent.text.startsWith(prefix)?peerCurrent.text:prefix+peerCurrent.text;
  $('#peer-cue').dataset.eventId=peerCurrent.id;
  $('#peer-cue .source').textContent=(view.role==='watch'?'公开动静':'墙后动静')+' · #'+peerCurrent.id;
  $('#peer-cue').classList.remove('flash');void $('#peer-cue').offsetWidth;$('#peer-cue').classList.add('flash');
  if(peerCurrent.type==='action')scene.pulse();
  updatePeerCount();schedulePeerCue();
}
function updatePeerCount(){
  $('#peer-next').disabled=!peerQueue.length;
  $('#peer-next').textContent=peerQueue.length?`下一条 · ${peerQueue.length}`:'已读到最新';
}
function schedulePeerCue(){
  clearTimeout(peerTimer);
  if(peerQueue.length)peerTimer=setTimeout(()=>{
    if(view.paused)schedulePeerCue();else advancePeerCue();
  },Math.max(view.paused?500:50,peerUntil-Date.now()));
}
function receivePeerEvents(){
  const incoming=view.events.filter(e=>e.id>lastEventId&&e.seat!==view.role&&['west','east'].includes(e.seat)&&['action','request','decision'].includes(e.type));
  lastEventId=Math.max(lastEventId,...view.events.map(e=>e.id));
  peerQueue.push(...incoming);
  if(peerQueue.length&&(!peerCurrent||Date.now()>=peerUntil)&&!view.paused)advancePeerCue();
  else {updatePeerCount();schedulePeerCue();}
}
function renderPending(){
  if(ownProposal&&view.pending?.id!==ownProposal.id){
    const decision=view.events.find(e=>e.proposalId===ownProposal.id&&e.type==='decision');
    if(!lastLocalCommand||(lastLocalCommand.type==='action'&&lastLocalCommand.id===ownProposal.action)){
      if(decision?.resolution==='accept')notice(`对面已确认，${ownProposal.label}已执行。`);
      else if(decision?.resolution==='decline')notice('对面选择先等等。提议已解除，可以继续探索或商量。');
    }
    ownProposal=null;
  }
  if(view.pending?.from===view.role)ownProposal=view.pending;
  const p=view.pending,area=$('#pending'),hadFocus=area.contains(document.activeElement);
  const html=p?`<section class="pending" role="region" aria-labelledby="pending-title" data-id="${p.id}"><div><h2 id="pending-title">${p.from===view.role?'共同动作 · 等待搭档':'搭档需要你确认'}</h2><p>${esc(p.label)} · ${p.from===view.role?'你可以撤回，继续探索。':'准备好再同意，也可以先等等。'}</p></div><div class="pending-actions">${p.from!==view.role?'<button id="accept" class="primary">我准备好了</button><button id="decline">先等等</button>':'<button id="cancel-proposal">撤回提议</button>'}</div></section>`:'';
  if(area.innerHTML===html)return;
  const isNew=p&&area.firstElementChild?.dataset.id!==p.id;
  if(isNew)pendingFocus=document.activeElement;
  area.innerHTML=html;
  for(const [id,type] of [['accept','accept'],['decline','decline'],['cancel-proposal','cancel']]){
    const button=$('#'+id);if(button)button.onclick=()=>command({type,id:p.id});
  }
  document.querySelector('.game').classList.toggle('has-pending',!!p);
  if(isNew&&matchMedia('(max-width: 680px)').matches&&!$('#composer').contains(document.activeElement))area.querySelector('button')?.focus({preventScroll:true});
  else if(!p&&hadFocus)(pendingFocus?.isConnected?pendingFocus:$('#pause'))?.focus({preventScroll:true});
}
function command(c){
  globalThis.speechSynthesis?.cancel();ttsClient?.stop();notice('正在操作…');
  const perform=async()=>{
    lastLocalCommand=c;
    try{const r=await api('/command',c);if(r.view.rev>=view.rev)view=r.view;if(r.message)notice(r.message,!r.ok);render();if(c.type==='hint'&&r.message)notice(r.message);return r;}
    catch(e){notice(e.message,true);}
  };
  commandTail=commandTail.then(perform,perform);return commandTail;
}
function lobby(){
  app.innerHTML=`<header class="topbar">${brand}<span class="badge">LOCAL PROTOTYPE / 01</span></header><main class="lobby"><div class="lobby-grid"><section><div class="eyebrow">一堵墙 · 两个房间 · 同一个出口</div><h1>你看不到的，<br><em>另一侧看得见。</em></h1><p class="intro">先别急着开你的门。查看自己的机关，把发现告诉墙后的人，一起找到离开的办法。</p><div class="setup"><div class="eyebrow">选择这次合作</div><div class="seats"><label class="seat-choice"><span>01 / 西席 · 动力与出口</span><select id="west"><option value="human">真人</option><option value="script">脚本 stub · harness</option></select></label><label class="seat-choice"><span>02 / 东席 · 检修与闸门</span><select id="east"><option value="script">脚本 stub · harness</option><option value="human">真人</option></select></label></div><button class="primary" id="create">创建这次合作 ↗</button><p class="scope">脚本 stub 会主动探索，但不是语言模型。每席独立 harness。<br>无倒计时 · 文字沟通 · 鼠标、触屏或键盘 · 无语音输入</p><div id="invite" aria-live="polite"></div></div></section><div class="preview" id="preview"><div class="preview-label"><span>WEST / 暖光</span><span>两侧线索各自私有</span><span>EAST / 冷光</span></div></div></div><div class="feature-row"><span>◈ 固定规则，真实机关</span><span>↔ 交换发现，商量行动</span><span>↶ 错了可以调整，没有突然失败</span></div></main>`;
  fetch('/api/capabilities').then(r=>r.json()).then(c=>{if(c.modelEnabled)for(const seat of ['west','east'])$('#'+seat).add(new Option('真实模型 · 已启用调用','model'));if(c.live?.enabled){$('#east').add(new Option('Gemini Live · 语音AI','live'));$('#east').value='live';$('.scope').textContent='Gemini Live：麦克风由你允许后才开启，最多60秒；可能实际计费。脚本模式不是AI。';}}).catch(()=>{});
  scene=new RoomScene($('#preview'),()=>{});scene.update({role:'watch',public:{},scene:[]});
  $('#create').onclick=async()=>{
    const b=$('#create');b.disabled=true;b.textContent='正在接通两侧…';
    try{
      const r=await fetch('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({controllers:{west:$('#west').value,east:$('#east').value}})});const d=await r.json();if(!r.ok)throw Error(d.error);
      $('#invite').innerHTML=`<div class="invite"><strong>房间已准备好</strong><p class="small">这是组织者入口。把各席链接交给对应玩家；玩家页面只能看到自己的房间。观众只看公开事件与建筑机位。</p>${Object.entries(d.links).filter(([,u])=>u).map(([s,u])=>`<a class="button ${s==='watch'?'':'primary'}" href="${esc(u)}" target="_blank" rel="noopener">${s==='watch'?'打开只读观众':'进入'+seatName[s]} ↗</a>`).join('')}<p class="small">邀请第二位真人：右键对应入口复制链接。服务限本机；同机两个独立标签页可玩。远程联网尚未实现。</p></div>`;
    }catch(e){$('#invite').textContent=e.message;}finally{b.disabled=false;b.textContent='再开一个房间';}
  };
}
function layout(){
  const watching=view.role==='watch';
  app.innerHTML=`<main class="game ${view.role}"><header class="topbar">${brand}<div class="top-meta"><span class="badge">${watching?'只读观众':seatName[view.role]+' · 玩家'}</span>${!watching?'<button class="ghost voice" id="voice" disabled title="仅使用本机中文声音；不支持语音输入">朗读不可用</button><button class="ghost" id="pause" title="Esc 暂停或继续">暂停</button>':''}</div></header><div class="goalbar"><h1>一起走到墙外。</h1><div class="steps"><span class="current">01 发现</span><span>02 沟通</span><span>03 尝试</span><span>04 一起离开</span></div><span class="small">${watching?'公开状态 · 不提供任何私有线索':'沉默不会推进失败 · 随时可以调整'}</span></div>${watching?'<nav class="camera-bar" aria-label="观众机位"><button data-camera="west">西侧机位</button><button data-camera="cut" class="active">剖面总览</button><button data-camera="east">东侧机位</button></nav>':''}<div class="workspace"><section class="stage-wrap"><div class="stage" id="scene"><div class="scene-label"><div class="eyebrow">ROOM 01 / ${watching?'PUBLIC ARCHITECTURE':view.role.toUpperCase()}</div><h2>${watching?'隔墙之间':view.role==='west'?'动力间':'检修间'}</h2><p class="small">${watching?'建筑视角可切换。未公开的物件和线索不在观众画面中。':'点一下房间里的物件。也可用下方按钮，Tab + Enter 操作。'}</p></div><div class="scene-tag">${watching?'机位：剖面总览':'只加载本席房间'}</div><div class="scene-state" id="scene-state"></div></div><div class="stage-caption" id="feedback" role="status" aria-live="polite">${watching?'公开动静会在下方依次显示，也可以在右侧回看。':'先查看'+(view.role==='west'?'出口铭牌':'升降闸')+'，发现会记在你的线索本里。'}</div><div class="peer-cue" id="peer-cue"><div><span class="source">${watching?'公开动静':'墙的另一侧'}</span><p id="peer-text" role="status" aria-live="polite">暂无机关动静。我的操作结果会保留在上方。</p></div><button id="peer-next" disabled>已读到最新</button></div><nav class="objectbar" id="objectbar" aria-label="本侧可交互物"></nav></section><aside class="side">${watching?'<div class="tabs"><button class="active">公开事件</button></div><div class="timeline" id="timeline"></div><div class="studio-links" id="studio"></div>':`<nav class="tabs"><button data-tab="objects" class="active">物件</button><button data-tab="notes">线索本</button><button data-tab="messages">对讲记录</button></nav><div class="inspect" id="inspect"></div><div class="hint"><span id="hint-count">提示 0 / 3</span><button id="hint">给一点方向</button></div><div id="pending"></div><section id="tts-panel" class="chat" aria-label="语音朗读"></section><section class="chat"><div class="chat-title"><span><i class="dot"></i>墙后对讲</span><span id="partner-kind"></span></div><div class="latest" id="latest">对面已经接通。你可以先查看自己的房间。</div><form id="composer" class="composer"><textarea id="message" rows="1" maxlength="500" aria-label="给搭档的消息" placeholder="告诉对方你的发现…"></textarea><button class="primary" type="submit">发送</button></form><div class="small">文字只发送消息，不会自动操作机关。脚本只理解有限状态。</div></section>`}</aside></div><div id="overlay"></div></main>`;
  scene=new RoomScene($('#scene'),id=>selectObject(id));scene.update(view);
  $('#peer-next').onclick=advancePeerCue;
  if(!watching)new ResizeObserver(()=>document.querySelector('.game').style.setProperty('--pending-height',($('#pending').offsetHeight+16)+'px')).observe($('#pending'));
  if(watching){document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>{scene.setCamera(b.dataset.camera);document.querySelectorAll('[data-camera]').forEach(x=>x.classList.toggle('active',x===b));$('.scene-tag').textContent='机位：'+b.textContent;});}
  else{
    const refreshVoice=()=>{voice=globalThis.speechSynthesis?.getVoices().find(v=>v.localService&&/^zh/i.test(v.lang));$('#voice').disabled=!voice;$('#voice').textContent=voice?(reading?'本机朗读：开':'本机朗读：关'):'无本机朗读';};refreshVoice();globalThis.speechSynthesis?.addEventListener('voiceschanged',refreshVoice);$('#voice').onclick=()=>{reading=!reading;globalThis.speechSynthesis.cancel();refreshVoice();};
    ttsClient=setupTts({room,key,getView:()=>view});
    const livePanel=document.createElement('section');livePanel.id='live-panel';livePanel.className='chat';$('#tts-panel').before(livePanel);
    liveClient=setupLive({room,key,getView:()=>view});
    if(Object.values(view.controllers).includes('live')){$('#tts-panel').hidden=true;$('#voice').hidden=true;}
    $('#pause').onclick=()=>command({type:'pause'});$('#hint').onclick=()=>command({type:'hint'});
    $('#composer').onsubmit=e=>{e.preventDefault();const input=$('#message'),text=input.value.trim();if(text){command({type:'say',text});input.value='';}};
    $('#message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#composer').requestSubmit();}};
    document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;previousRender='';renderPanel();});
    $('#objectbar').innerHTML=view.scene.map((o,i)=>`<button data-object="${esc(o.id)}"><span>${esc(o.name)}</span><span class="number">0${i+1} ↗</span></button>`).join('');
    document.querySelectorAll('[data-object]').forEach(b=>{b.onclick=()=>selectObject(b.dataset.object);b.onfocus=()=>scene.highlight(b.dataset.object);b.onblur=()=>scene.highlight(selected);});
  }
}
async function selectObject(id){
  selected=id;detailMessage='正在查看这个物件…';tab='objects';scene.highlight(id);renderPanel();const r=await command({type:'inspect',id});if(r&&selected===id){detailMessage=r.message;previousRender='';renderPanel();if(matchMedia('(max-width: 680px)').matches)$('#inspect').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
}
function renderPanel(){
  if(view.role==='watch')return;
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.querySelectorAll('[data-object]').forEach(b=>b.classList.toggle('active',b.dataset.object===selected));
  const focused=document.activeElement?.dataset?.action;
  let html='';
  if(tab==='objects'){
    const o=view.scene.find(o=>o.id===selected);
    if(!o)html='<div class="eyebrow">从一个小发现开始</div><h2>墙挡住了视线，<br>挡不住合作。</h2><p>查看一个物件，看看它能做什么。你不需要先读完教程。</p><p class="small">你无法操作对面的机关。把自己的发现发过去，让对面也参与下一步。</p>';
    else{
      const notes=view.notes.filter(n=>n.object===o.id),f=notes.at(-1);
      html=`<div class="eyebrow">我看到 / ${seatName[view.role]}</div><h2>${esc(o.name)}</h2><p>${esc(f?.text||detailMessage)}</p>${f?`<button data-share="${esc(f.id)}" class="ghost">↗ 把这条发现告诉搭档</button>`:''}<div class="actions">${o.actions.map(a=>`<button data-action="${a.id}" ${view.paused||view.pending||view.complete?'disabled':''}>${esc(a.label)} <span aria-hidden="true">→</span></button>`).join('')}</div>`;
    }
  }else if(tab==='notes'){
    const cards=[...view.notes.map(n=>({...n,mine:true})),...view.shared.filter(n=>n.seat!==view.role)];
    html='<div class="eyebrow">只记录真实发现</div><h2>线索本</h2>'+(cards.length?cards.map(n=>`<article class="clue-card"><span class="source">${n.mine?'我看到':'搭档分享 / '+esc(n.source)}</span><p>${esc(n.text)}</p>${n.mine?`<button data-share="${esc(n.id)}">分享这条线索 ↗</button>`:''}</article>`).join(''):'<p>查看物件后，重要发现会留在这里。</p>');
  }else html='<div class="eyebrow">可以随时回看</div><h2>对讲记录</h2>'+view.messages.map(m=>`<article class="clue-card"><span class="source">${seatName[m.seat]} · ${kindName[m.source]}</span><p>${esc(m.text)}</p></article>`).join('')+'<h2>机关动静</h2>'+view.events.filter(e=>['action','request','decision'].includes(e.type)).map(e=>`<article class="clue-card"><span class="source">#${e.id} · ${seatName[e.seat]} · ${kindName[e.source]}</span><p>${esc(e.text)}</p></article>`).join('');
  if(html!==previousRender){$('#inspect').innerHTML=html;previousRender=html;document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>command({type:'action',id:b.dataset.action}));document.querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>command({type:'share',id:b.dataset.share}));if(focused)(document.querySelector(`[data-action="${focused}"]`)||document.querySelector('.actions button')||document.querySelector(`[data-object="${selected}"]`))?.focus({preventScroll:true});}
}
function render(){
  ttsClient?.update();
  liveClient?.update();
  scene.update(view);
  const l=view.local;$('#scene-state').textContent=view.role==='watch'?`公开机关 · 动力：${view.public.power?'开启':'关闭'} · 西门：${view.public.doorOpen?'开启':'关闭'} · 东闸：${view.public.gateOpen?'升起':'落下'}`:view.role==='west'?`动力：${l.power?'开启':'关闭'} · 钥匙：${l.keyHere?'已收到':'未收到'} · 西门：${l.doorOpen?'开启':'关闭'}`:`风扇：${l.fanSpinning?'转动':'停转'} · 手闸：${l.holdingBrake?'握住':'松开'} · 闸门：${l.gateOpen?'升起':'落下'}`;
  document.querySelectorAll('.steps span').forEach((s,i)=>s.classList.toggle('current',i===(view.complete?3:view.events.some(e=>e.type==='action')?2:view.shared.length?1:0)));
  if(view.paused)globalThis.speechSynthesis?.cancel();
  if(view.role==='watch'){
    $('#timeline').innerHTML=view.events.slice().reverse().map(e=>`<div class="event"><span>#${e.id} · ${seatName[e.seat]||'房间'} · ${kindName[e.source]||e.source} · ${esc(e.type)}</span>${esc(e.text)}</div>`).join('');
    $('#studio').innerHTML=['west','east'].map(s=>`<button data-studio="${s}" ${view.controllers[s]==='human'?'disabled':''}>${seatName[s]} Trace Studio ↗</button>${view.controllers[s]==='live'?`<button data-studio="${s}" data-live="1">${seatName[s]} Live 会话总览 ↗</button>`:''}`).join('')+'<p class="small">现有 Trace Studio 的公开投影；私有观察、动作参数、模型内部内容不对观众开放。</p>';
    document.querySelectorAll('[data-studio]').forEach(b=>b.onclick=async()=>{
      const w=window.open('about:blank','_blank');if(w)w.opener=null;
      try{const r=await fetch(`/api/rooms/${room}/${b.dataset.live?'live-trace':'studio'}?seat=${b.dataset.studio}`,{headers:{Authorization:`Bearer ${key}`}});if(!r.ok)throw Error((await r.json()).error);const url=URL.createObjectURL(new Blob([await r.text()],{type:'text/html'}));if(w)w.location=url;else{URL.revokeObjectURL(url);notice('请允许弹出窗口后重试。');}}catch(e){w?.close();notice(e.message,true);}
    });
  }else{
    renderPanel();$('#pause').textContent=view.paused?'继续':'暂停';$('#hint-count').textContent=`提示 ${view.hintLevel} / 3`;
    const other=view.role==='west'?'east':'west';$('#partner-kind').textContent=kindName[view.worker?.[other]?.source||view.controllers[other]];
    const msg=view.messages.filter(m=>m.seat===other).at(-1);$('#latest').textContent=msg?.text||'对面已经接通。你可以先查看自己的房间。';
    if(reading&&voice&&msg&&msg.at>lastSpoken&&!view.paused){lastSpoken=msg.at;globalThis.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(msg.text);u.voice=voice;u.lang=voice.lang;globalThis.speechSynthesis.speak(u);}
    const worker=view.worker[other];if(worker?.status==='error')$('#latest').textContent=worker.message;
    renderPending();
  }
  let overlay='';
  if(view.complete&&!overlayClosed)overlay=`<div class="paused-overlay victory" role="dialog" aria-modal="true" aria-label="共同通关"><div class="eyebrow">CHAPTER 01 / TOGETHER</div><h2>这次，没有谁被留下。</h2><p>动力熄了，支撑还在。你们用各自的发现，让同一个出口终于对两个人敞开。</p><button id="review" class="primary">回看我们的合作</button><p class="small">这是一关原型。脚本 stub 通关不代表真实模型已验证。</p></div>`;
  else if(view.paused)overlay=`<div class="paused-overlay" role="dialog" aria-modal="true" aria-label="已暂停"><div class="eyebrow">PAUSED</div><h2>墙的两侧，都在等。</h2><p>机关与双方行动已暂停，不会消耗时间或资源。</p>${view.role!=='watch'?'<button id="resume" class="primary">继续合作</button>':'<p>等待玩家恢复。</p>'}</div>`;
  if($('#overlay').innerHTML!==overlay){$('#overlay').innerHTML=overlay;document.querySelectorAll('.game > :not(#overlay)').forEach(e=>e.inert=!!overlay);if(overlay)$('#overlay button')?.focus();else $('#pause')?.focus({preventScroll:true});if($('#resume'))$('#resume').onclick=()=>command({type:'pause'});if($('#review'))$('#review').onclick=()=>{overlayClosed=true;tab='messages';render();};}
  receivePeerEvents();
}
document.addEventListener('keydown',e=>{if(e.key==='Tab'&&$('#overlay button')){e.preventDefault();$('#overlay button').focus();return;}if(e.key==='Escape'&&view&&view.role!=='watch'&&!view.complete){e.preventDefault();command({type:'pause'});}});
if(!room||!key)lobby();else{
  try{view=await api();if((location.pathname==='/watch')!==(view.role==='watch'))throw Error('入口与凭证角色不一致。请使用原始席位链接。');layout();render();
    setInterval(async()=>{try{const next=await api();if(next.rev>=view.rev&&(next.rev!==view.rev||JSON.stringify(next.worker)!==JSON.stringify(view.worker))){view=next;render();}}catch(e){notice(e.message,true);}},650);
  }catch(e){app.innerHTML=`<div class="loading"><h1>没有接通房间</h1><p>${esc(e.message)}</p><a href="/">返回本地开局页</a></div>`;}
}
