import {RoomScene} from './scene.mjs';
import {setupTts} from './voice-client.mjs';
import {setupLive} from './live-client.mjs';
// Following a different invite in an existing tab creates a new page/seat session.
// Hash-only navigation must not retain the previous room's credential or modal.
window.addEventListener('hashchange',()=>location.reload());
const $=s=>document.querySelector(s), app=$('#app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Where the server is. On the game's own server the page and the server are one address and this
// is empty. Published as plain files somewhere else (HOSTING.md), the page names its server in
// <meta name="partition-server">, and everything below that needs the server goes there.
const SERVER=(document.querySelector('meta[name="partition-server"]')?.content||'').replace(/\/+$/,''), elsewhere=SERVER!=='';
// Which way in this is. The server's own page has a path for each; a copy elsewhere is one page
// in one folder, and the audience's way in is marked in the query.
const entry=(elsewhere?new URLSearchParams(location.search).has('watch'):location.pathname==='/watch')?'watch':'play';
const home=elsewhere?location.pathname:'/';
// A link the server made for its own page ("/play#room=…&key=…"), as a link into this page.
const linkHere=link=>{if(!elsewhere)return link;const [path,fragment]=link.split('#');return `${location.pathname}${path==='/watch'?'?watch':''}#${fragment}`;};
const params=new URLSearchParams(location.hash.slice(1)), room=params.get('room'), key=params.get('key');
// Which room and which invitation are read from the part after the # once, when the page loads. A
// link that differs from the open page only there does not load the page again by itself.
window.addEventListener('hashchange',()=>location.reload());
// On a hosted server the link carries an invitation's code after the #, where no server sees it;
// the page hands it over in a header when it asks what it may do and when it makes a room.
const invitation=params.get('invite'), inviteHeader=invitation?{'X-Partition-Invite':invitation}:{};
const seatName={west:'西席',east:'东席',watch:'观众'}, kindName={human:'真人',script:'脚本 stub',model:'真实模型',live:'Gemini Live', 'offline-fixture':'离线 fixture · 非模型'};
let reading=false,voice=null,lastSpoken=0,ttsClient=null,liveClient=null;
let view,scene,selected=null,tab='objects',detailMessage='',previousRender='',overlayClosed=false,commandTail=Promise.resolve();
let lastEventId=0,peerQueue=[],peerCurrent=null,peerUntil=0,peerTimer=null,pendingFocus=null,ownProposal=null,lastLocalCommand=null;
const brand=`<div class="brand"><span class="brand-mark" aria-hidden="true"></span><strong>隔墙</strong><span class="top-sub">THE OTHER SIDE</span></div>`;
async function api(suffix='',data){
  const r=await fetch(`${SERVER}/api/rooms/${room}${suffix}`,{method:data?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
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
  const receivingKey=p?.action==='send-key'&&view.role==='west'&&p.from==='east';
  const useKey=!p&&view.role==='west'&&view.local.keyHere&&!view.local.unlocked&&!view.complete;
  // Which support goes in is this seat's call: it holds the table.
  const choosing=!!p&&p.from!==view.role&&/^brace-\d+$/.test(p.action);
  const acceptLabel=receivingKey?'接过黄铜钥匙':choosing?'同意装这根':'我准备好了';
  const html=p?`<section class="pending" role="region" aria-labelledby="pending-title" data-id="${p.id}"><div><h2 id="pending-title">${receivingKey?'东席正从传物槽递来钥匙':p.from===view.role?'共同动作 · 等待搭档':'搭档需要你确认'}</h2><p>${esc(p.label)} · ${p.from===view.role?'你可以撤回，继续探索。':choosing?'对照承重表和闸重再决定；不对就先等等。':'准备好再同意，也可以先等等。'}</p></div><div class="pending-actions">${p.from!==view.role?`<button id="accept" class="primary">${acceptLabel}</button><button id="decline">先等等</button>`:'<button id="cancel-proposal">撤回提议</button>'}</div></section>`:useKey?'<section class="pending"><h2>黄铜钥匙已在你手中</h2><button id="use-key" class="primary">用钥匙打开西门门锁</button></section>':'';
  if(area.innerHTML===html)return;
  const isNew=p&&area.firstElementChild?.dataset.id!==p.id;
  if(isNew)pendingFocus=document.activeElement;
  area.innerHTML=html;
  for(const [id,type] of [['accept','accept'],['decline','decline'],['cancel-proposal','cancel']]){
    const button=$('#'+id);if(button)button.onclick=()=>command({type,id:p.id});
  }
  const useButton=$('#use-key');
  if(useButton)useButton.onclick=()=>command({type:'action',id:'unlock'});
  document.querySelector('.game').classList.toggle('has-pending',!!p||useKey);
  if(isNew&&matchMedia('(max-width: 680px)').matches&&!$('#composer').contains(document.activeElement))area.querySelector('button')?.focus({preventScroll:true});
  else if(!p&&hadFocus)(useButton||(pendingFocus?.isConnected?pendingFocus:$('#pause')))?.focus({preventScroll:true});
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
async function createRoom(controllers){
  const response=await fetch(`${SERVER}/api/rooms`,{method:'POST',headers:{'Content-Type':'application/json',...inviteHeader},body:JSON.stringify({controllers})});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'创建房间失败');
  return result;
}
function lobby(){
  app.innerHTML=`<header class="topbar">${brand}<span class="badge">LOCAL PROTOTYPE / 01</span></header><main class="lobby"><div class="lobby-grid"><section><div class="eyebrow">一堵墙 · 两个房间 · 同一个出口</div><h1>你看不到的，<br><em>另一侧看得见。</em></h1><p class="intro">先别急着开你的门。查看自己的机关，把发现告诉墙后的人，一起找到离开的办法。</p><div class="setup"><div class="eyebrow">选择这次合作</div><div class="seats"><label class="seat-choice"><span>01 / 西席 · 动力与出口</span><select id="west" disabled></select></label><label class="seat-choice"><span>02 / 东席 · 检修与闸门</span><select id="east" disabled></select></label></div><button class="primary" id="create" disabled>创建这次合作 ↗</button><p class="scope">正在读取本机可用席位…</p><div id="invite" aria-live="polite"></div></div></section><div class="preview" id="preview"><div class="preview-label"><span>WEST / 暖光</span><span>两侧线索各自私有</span><span>EAST / 冷光</span></div></div></div><div class="feature-row"><span>◈ 固定规则，真实机关</span><span>↔ 交换发现，商量行动</span><span>↶ 错了可以调整，没有突然失败</span></div></main>`;
  async function loadSeats(){
    const response=await fetch(`${SERVER}/api/capabilities`,{headers:inviteHeader});
    if(!response.ok)throw Error('capabilities unavailable');
    const c=await response.json();
    // A hosted server lets in whoever holds an invitation. Without a good one the page says so and offers nothing.
    // A hosted server lets in whoever holds an invitation. Without a good one the page asks for the
    // code, which then goes after the # like a link's, and offers nothing else.
    if(c.hosted&&!c.invite?.valid){
      $('.scope').textContent=invitation?'这个邀请码不对，或者已经被收回。请再输入一次，或向邀请你的人确认。':'这个入口需要邀请码。输入邀请你的人给你的码，或者打开他发给你的完整链接。';
      $('#invite').innerHTML='<form class="code-form" id="code-form"><label class="seat-choice"><span>邀请码</span><input id="invite-code" name="invite-code" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="128" required></label><button class="primary" type="submit">进入</button></form>';
      const box=$('#invite-code');box.value=invitation||'';box.focus();
      $('#code-form').onsubmit=event=>{event.preventDefault();const code=box.value.trim();if(code)location.hash='invite='+encodeURIComponent(code);};
      return;
    }
    const west=$('#west'),east=$('#east');
    west.add(new Option('真人','human'));
    if(c.liveOnly){
      if(!c.live?.enabled)throw Error('Live unavailable');
      east.add(new Option('Gemini Live · 语音搭档','live'));
      // What is left to this visitor: the invitation's own count on a hosted server, never more than the server's.
      const left=c.hosted?Math.min(c.live.remaining,c.invite.remaining):c.live.remaining;
      let status=c.hosted?'进入西席后，由你点击开始语音。你的语音和游戏上下文会经由本服务发送给 Google。本服务不保存录音，也不保存你说了什么；你打字发给搭档的话和房间里的操作会留在服务端的运行记录里。':
        '进入西席后，由你点击开始语音。麦克风音频和游戏上下文会发送给 Google。';
      if(left===0)status=c.hosted?'这条邀请的语音次数已经用完，或者这个服务的总次数已经用完。':'本入口没有可用连接次数。';
      else if(c.live.projectVerified===false)status='项目费用和真人音频隐私设置待核实，当前不能开麦。';
      $('.scope').textContent=c.hosted?`受邀：${c.invite.name}。还可以开始 ${left} 次语音。仅限年满 18 岁的玩家。${status}`:`剩余${c.live.remaining}次本机连接。 ${status}`;
    }else{
      west.add(new Option('脚本 stub · harness','script'));
      east.add(new Option('脚本 stub · harness','script'));
      east.add(new Option('真人','human'));
      if(c.modelEnabled)for(const seat of [west,east])seat.add(new Option('真实模型 · 已启用调用','model'));
      if(c.live?.enabled){east.add(new Option('Gemini Live · 语音AI','live'));east.value='live';}
      west.disabled=false;east.disabled=false;
      // A stand-in has not learned the battery or the choice of supports: say what its room lacks.
      const about=c.live?.enabled?`Gemini Live 由你点击开启麦克风，每段最多 ${c.live.seconds} 秒；可能实际计费。`:'脚本席位使用固定策略。';
      const fit=()=>{$('.scope').textContent=about+([west.value,east.value].some(v=>v==='script'||v==='model')?'脚本和模型席位是开发用的替身，还不会用备用电池和挑支撑：和它们开的房间只有基础机关。':'');};
      west.onchange=east.onchange=fit;fit();
    }
    $('#create').disabled=false;
  }
  loadSeats().catch(()=>{$('.scope').textContent='无法读取席位配置，请刷新页面。';});
  scene=new RoomScene($('#preview'),()=>{});scene.update({role:'watch',public:{},scene:[]});
  $('#create').onclick=async()=>{
    const b=$('#create');b.disabled=true;b.textContent='正在接通两侧…';
    try{
      const d=await createRoom({west:$('#west').value,east:$('#east').value});
      $('#invite').innerHTML=`<div class="invite"><strong>房间已准备好</strong><p class="small">这是组织者入口。把各席链接交给对应玩家；玩家页面只能看到自己的房间。观众只看公开事件与建筑机位。</p>${Object.entries(d.links).filter(([,u])=>u).map(([s,u])=>`<a class="button ${s==='watch'?'':'primary'}" href="${esc(linkHere(u))}" target="_blank" rel="noopener">${s==='watch'?'打开只读观众':'进入'+seatName[s]} ↗</a>`).join('')}<p class="small">邀请第二位真人：右键对应入口复制链接。服务限本机；同机两个独立标签页可玩。远程联网尚未实现。</p></div>`;
    }catch(e){$('#invite').textContent=e.message;}finally{b.disabled=false;b.textContent='再开一个房间';}
  };
}
function layout(){
  const watching=view.role==='watch';
  app.innerHTML=`<main class="game ${view.role}"><header class="topbar">${brand}<div class="top-meta"><span class="badge">${watching?'只读观众':seatName[view.role]+' · 玩家'}</span>${!watching?'<button class="ghost voice" id="voice" disabled title="仅使用本机中文声音；不支持语音输入">朗读不可用</button><button class="ghost" id="pause" title="Esc 暂停或继续">暂停</button>':''}</div></header><div class="goalbar"><h1>一起走到墙外。</h1><div class="steps"><span class="current">01 发现</span><span>02 沟通</span><span>03 尝试</span><span>04 一起离开</span></div><span class="small">${watching?'公开状态 · 不提供任何私有线索':'沉默不会推进失败 · 随时可以调整'}</span></div>${watching?'<nav class="camera-bar" aria-label="观众机位"><button data-camera="west">西侧机位</button><button data-camera="cut" class="active">剖面总览</button><button data-camera="east">东侧机位</button></nav>':''}<div class="workspace"><section class="stage-wrap"><div class="stage" id="scene"><div class="scene-label"><div class="eyebrow">ROOM 01 / ${watching?'PUBLIC ARCHITECTURE':view.role.toUpperCase()}</div><h2>${watching?'隔墙之间':view.role==='west'?'动力间':'检修间'}</h2><p class="small">${watching?'建筑视角可切换。未公开的物件和线索不在观众画面中。':'点一下房间里的物件。也可用下方按钮，Tab + Enter 操作。'}</p></div><div class="scene-tag">${watching?'机位：剖面总览':'只加载本席房间'}</div><div class="scene-state" id="scene-state"></div></div><div class="stage-caption" id="feedback" role="status" aria-live="polite">${watching?'公开动静会在下方依次显示，也可以在右侧回看。':'先查看'+(view.role==='west'?'出口铭牌':'升降闸')+'，发现会记在你的线索本里。'}</div><div class="peer-cue" id="peer-cue"><div><span class="source">${watching?'公开动静':'墙的另一侧'}</span><p id="peer-text" role="status" aria-live="polite">暂无机关动静。我的操作结果会保留在上方。</p></div><button id="peer-next" disabled>已读到最新</button></div><nav class="objectbar" id="objectbar" aria-label="本侧可交互物"></nav></section><aside class="side">${watching?'<div class="tabs"><button class="active">公开事件</button></div><div class="timeline" id="timeline"></div><div class="studio-links" id="studio"></div>':`<nav class="tabs"><button data-tab="objects" class="active">物件</button><button data-tab="notes">线索本</button><button data-tab="messages">对讲记录</button></nav><div class="inspect" id="inspect"></div><div class="hint"><span id="hint-count">提示 0 / 3</span><button id="hint">给一点方向</button></div><div id="pending"></div><section id="tts-panel" class="chat" aria-label="语音朗读"></section><section class="chat"><div class="chat-title"><span><i class="dot"></i>墙后对讲</span><span id="partner-kind"></span></div><div class="latest" id="latest">对面已经接通。你可以先查看自己的房间。</div><form id="composer" class="composer"><textarea id="message" rows="1" maxlength="500" aria-label="给搭档的消息" placeholder="告诉对方你的发现…"></textarea><button class="primary" type="submit">发送</button></form><div class="small" id="composer-note">文字只发送消息，不会自动操作机关。</div></section>`}</aside></div><div id="overlay"></div></main>`;
  scene=new RoomScene($('#scene'),id=>selectObject(id));scene.update(view);
  $('#peer-next').onclick=advancePeerCue;
  if(!watching)new ResizeObserver(()=>document.querySelector('.game').style.setProperty('--pending-height',($('#pending').offsetHeight+16)+'px')).observe($('#pending'));
  if(watching){document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>{scene.setCamera(b.dataset.camera);document.querySelectorAll('[data-camera]').forEach(x=>x.classList.toggle('active',x===b));$('.scene-tag').textContent='机位：'+b.textContent;});}
  else{
    const refreshVoice=()=>{voice=globalThis.speechSynthesis?.getVoices().find(v=>v.localService&&/^zh/i.test(v.lang));$('#voice').disabled=!voice;$('#voice').textContent=voice?(reading?'本机朗读：开':'本机朗读：关'):'无本机朗读';};refreshVoice();globalThis.speechSynthesis?.addEventListener('voiceschanged',refreshVoice);$('#voice').onclick=()=>{reading=!reading;globalThis.speechSynthesis.cancel();refreshVoice();};
    ttsClient=setupTts({room,key,getView:()=>view,server:SERVER});
    const livePanel=document.createElement('section');livePanel.id='live-panel';livePanel.className='chat';$('#tts-panel').before(livePanel);
    liveClient=setupLive({room,key,getView:()=>view,server:SERVER,worklet:new URL('./mic-worklet.js',import.meta.url).href});
    if(Object.values(view.controllers).includes('live')){$('#tts-panel').hidden=true;$('#voice').hidden=true;}
    // Say what a typed line does with the partner this room has.
    const partner=view.controllers[view.role==='west'?'east':'west'];
    $('#composer-note').textContent='文字只发送消息，不会自动操作机关。'+(partner==='script'?'脚本只理解有限状态。':partner==='live'?'语音进行中时，搭档也会收到这句话。':'');
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
const factBody=f=>f.table?`<p>${esc(f.table.caption)}</p><table class="fact-table"><thead><tr>${f.table.columns.map(c=>`<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${f.table.rows.map(r=>`<tr>${r.map((c,i)=>i?`<td>${esc(c)}</td>`:`<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table>`:`<p>${esc(f.text)}</p>`;
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
      html=`<div class="eyebrow">我看到 / ${seatName[view.role]}</div><h2>${esc(o.name)}</h2>${f?factBody(f):`<p>${esc(detailMessage)}</p>`}${f&&!f.table?`<button data-share="${esc(f.id)}" class="ghost">↗ 把这条发现告诉搭档</button>`:f?'<p class="small">这张表只能自己看。需要的数字，说给搭档听。</p>':''}<div class="actions">${o.actions.map(a=>`<button data-action="${a.id}" ${view.paused||view.complete||(view.pending&&a.shared)?'disabled':''}>${esc(a.label)} <span aria-hidden="true">→</span></button>`).join('')}</div>`;
    }
  }else if(tab==='notes'){
    const cards=[...view.notes.map(n=>({...n,mine:true})),...view.shared.filter(n=>n.seat!==view.role)];
    html='<div class="eyebrow">只记录真实发现</div><h2>线索本</h2>'+(cards.length?cards.map(n=>`<article class="clue-card"><span class="source">${n.mine?'我看到':'搭档分享 / '+esc(n.source)}</span>${factBody(n)}${n.mine&&!n.table?`<button data-share="${esc(n.id)}">分享这条线索 ↗</button>`:''}</article>`).join(''):'<p>查看物件后，重要发现会留在这里。</p>');
  }else html='<div class="eyebrow">可以随时回看</div><h2>对讲记录</h2>'+view.messages.map(m=>`<article class="clue-card"><span class="source">${seatName[m.seat]} · ${kindName[m.source]}</span><p>${esc(m.text)}</p></article>`).join('')+'<h2>机关动静</h2>'+view.events.filter(e=>['action','request','decision'].includes(e.type)).map(e=>`<article class="clue-card"><span class="source">#${e.id} · ${seatName[e.seat]} · ${kindName[e.source]}</span><p>${esc(e.text)}</p></article>`).join('');
  if(html!==previousRender){$('#inspect').innerHTML=html;previousRender=html;document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>command({type:'action',id:b.dataset.action}));document.querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>command({type:'share',id:b.dataset.share}));if(focused)(document.querySelector(`[data-action="${focused}"]`)||document.querySelector('.actions button')||document.querySelector(`[data-object="${selected}"]`))?.focus({preventScroll:true});}
}
function render(){
  ttsClient?.update();
  liveClient?.update();
  scene.update(view);
  const l=view.local;$('#scene-state').textContent=view.role==='watch'?`公开机关 · 动力：${view.public.power?'开启':'关闭'} · 西门：${view.public.doorOpen?'开启':'关闭'} · 东闸：${view.public.gateOpen?'升起':'落下'}`:view.role==='west'?`动力：${l.power?'开启':'关闭'} · 钥匙：${l.unlocked?'已插入门锁':l.keyHere?'已收到':view.pending?.action==='send-key'?'等待你接过':'未收到'} · 西门：${l.doorOpen?'已推开':l.unlocked?'已解锁，尚未推开':'已上锁'}${l.cells?` · 备用电池：${'■'.repeat(l.charge)}${'□'.repeat(l.cells-l.charge)}${l.packs?`（已换 ${l.packs} 组）`:''}`:''}`:`风扇：${l.fanSpinning?'转动':'停转'} · 手闸：${l.holdingBrake?'握住':'松开'} · 闸门：${l.gateOpen?'升起':'落下'}${'support' in l?` · 支撑槽：${l.support?`刻着${l.support}的支撑`:'空'}`:''}`;
  document.querySelectorAll('.steps span').forEach((s,i)=>s.classList.toggle('current',i===(view.complete?3:view.events.some(e=>e.type==='action')?2:view.shared.length?1:0)));
  if(view.paused)globalThis.speechSynthesis?.cancel();
  if(view.role==='watch'){
    $('#timeline').innerHTML=view.events.slice().reverse().map(e=>`<div class="event"><span>#${e.id} · ${seatName[e.seat]||'房间'} · ${kindName[e.source]||e.source} · ${esc(e.type)}</span>${esc(e.text)}</div>`).join('');
    $('#studio').innerHTML=['west','east'].map(s=>`<button data-studio="${s}" ${view.controllers[s]==='human'?'disabled':''}>${seatName[s]} Trace Studio ↗</button>${view.controllers[s]==='live'?`<button data-studio="${s}" data-live="1">${seatName[s]} Live 会话总览 ↗</button>`:''}`).join('')+'<p class="small">现有 Trace Studio 的公开投影；私有观察、动作参数、模型内部内容不对观众开放。</p>';
    document.querySelectorAll('[data-studio]').forEach(button=>button.onclick=()=>{
      const url=new URL(location.href);
      url.searchParams.set('trace',button.dataset.live?'live-trace':'studio');
      url.searchParams.set('seat',button.dataset.studio);
      window.open(url,'_blank','noopener,noreferrer');
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
  if(view.complete&&!overlayClosed)overlay=`<div class="paused-overlay victory" role="dialog" aria-modal="true" aria-label="共同通关"><div class="eyebrow">CHAPTER 01 / TOGETHER</div><h2>这次，没有谁被留下。</h2>${view.rating?`<p class="rating"><span role="img" aria-label="${view.rating.stars} 星，满分 3 星">${'★'.repeat(view.rating.stars)}${'☆'.repeat(3-view.rating.stars)}</span> 接通动力 ${view.rating.powerOns} 次 · ${view.rating.packs?`换了 ${view.rating.packs} 组电池`:'没有换电池'}</p>`:''}<p>动力熄了，支撑还在。你们用各自的发现，让同一个出口终于对两个人敞开。</p><button id="review" class="primary">回看我们的合作</button><p class="small">这是一关原型。${Object.values(view.controllers).includes('script')?'脚本 stub 通关不代表真实模型已验证。':''}</p></div>`;
  else if(view.paused)overlay=`<div class="paused-overlay" role="dialog" aria-modal="true" aria-label="已暂停"><div class="eyebrow">PAUSED</div><h2>墙的两侧，都在等。</h2><p>机关与双方行动已暂停，不会消耗时间或资源。</p>${view.role!=='watch'?'<button id="resume" class="primary">继续合作</button>':'<p>等待玩家恢复。</p>'}</div>`;
  if($('#overlay').innerHTML!==overlay){$('#overlay').innerHTML=overlay;document.querySelectorAll('.game > :not(#overlay)').forEach(e=>e.inert=!!overlay);if(overlay)$('#overlay button')?.focus();else $('#pause')?.focus({preventScroll:true});if($('#resume'))$('#resume').onclick=()=>command({type:'pause'});if($('#review'))$('#review').onclick=()=>{overlayClosed=true;tab='messages';render();};}
  receivePeerEvents();
}
document.addEventListener('keydown',e=>{if(e.key==='Tab'&&$('#overlay button')){e.preventDefault();$('#overlay button').focus();return;}if(e.key==='Escape'&&view&&view.role!=='watch'&&!view.complete){e.preventDefault();command({type:'pause'});}});
async function showTrace(endpoint,seat){
  document.title='《隔墙》 · 房间 Trace';
  app.innerHTML='<main class="trace-view"><header><h1>房间 Trace</h1><button id="trace-refresh">刷新记录</button></header><p role="status" id="trace-status"></p><iframe title="公开会话记录" sandbox></iframe></main>';
  const frame=app.querySelector('iframe'), status=$('#trace-status');
  let loading=false, previous=null;
  async function refresh(){
    if(loading||document.hidden)return;
    loading=true;
    try{
      const r=await fetch(`${SERVER}/api/rooms/${room}/${endpoint}?seat=${seat}`,{headers:{Authorization:`Bearer ${key}`},cache:'no-store'});
      if(!r.ok)throw Error((await r.json()).error);
      const html=await r.text();
      if(html!==previous){frame.srcdoc=html;previous=html;}
      status.textContent='';
    }catch(e){status.textContent=e.message;}
    finally{loading=false;}
  }
  $('#trace-refresh').onclick=refresh;
  document.addEventListener('visibilitychange',refresh);
  await refresh();
}
const query=new URLSearchParams(location.search);
if(room&&key&&entry==='watch'&&['live-trace','studio'].includes(query.get('trace'))&&['east','west'].includes(query.get('seat'))){
  await showTrace(query.get('trace'),query.get('seat'));
}else if(!room&&!key&&entry==='play'&&(elsewhere||location.pathname==='/play')&&new URLSearchParams(location.search).get('join')==='live'){
  try{
    const created=await createRoom({west:'human',east:'live'});
    location.replace(linkHere(created.links.west));
  }catch(e){
    app.innerHTML=`<div class="loading"><h1>无法进入真人语音房</h1><p>${esc(e.message)}</p><a href="${esc(home)}">返回开局页</a></div>`;
  }
}else if(!room||!key)lobby();else{
  try{view=await api();if((entry==='watch')!==(view.role==='watch'))throw Error('入口与凭证角色不一致。请使用原始席位链接。');layout();render();
    setInterval(async()=>{try{const next=await api();if(next.rev>=view.rev&&(next.rev!==view.rev||JSON.stringify(next.worker)!==JSON.stringify(view.worker))){view=next;render();}}catch(e){notice(e.message,true);}},650);
  }catch(e){app.innerHTML=`<div class="loading"><h1>没有接通房间</h1><p>${esc(e.message)}</p><a href="${esc(home)}">返回开局页</a></div>`;}
}
