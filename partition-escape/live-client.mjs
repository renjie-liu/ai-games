export function setupLive({room,key,getView}){
  const panel=document.querySelector('#live-panel');if(!panel)return {stop(){},update(){}};
  const view=getView(),other=view.role==='west'?'east':'west';if(view.controllers[other]!=='live')return {stop(){},update(){}};
  panel.innerHTML='<h2>与 Gemini Live 对话</h2><p id="live-state" role="status" aria-live="polite">麦克风关 · 尚未连接</p><div class="actions"><button id="live-start" class="primary" aria-describedby="live-notice" disabled>开始语音</button><button id="live-continue" class="primary" aria-describedby="live-notice" hidden>在本局继续语音</button><a id="live-new-room" class="button primary" href="/play?join=live" hidden>开新房与 Gemini 通话</a><button id="live-stop" disabled>结束语音</button><button id="live-interrupt" disabled>打断 / 先等等</button></div><p id="live-you"></p><p id="live-partner"></p><p id="live-result" class="small"></p><details id="live-details" open><summary>语音说明、用量上限与数据条款</summary><p class="small" id="live-notice">开启或继续语音，即确认你已满 18 岁、在<a href="https://aistudio.google.com/docs/available-regions" target="_blank" rel="noopener noreferrer">支持地区</a>试玩，并同意 Google 处理你的声音和本局游戏上下文。当前项目的数据设置未经核实；免费服务可能将内容用于产品改进或人工审核。请只谈游戏。<a href="https://aistudio.google.com/docs/terms" target="_blank" rel="noopener noreferrer">Google 数据条款</a></p><p class="small" id="live-caps">切换标签页会关闭麦克风并结束本段语音，返回后可在本局续聊。随时可点「结束语音」。</p><p id="live-budget" class="small"></p><p id="live-sync-state" role="status" aria-live="polite">公开状态更新：尚未开启语音。</p></details>';
  const el=id=>document.getElementById(id);let current=null,used=false,touched=false,fixtureButton;
  let generation, closing;
  // What one voice session may use, as the server reports it (live-limits.json). Never a constant here.
  const caps={};
  const duration=s=>s>=120&&s%60===0?`${s/60} 分钟`:`${s} 秒`;
  function showCaps(status){
    for(const k of ['seconds','inputSeconds','outputSeconds','usageStopUsd'])if(Number.isFinite(status?.[k])&&status[k]>0)caps[k]=status[k];
    if(!caps.seconds)return;
    const parts=[`每段语音最多 ${duration(caps.seconds)}`];
    if(caps.inputSeconds&&caps.outputSeconds)parts.push(`其中可发言 ${duration(caps.inputSeconds)}、听回复 ${duration(caps.outputSeconds)}`);
    if(caps.usageStopUsd)parts.push(`费用估算到 $${caps.usageStopUsd} 会自动结束`);
    el('live-caps').textContent=`切换标签页会关闭麦克风并结束本段语音，返回后可在本局续聊。${parts.join('，')}。随时可点「结束语音」。`;
  }
  let leftTab=false;
  function tabMessage(){
    return '切换标签页已关闭麦克风，本局进度已保留。'+(used?(Number.isInteger(generation)?'点击「在本局继续语音」重新连接 Gemini。':'本房间仍可操作机关。'):'可点击「开始语音」。');
  }
  let syncVersion=-1,syncSnapshot=null,syncStopped=false;
  function roomStartMessage(phase){
    if(phase==='closed')return Number.isInteger(generation)?'麦克风已关闭，本段语音已结束。点击「在本局继续语音」重新连接 Gemini，钥匙和机关进度会保留。':'本段语音已结束；本房间仍可接钥匙和操作机关。';
    if(phase==='active')return '本房间已有语音连接，请回到开启语音的标签页。';
    return '';
  }
  function showNewRoom(){
    el('live-start').disabled=true;
    el('live-start').hidden=true;
    const canContinue=Number.isInteger(generation)&&!getView().complete;
    el('live-new-room').hidden=canContinue;
    el('live-continue').hidden=!canContinue;
    el('live-continue').disabled=false;
  }
  function renderSync(){
    const d=syncSnapshot;if(!d)return;
    const text=[];if(d.source==='offline-fixture')text.push('离线 fixture（非真实模型）');
    if(syncStopped||d.phase==='closed')text.push('语音已结束；后续按钮操作不会同步给搭档。');
    else if(d.phase==='off')text.push('尚未开启语音；按钮操作不会通知语音搭档。');
    if(d.not_delivered)text.push(`有${d.not_delivered}条状态记录未送达，搭档可能还不知道最新变化。`);
    if(d.limited)text.push('已达同步上限，不会自动补送。');
    if(d.uncertain)text.push(`${d.uncertain}条送达情况不确定，不自动重试。`);
    if(d.untracked)text.push('状态记录超过显示上限，无法完整确认送达。');
    if(d.queued)text.push(`${d.queued}条排队中。`);
    if(d.forwarded)text.push(`${d.forwarded}条等待发送确认。`);
    if(d.sending)text.push(`${d.sending}条尝试发送中。`);
    if(d.sent)text.push(d.source==='offline-fixture'?`${d.sent}条仅模拟发送，未调用模型。`:`${d.sent}条已发送；不代表搭档理解或掌握最新状态。`);
    if(!d.queued&&!d.forwarded&&!d.sending&&!d.sent&&!d.not_delivered&&!d.uncertain&&d.phase==='active')text.push('尚无需要同步的按钮结果或分享。');
    text.push('机关是否执行，以画面上的结果为准。');
    el('live-sync-state').textContent='公开状态更新：'+text.join(' ');
    const warning=!!(d.not_delivered||d.uncertain||d.untracked);
    el('live-sync-state').dataset.state=warning?'warning':'info';
    if(warning)el('live-details').open=true; // a gap in what the partner was told must not stay folded away
  }
  function syncStatus(d){
    const counts=['queued','forwarded','sending','sent','not_delivered','uncertain'];
    if(!d||!Number.isSafeInteger(d.version)||d.version<=syncVersion||!['off','active','closed'].includes(d.phase)||!['offline-fixture','live-local'].includes(d.source)||counts.some(k=>!Number.isSafeInteger(d[k])||d[k]<0||d[k]>128)||typeof d.limited!=='boolean'||typeof d.untracked!=='boolean')return;
    syncVersion=d.version;syncSnapshot=d;renderSync();
    if(!current&&d.phase!=='off'){
      el('live-start').disabled=true;
      if(d.phase==='closed')showNewRoom();
      if(!used&&!leftTab)state(roomStartMessage(d.phase));
    }
  }
  const state=t=>el('live-state').textContent=t;
  // Codes the server and worker send, in words. An unknown code is shown as it is.
  const capped=what=>`本段语音的${what}已用到上限`;
  const reasons={live_harness_mismatch:'配套的 harness 版本不对，请按 README 准备固定版本后重启服务',live_limits_invalid:'live-limits.json 或 PARTITION_LIVE_LIMITS 指向的文件有误，请修正后重启服务',
    live_runtime_check_failed:'本地语音环境检查失败，请检查 Python 安装',live_project_unverified:'项目费用和真人音频隐私设置待核实，麦克风关闭',
    live_authorization_exhausted:'本轮连接额度已用完，未发起模型连接',live_authorization_required:'本机还没有连接授权，见 LIVE.md',gemini_key_unavailable:'服务端没有可用的 GEMINI_API_KEY',
    session_deadline:capped('时长'),live_input_seconds_limit:capped('发言时长'),live_output_seconds_limit:capped('回复时长'),live_turns_limit:capped('对话轮数'),
    live_tools_limit:capped('机关操作次数'),live_text_bytes_limit:capped('文字上下文'),live_usage_stop:'本段语音的费用估算已到上限',
    provider_go_away_no_reconnect:'Gemini 结束了这次连接',user_stop:'已手动结束',tab_hidden:'切换了标签页',game_paused:'游戏已暂停',
    client_heartbeat_lost:'页面与本机服务失去联系',browser_disconnected:'页面断开了连接',worker_stopped:'语音进程意外退出，见 .runs 下的记录'};
  const reasonText=code=>code?.startsWith('live_dependency_')?'本地语音依赖缺失，请按 README 安装 requirements-live.txt 后重启服务':reasons[code]||code;
  function sessionHeaders(session){
    return Number.isInteger(session)?{'X-Live-Generation':String(session)}:{};
  }
  async function api(suffix,data,signal,session){
    const r=await fetch(`/api/rooms/${room}/live-${suffix}`,{method:data?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...sessionHeaders(session)},body:data?JSON.stringify(data):undefined,signal,keepalive:data?.type==='stop'});
    const d=await r.json();if(!r.ok)throw Error(d.error||'连接失败');return d;
  }
  function clearAudio(s){for(const n of s.audioNodes){try{n.stop();}catch{}}s.audioNodes=[];s.schedule=s.ctx?.currentTime||0;}
  function stop(reason='麦克风关 · 语音已结束',s=current){
    if(!s||current!==s)return;
    // Invalidate first. Pending permission, fetch, module and playback callbacks
    // belong to this attempt, never a later attempt or the visible stopped UI.
    if(document.hidden){leftTab=true;reason=tabMessage();}
    current=null;s.cancelled=true;s.active=false;
    clearInterval(s.heartbeat);clearTimeout(s.timer);clearTimeout(s.finishTimer);clearTimeout(s.replyTimer);
    s.track?.getTracks().forEach(t=>t.stop());s.node?.disconnect();s.source?.disconnect();clearAudio(s);
    s.abort.abort();s.ctx?.close().catch(()=>{});
    const closeStream=()=>{s.streamAbort.abort();s.reader?.cancel().catch(()=>{});};
    if(s.startSent){
      const message=leftTab?{type:'stop',reason:'tab_hidden'}:{type:'stop'};
      closing=api('input',message,globalThis.AbortSignal?.timeout(1500),s.generation)
        .catch(()=>{}).finally(closeStream);
    }else closeStream();
    el('live-stop').disabled=true;el('live-stop').textContent='结束语音';el('live-interrupt').disabled=true;
    el('live-start').hidden=used;el('live-start').disabled=used;if(fixtureButton)fixtureButton.disabled=used;
    if(used||syncSnapshot?.phase==='closed')showNewRoom();
    else if(syncSnapshot?.phase==='active')el('live-start').disabled=true;
    state(reason);syncStopped=true;renderSync();
  }
  // The winning screen covers the stop button, so a won game must close the microphone itself.
  // The partner is usually still saying its last line when the door opens: let that reply play
  // out, then stop. If no reply ends, stop after the grace period anyway.
  const WON='已通关 · 麦克风已关闭',WON_GRACE_MS=20000;
  // How long the player waits after speaking before the page says the partner has not answered.
  const NO_REPLY_HINT_MS=15000;
  const LISTENING='在听 · 麦克风已开启';
  // The player's turn is over: the page waits for the partner, and says so if nothing comes.
  function awaitReply(s){
    s.replied=false;s.awaiting=true;clearTimeout(s.replyTimer);
    s.replyTimer=setTimeout(()=>{if(current===s&&s.active&&!s.replied&&!s.speaking)state('搭档还没有回应 · 可以再说一遍');},NO_REPLY_HINT_MS);
  }
  // The partner's turn is over. If nothing is playing, the page goes back to listening; if the
  // turn had no voice at all, it says that instead of leaving "waiting for the partner" up for good.
  function turnOver(s){
    clearTimeout(s.replyTimer);
    const awaited=s.awaiting;s.awaiting=false;
    if(s.speaking||s.audioNodes.length)return;
    state(s.replied||!awaited?LISTENING:'搭档这一轮没有出声 · 可以再说一遍');
  }
  function finishWhenQuiet(s){
    if(current!==s||!s.finishing)return;
    if(s.turnDone&&!s.audioNodes.length)stop(WON,s);
  }
  function gameWon(){
    const s=current;if(!s||s.finishing)return;
    s.finishing=true;s.turnDone=false;
    s.finishTimer=setTimeout(()=>stop(WON,s),WON_GRACE_MS);
  }
  function valid(s){
    if(current!==s||s.cancelled)return false;
    if(document.hidden){pauseForTab();return false;}
    if(getView().paused){stop('游戏暂停 · 已关闭麦克风',s);return false;}
    return true;
  }
  function send(s,b){
    if(!valid(s)||!s.active)return Promise.resolve();
    if(++s.queued>30){stop('网络积压，语音已停止',s);return Promise.resolve();}
    s.upload=s.upload.then(()=>valid(s)&&s.active?api('input',b,s.abort.signal,s.generation):undefined)
      .catch(()=>{if(valid(s))stop('连接中断，未自动重连',s);}).finally(()=>s.queued--);
    return s.upload;
  }
  function playback(s,m){
    if(!valid(s)||!s.active||s.speaking||s.ctx?.state!=='running'||m.epoch<s.epoch)return;
    const bytes=Uint8Array.from(atob(m.data),c=>c.charCodeAt(0)),v=new DataView(bytes.buffer);
    // Gemini can deliver a reply faster than the device plays it. Bound the
    // buffer by the worker's 20-second output allowance plus scheduling lead.
    const now=s.ctx.currentTime,playAt=Math.max(now+.02,s.schedule);
    const endAt=playAt+bytes.length/48000;
    if(caps.outputSeconds&&endAt-now>caps.outputSeconds+.05){stop('回复音频超过本段播放上限',s);return;}
    const buffer=s.ctx.createBuffer(1,bytes.length/2,24000),values=buffer.getChannelData(0);for(let i=0;i<values.length;i++)values[i]=v.getInt16(i*2,true)/32768;
    const n=s.ctx.createBufferSource();n.buffer=buffer;n.connect(s.ctx.destination);s.audioNodes.push(n);
    n.onended=()=>{
      s.audioNodes=s.audioNodes.filter(x=>x!==n);
      finishWhenQuiet(s);
      if(valid(s)&&s.active&&!s.audioNodes.length)state(s.fixture?'离线 fixture · 没有麦克风或模型':s.listening?LISTENING:'已连接 · 正在启动收音');
    };
    n.start(playAt);s.schedule=endAt;s.replied=true;clearTimeout(s.replyTimer);
    state(s.fixture?'离线 fixture 提示音 · 非模型':'搭档在说 · 可以直接开口打断');
  }
  function listenWhenReady(s){
    if(!s.connected||!s.source||s.listening)return;
    s.source.connect(s.node);
    s.listening=true;
    state('在听 · Gemini Live 已连接，请先和搭档说句话');
  }
  function onEvent(s,m){
    if(!valid(s))return;
    if(m.type==='sync_status')syncStatus(m.sync);
    if(m.type==='ready'){
      s.connected=true;
      if(s.fixture)state('离线 fixture 已连接 · 无真实模型');
      else listenWhenReady(s);
    }
    if(m.type==='interrupted'){s.epoch=Math.max(s.epoch,m.epoch||0);clearAudio(s);}
    if(m.type==='audio')playback(s,m);
    if(m.type==='transcript'){
      const target=el(m.speaker==='you'?'live-you':'live-partner');
      if(target.dataset.turn!==String(m.epoch)){target.textContent=m.speaker==='you'?'我听到：':'搭档：';target.dataset.turn=String(m.epoch);}
      target.textContent=(target.textContent+m.text).slice(-1500);
    }
    if(m.type==='tool'){const r=m.receipt;el('live-result').textContent=r?`${r.command} · ${r.outcome} · 房间事件 ${r.roomEventIds.map(x=>'#'+x).join('、')||'无新增'}（以机关回执为准）`:'工具未发出或被 harness 中止';}
    if(m.type==='tool')s.replied=true;
    if(m.type==='turn_complete'){
      if(s.finishing){s.turnDone=true;finishWhenQuiet(s);}
      if(current===s&&s.active&&!s.fixture)turnOver(s);
    }
    if(m.type==='usage')el('live-budget').textContent=`保守费用估算 $${m.estimatedUsd.toFixed(6)}，非账单；credits未核验`;
    if(m.type==='closed')stop('语音已停止：'+reasonText(m.reason)+'。机关进度已保留，不会自动重连。',s);
  }
  async function readStream(s){
    const r=await fetch(`/api/rooms/${room}/live-stream`,{headers:{Authorization:`Bearer ${key}`,...sessionHeaders(s.generation)},signal:s.streamAbort.signal});
    if(!valid(s)){r.body?.cancel().catch(()=>{});return;}
    if(!r.ok)throw Error('语音下行连接失败');s.reader=r.body.getReader();const decode=new TextDecoder();
    (async()=>{
      let pending='';try{
        while(valid(s)){
          const {value,done}=await s.reader.read();if(!valid(s))return;if(done)break;
          pending+=decode.decode(value,{stream:true});let i;
          while((i=pending.indexOf('\n'))>=0){const row=pending.slice(0,i);pending=pending.slice(i+1);if(row)onEvent(s,JSON.parse(row));}
        }
        if(valid(s))stop('语音连接已结束',s);
      }catch(e){if(valid(s))stop('语音连接中断',s);}
    })();
  }
  function pauseForTab(){
    if(!current)return;
    leftTab=true;
    stop(tabMessage());
  }
  async function resumeSegment(s,status){
    // A manual click can arrive while the previous process is still closing.
    // Only a confirmed local close-in-progress may be polled. Start Live once.
    const deadline=Date.now()+5000;
    while(valid(s)){
      if(status.sync?.phase==='off')return status;
      if(status.sync?.phase!=='closed')throw Error('本房间已有语音连接，请回到开启语音的标签页。');
      if(!Number.isInteger(status.generation)||status.generation!==generation)throw Error('语音状态已更新，请刷新本页。');
      try{
        const next=await api('renew',{},s.abort.signal,generation);
        if(!valid(s))return;
        generation=next.generation;
        return await api('status',undefined,s.abort.signal);
      }catch(e){
        if(!valid(s))return;
        if(!e.message.includes('上一段语音正在关闭')||Date.now()>=deadline)throw e;
        await new Promise(resolve=>setTimeout(resolve,200));
      }
    }
  }
  async function begin(mock=false,resume=false){
    if(current||(used&&!resume)||document.hidden||getView().paused||getView().complete)return;
    const s={fixture:mock,cancelled:false,active:false,listening:false,connected:false,startSent:false,
      abort:new AbortController(),streamAbort:new AbortController(),audioNodes:[],schedule:0,upload:Promise.resolve(),queued:0,epoch:0,speaking:false};
    current=s;touched=true;leftTab=false;el('live-continue').disabled=true;syncStopped=false;renderSync();el('live-start').disabled=true;if(fixtureButton)fixtureButton.disabled=true;
    el('live-stop').disabled=false;el('live-stop').textContent='取消启动';
    state(mock?'正在连接离线 fixture…':'正在检查本地语音环境与额度');
    try{
      if(!mock){
        if(resume&&closing){await closing;if(!valid(s))return;}
        let status=await api('status',undefined,s.abort.signal);if(!valid(s))return;
        showCaps(status);
        if(!status.runtimeReady)throw Error(status.runtimeCode);if(status.remaining===0)throw Error('live_authorization_exhausted');
        if(status.projectVerified===false)throw Error('live_project_unverified');
        if(resume){
          state('正在本局准备下一段语音，麦克风关闭');
          status=await resumeSegment(s,status);
          if(!valid(s))return;
          if(!status||status.sync?.phase!=='off')throw Error('本局语音状态已变更，请刷新本页。');
          used=false;syncVersion=-1;syncSnapshot=null;
          el('live-continue').hidden=true;el('live-start').hidden=false;
          for(const id of ['live-you','live-partner']){
            el(id).textContent='';delete el(id).dataset.turn;
          }
        }else if(generation!==undefined&&generation!==status.generation)throw Error('语音会话已更换，请刷新本房间。');
        s.generation=generation=status.generation;
        syncStatus(status.sync);
        const blocked=roomStartMessage(syncSnapshot?.phase);
        if(blocked){stop(blocked,s);return;}
        state('请在浏览器中允许麦克风 · 可取消启动');
        // Only an explicit click requests permission. A cancelled permission prompt
        // may still resolve: stop the returned tracks before storing or using them.
        const captured=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
        if(!valid(s)){captured.getTracks().forEach(t=>t.stop());return;}
        s.track=captured;
        for(const t of captured.getTracks()){
          t.onended=()=>stop('麦克风已关闭',s);t.onmute=()=>stop('麦克风不可用，已停止收音',s);
        }
        if(!captured.getTracks().length||captured.getTracks().some(t=>t.readyState!=='live')){stop('麦克风已关闭',s);return;}
      }
      s.ctx=new AudioContext({sampleRate:16000});await s.ctx.resume();if(!valid(s))return;
      // Finish local capture setup before asking the server to spend a connection.
      if(!mock){await s.ctx.audioWorklet.addModule('/mic-worklet.js');if(!valid(s))return;}
      if(s.ctx.state!=='running')throw Error('音频设备未就绪');
      s.ctx.onstatechange=()=>{if(current===s&&s.ctx.state!=='running')stop('音频设备已暂停，语音已停止',s);};
      used=true;await readStream(s);if(!valid(s))return;
      if(s.ctx.state!=='running'||(!mock&&s.track.getTracks().some(t=>t.readyState!=='live'))){stop('音频设备未就绪，语音未启动',s);return;}
      s.active=true;s.startSent=true;await api('start',{fixture:mock},s.abort.signal,s.generation);if(!valid(s))return;
      if(!mock){
        s.node=new AudioWorkletNode(s.ctx,'partition-capture');s.source=s.ctx.createMediaStreamSource(s.track);
        const silent=s.ctx.createGain();silent.gain.value=0;s.node.connect(silent).connect(s.ctx.destination);
        s.node.port.onmessage=e=>{
          const m=e.data;if(!valid(s)||!s.active)return;
          if(m.type==='start'){const playing=s.audioNodes.length>0;s.speaking=true;s.epoch++;clearAudio(s);state('你在说…');send(s,{type:'start',playing});}
          else if(m.type==='end'){s.speaking=false;send(s,{type:'end'});state('正在等待搭档回应…');awaitReply(s);}
          else if(m.type==='audio'){const bytes=new Uint8Array(m.buffer);let str='';for(const b of bytes)str+=String.fromCharCode(b);send(s,{type:'audio',data:btoa(str)});}
        };
      }
      el('live-stop').textContent='结束语音';el('live-interrupt').disabled=false;
      el('live-details').open=false; // the terms were on screen when the player pressed start; make room for the game
      s.heartbeat=setInterval(()=>send(s,{type:'heartbeat'}),2000);
      // The server ends the session at its cap in any case; this only says so in the page's own words.
      if(caps.seconds)s.timer=setTimeout(()=>stop(`本段语音已到 ${duration(caps.seconds)} 上限，机关进度已保留，不会自动重连。`,s),caps.seconds*1000);
      state(mock?'离线 fixture · 无麦克风、无模型':'正在连接搭档，请稍候');
      if(!mock)listenWhenReady(s);
    }catch(e){
      if(current===s){
        const reason=e.message==='Live unavailable, already used, or missing stream'?(Number.isInteger(generation)?'接收连接已断开，可点击「在本局继续语音」':'本段语音已结束，原房间仍可操作机关'):reasonText(e.message);
        stop(e.name==='NotAllowedError'?'没有麦克风权限 · 可以继续文字和按钮操作':'语音未启动：'+reason,s);
      }
    }
  }
  el('live-continue').onclick=()=>begin(false,true);
  el('live-start').onclick=()=>begin(false);el('live-stop').onclick=()=>stop();
  el('live-interrupt').onclick=()=>{const s=current;if(!s?.active||!valid(s))return;clearAudio(s);s.epoch++;send(s,{type:'text',text:'先等等，暂停自主动作，等我明确说继续。'});state('已打断 · 已发送等待请求');};
  syncStatus(view.liveSync);
  api('status').then(s=>{
    // A late initial availability check must not overwrite a pending/closed run.
    if(touched)return;
    generation=s.generation;
    showCaps(s);
    syncStatus(s.sync);
    if(s.sync?.phase==='closed'){showNewRoom();state(roomStartMessage('closed'));}
    el('live-budget').textContent=`剩余 ${s.remaining} 次连接 · 可能实际计费`;
    if(!s.runtimeReady){el('live-continue').disabled=true;el('live-start').disabled=true;state(reasonText(s.runtimeCode));}
    else if(s.remaining===0){el('live-continue').disabled=true;el('live-start').disabled=true;state(reasonText('live_authorization_exhausted'));}
    else if(s.projectVerified===false){el('live-continue').disabled=true;el('live-start').disabled=true;state(reasonText('live_project_unverified'));}
    else if(!roomStartMessage(syncSnapshot?.phase))el('live-start').disabled=false;
    if(s.fixture){fixtureButton=document.createElement('button');fixtureButton.textContent='离线 mock（无麦克风）';fixtureButton.id='live-fixture';fixtureButton.onclick=()=>begin(true);panel.append(fixtureButton);}
  }).catch(()=>{if(!touched)state('语音状态不可用');});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)pauseForTab();
    else if(leftTab&&!current)state(tabMessage());
  });
  window.addEventListener('pagehide',()=>stop('页面已关闭'));
  return {stop,update(){if(getView().paused)stop('游戏暂停 · 已关闭麦克风');else if(getView().complete)gameWon();if(!touched)syncStatus(getView().liveSync);}};
}
