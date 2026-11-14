export function setupLive({room,key,getView}){
  const panel=document.querySelector('#live-panel');if(!panel)return {stop(){},update(){}};
  const view=getView(),other=view.role==='west'?'east':'west';if(view.controllers[other]!=='live')return {stop(){},update(){}};
  panel.innerHTML='<h2>与 Gemini Live 对话</h2><p class="small">麦克风音频发往 Google；最多60秒／30秒发言／20秒回复，不自动重连。共同动作仍需按钮确认。</p><p id="live-state" role="status" aria-live="polite">麦克风关 · 尚未连接</p><p id="live-budget" class="small"></p><div class="actions"><button id="live-start" class="primary">开始语音</button><button id="live-stop" disabled>结束语音</button><button id="live-interrupt" disabled>打断 / 先等等</button></div><p id="live-you"></p><p id="live-partner"></p><p id="live-result" class="small"></p>';
  const el=id=>document.getElementById(id);let current=null,used=false,touched=false,fixtureButton;
  const state=t=>el('live-state').textContent=t;
  const reasonText=code=>code?.startsWith('live_dependency_')?'本地语音依赖缺失，请运行 uv sync --frozen 后重启服务':code==='live_runtime_check_failed'?'本地语音环境检查失败，请检查 Python 安装':code==='live_authorization_exhausted'?'本轮连接额度已用完，未发起模型连接':code;
  async function api(suffix,data,signal){
    const r=await fetch(`/api/rooms/${room}/live-${suffix}`,{method:data?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal});
    const d=await r.json();if(!r.ok)throw Error(d.error||'连接失败');return d;
  }
  function clearAudio(s){for(const n of s.audioNodes){try{n.stop();}catch{}}s.audioNodes=[];s.schedule=s.ctx?.currentTime||0;}
  function stop(reason='麦克风关 · 语音已结束',s=current){
    if(!s||current!==s)return;
    // Invalidate first. Pending permission, fetch, module and playback callbacks
    // belong to this attempt, never a later attempt or the visible stopped UI.
    current=null;s.cancelled=true;s.active=false;
    clearInterval(s.heartbeat);clearTimeout(s.timer);
    s.track?.getTracks().forEach(t=>t.stop());s.node?.disconnect();s.source?.disconnect();clearAudio(s);
    if(s.startSent)api('input',{type:'stop'}).catch(()=>{});
    s.abort.abort();s.reader?.cancel().catch(()=>{});s.ctx?.close().catch(()=>{});
    el('live-stop').disabled=true;el('live-stop').textContent='结束语音';el('live-interrupt').disabled=true;
    el('live-start').disabled=used;if(fixtureButton)fixtureButton.disabled=used;
    state(reason);
  }
  function valid(s){
    if(current!==s||s.cancelled)return false;
    if(document.hidden||getView().paused){stop(document.hidden?'已暂停收音 · 页面在后台':'游戏暂停 · 已关闭麦克风',s);return false;}
    return true;
  }
  function send(s,b){
    if(!valid(s)||!s.active)return Promise.resolve();
    if(++s.queued>30){stop('网络积压，语音已停止',s);return Promise.resolve();}
    s.upload=s.upload.then(()=>valid(s)&&s.active?api('input',b,s.abort.signal):undefined)
      .catch(()=>{if(valid(s))stop('连接中断，未自动重连',s);}).finally(()=>s.queued--);
    return s.upload;
  }
  function playback(s,m){
    if(!valid(s)||!s.active||s.speaking||s.ctx?.state!=='running'||m.epoch<s.epoch)return;
    const bytes=Uint8Array.from(atob(m.data),c=>c.charCodeAt(0)),v=new DataView(bytes.buffer);
    if(s.schedule-s.ctx.currentTime>3){stop('播放积压，语音已停止',s);return;}
    const buffer=s.ctx.createBuffer(1,bytes.length/2,24000),values=buffer.getChannelData(0);for(let i=0;i<values.length;i++)values[i]=v.getInt16(i*2,true)/32768;
    const n=s.ctx.createBufferSource();n.buffer=buffer;n.connect(s.ctx.destination);s.audioNodes.push(n);
    n.onended=()=>{
      s.audioNodes=s.audioNodes.filter(x=>x!==n);
      if(valid(s)&&s.active&&!s.audioNodes.length)state(s.fixture?'离线 fixture · 没有麦克风或模型':s.listening?'在听 · 麦克风已开启':'已连接 · 正在启动收音');
    };
    s.schedule=Math.max(s.ctx.currentTime+.02,s.schedule);n.start(s.schedule);s.schedule+=buffer.duration;
    state(s.fixture?'离线 fixture 提示音 · 非模型':'搭档在说 · 可以直接开口打断');
  }
  function onEvent(s,m){
    if(!valid(s))return;
    if(m.type==='ready'){s.connected=true;state(s.fixture?'离线 fixture 已连接 · 无真实模型':s.listening?'在听 · Gemini Live 已连接':'已连接 · 正在启动收音');}
    if(m.type==='interrupted'){s.epoch=Math.max(s.epoch,m.epoch||0);clearAudio(s);}
    if(m.type==='audio')playback(s,m);
    if(m.type==='transcript'){
      const target=el(m.speaker==='you'?'live-you':'live-partner');
      if(target.dataset.turn!==String(m.epoch)){target.textContent=m.speaker==='you'?'我听到：':'搭档：';target.dataset.turn=String(m.epoch);}
      target.textContent=(target.textContent+m.text).slice(-1500);
    }
    if(m.type==='tool'){const r=m.receipt;el('live-result').textContent=r?`${r.command} · ${r.outcome} · 房间事件 ${r.roomEventIds.map(x=>'#'+x).join('、')||'无新增'}（以机关回执为准）`:'工具未发出或被 harness 中止';}
    if(m.type==='usage')el('live-budget').textContent=`保守费用估算 $${m.estimatedUsd.toFixed(6)}，非账单；credits未核验`;
    if(m.type==='closed')stop('语音已停止：'+reasonText(m.reason)+'；未自动重连，可继续用按钮玩',s);
  }
  async function readStream(s){
    const r=await fetch(`/api/rooms/${room}/live-stream`,{headers:{Authorization:`Bearer ${key}`},signal:s.abort.signal});
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
  async function begin(mock=false){
    if(current||used||document.hidden||getView().paused)return;
    const s={fixture:mock,cancelled:false,active:false,listening:false,connected:false,startSent:false,
      abort:new AbortController(),audioNodes:[],schedule:0,upload:Promise.resolve(),queued:0,epoch:0,speaking:false};
    current=s;touched=true;el('live-start').disabled=true;if(fixtureButton)fixtureButton.disabled=true;
    el('live-stop').disabled=false;el('live-stop').textContent='取消启动';
    state(mock?'正在连接离线 fixture…':'正在检查本地语音环境与额度');
    try{
      if(!mock){
        const status=await api('status',undefined,s.abort.signal);if(!valid(s))return;
        if(!status.runtimeReady)throw Error(status.runtimeCode);if(status.remaining===0)throw Error('live_authorization_exhausted');
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
      s.active=true;s.startSent=true;await api('start',{fixture:mock},s.abort.signal);if(!valid(s))return;
      if(!mock){
        s.node=new AudioWorkletNode(s.ctx,'partition-capture');s.source=s.ctx.createMediaStreamSource(s.track);
        const silent=s.ctx.createGain();silent.gain.value=0;s.source.connect(s.node);s.node.connect(silent).connect(s.ctx.destination);
        s.node.port.onmessage=e=>{
          const m=e.data;if(!valid(s)||!s.active)return;
          if(m.type==='start'){s.speaking=true;s.epoch++;clearAudio(s);state('你在说…');send(s,{type:'start'});}
          else if(m.type==='end'){s.speaking=false;send(s,{type:'end'});state('正在等待搭档回应…');}
          else if(m.type==='audio'){const bytes=new Uint8Array(m.buffer);let str='';for(const b of bytes)str+=String.fromCharCode(b);send(s,{type:'audio',data:btoa(str)});}
        };s.listening=true;
      }
      el('live-stop').textContent='结束语音';el('live-interrupt').disabled=false;
      s.heartbeat=setInterval(()=>send(s,{type:'heartbeat'}),2000);s.timer=setTimeout(()=>stop('本次60秒已结束，未自动续跑',s),60000);
      state(mock?'离线 fixture · 无麦克风、无模型':s.connected?'在听 · Gemini Live 已连接':'麦克风已开启 · 正在连接模型');
    }catch(e){
      if(current===s)stop(e.name==='NotAllowedError'?'没有麦克风权限 · 可以继续文字和按钮操作':'语音未启动：'+reasonText(e.message),s);
    }
  }
  el('live-start').onclick=()=>begin(false);el('live-stop').onclick=()=>stop();
  el('live-interrupt').onclick=()=>{const s=current;if(!s?.active||!valid(s))return;clearAudio(s);s.epoch++;send(s,{type:'text',text:'先等等，暂停自主动作，等我明确说继续。'});state('已打断 · 已发送等待请求');};
  api('status').then(s=>{
    // A late initial availability check must not overwrite a pending/closed run.
    if(touched)return;
    el('live-budget').textContent=`剩余${s.remaining}次连接；总预留上限$${s.totalUsd.toFixed(2)}；可能实际计费`;
    if(!s.runtimeReady){el('live-start').disabled=true;state(reasonText(s.runtimeCode));}
    else if(s.remaining===0){el('live-start').disabled=true;state('本轮连接额度已用完，未发起模型连接');}
    if(s.fixture){fixtureButton=document.createElement('button');fixtureButton.textContent='离线 mock（无麦克风）';fixtureButton.id='live-fixture';fixtureButton.onclick=()=>begin(true);panel.append(fixtureButton);}
  }).catch(()=>{if(!touched)state('语音状态不可用');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('已暂停收音 · 页面在后台');});
  window.addEventListener('pagehide',()=>stop('页面已关闭'));
  return {stop,update(){if(getView().paused)stop('游戏暂停 · 已关闭麦克风');}};
}
