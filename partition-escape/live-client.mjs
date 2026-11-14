export function setupLive({room,key,getView}){
  const panel=document.querySelector('#live-panel');if(!panel)return {stop(){},update(){}};
  const view=getView(),other=view.role==='west'?'east':'west';if(view.controllers[other]!=='live')return {stop(){},update(){}};
  panel.innerHTML='<h2>与 Gemini Live 对话</h2><p class="small">麦克风音频发往 Google；最多60秒／30秒发言／20秒回复，不自动重连。共同动作仍需按钮确认。</p><p id="live-state" role="status" aria-live="polite">麦克风关 · 尚未连接</p><p id="live-budget" class="small"></p><div class="actions"><button id="live-start" class="primary">开始语音</button><button id="live-stop" disabled>结束语音</button><button id="live-interrupt" disabled>打断 / 先等等</button></div><p id="live-you"></p><p id="live-partner"></p><p id="live-result" class="small"></p>';
  const el=id=>document.getElementById(id);let ctx,track,source,node,streamAbort,heartbeat,timer,active=false,listening=false,connected=false,fixture=false,used=false;
  let audioNodes=[],schedule=0,upload=Promise.resolve(),queued=0,epoch=0,speaking=false;
  const state=t=>el('live-state').textContent=t;
  const reasonText=code=>code?.startsWith('live_dependency_')?'本地语音依赖缺失，请运行 uv sync --frozen 后重启服务':code==='live_runtime_check_failed'?'本地语音环境检查失败，请检查 Python 安装':code==='live_authorization_exhausted'?'本轮连接额度已用完，未发起模型连接':code;
  async function api(suffix,data){const r=await fetch(`/api/rooms/${room}/live-${suffix}`,{method:data?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'连接失败');return d;}
  function clearAudio(){for(const n of audioNodes){try{n.stop();}catch{}}audioNodes=[];schedule=ctx?.currentTime||0;}
  function send(b){if(!active)return Promise.resolve();if(++queued>30){stop('网络积压，语音已停止');return Promise.resolve();}
    upload=upload.then(()=>active?api('input',b):undefined).catch(()=>stop('连接中断，未自动重连')).finally(()=>queued--);return upload;
  }
  async function stop(reason='麦克风关 · 语音已结束'){
    const wasActive=active;active=false;listening=false;clearInterval(heartbeat);clearTimeout(timer);
    track?.getTracks().forEach(t=>t.stop());track=null;node?.disconnect();source?.disconnect();clearAudio();
    if(wasActive)api('input',{type:'stop'}).catch(()=>{});streamAbort?.abort();ctx?.close().catch(()=>{});
    el('live-stop').disabled=true;el('live-interrupt').disabled=true;el('live-start').disabled=used;state(reason);
  }
  function playback(m){
    if(!active||speaking||!ctx||ctx.state!=='running'||m.epoch<epoch)return;
    const bytes=Uint8Array.from(atob(m.data),c=>c.charCodeAt(0)),v=new DataView(bytes.buffer);
    if(schedule-ctx.currentTime>3){stop('播放积压，语音已停止');return;}
    const buffer=ctx.createBuffer(1,bytes.length/2,24000),values=buffer.getChannelData(0);for(let i=0;i<values.length;i++)values[i]=v.getInt16(i*2,true)/32768;
    const n=ctx.createBufferSource();n.buffer=buffer;n.connect(ctx.destination);audioNodes.push(n);
    n.onended=()=>{audioNodes=audioNodes.filter(x=>x!==n);if(active&&!audioNodes.length)state(fixture?'离线 fixture · 没有麦克风或模型':'在听 · 麦克风已开启');};
    schedule=Math.max(ctx.currentTime+.02,schedule);n.start(schedule);schedule+=buffer.duration;state(fixture?'离线 fixture 提示音 · 非模型':'搭档在说 · 可以直接开口打断');
  }
  function onEvent(m){
    if(m.type==='ready'){connected=true;state(fixture?'离线 fixture 已连接 · 无真实模型':listening?'在听 · Gemini Live 已连接':'已连接 · 麦克风未开启');}
    if(m.type==='interrupted'){epoch=Math.max(epoch,m.epoch||0);clearAudio();}
    if(m.type==='audio')playback(m);
    if(m.type==='transcript'){
      const target=el(m.speaker==='you'?'live-you':'live-partner');
      if(target.dataset.turn!==String(m.epoch)){target.textContent=m.speaker==='you'?'我听到：':'搭档：';target.dataset.turn=String(m.epoch);}
      target.textContent=(target.textContent+m.text).slice(-1500);
    }
    if(m.type==='tool'){const r=m.receipt;el('live-result').textContent=r?`${r.command} · ${r.outcome} · 房间事件 ${r.roomEventIds.map(x=>'#'+x).join('、')||'无新增'}（以机关回执为准）`:'工具未发出或被 harness 中止';}
    if(m.type==='usage')el('live-budget').textContent=`保守费用估算 $${m.estimatedUsd.toFixed(6)}，非账单；credits未核验`;
    if(m.type==='closed')stop('语音已停止：'+reasonText(m.reason)+'；未自动重连，可继续用按钮玩');
  }
  async function readStream(){
    streamAbort=new AbortController();const r=await fetch(`/api/rooms/${room}/live-stream`,{headers:{Authorization:`Bearer ${key}`},signal:streamAbort.signal});
    if(!r.ok)throw Error('语音下行连接失败');const reader=r.body.getReader(),decode=new TextDecoder();
    (async()=>{let pending='';try{for(;;){const {value,done}=await reader.read();if(done)break;pending+=decode.decode(value,{stream:true});let i;while((i=pending.indexOf('\n'))>=0){const row=pending.slice(0,i);pending=pending.slice(i+1);if(row)onEvent(JSON.parse(row));}}if(active)stop('语音连接已结束');}catch(e){if(e.name!=='AbortError'&&active)stop('语音连接中断');}})();
  }
  async function begin(mock=false){
    fixture=mock;el('live-start').disabled=true;state(mock?'正在连接离线 fixture…':'正在检查本地语音环境与额度');
    try{
      if(!mock){const s=await api('status');if(!s.runtimeReady)throw Error(s.runtimeCode);if(s.remaining===0)throw Error('live_authorization_exhausted');state('请在浏览器中允许麦克风');}
      // User gesture only. Automated fixture bypasses capture entirely, never grants permission.
      if(!mock){track=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});}
      ctx=new AudioContext({sampleRate:16000});await ctx.resume();active=true;await readStream();
      await api('start',{fixture:mock});used=true;
      if(!mock){await ctx.audioWorklet.addModule('/mic-worklet.js');node=new AudioWorkletNode(ctx,'partition-capture');source=ctx.createMediaStreamSource(track);const silent=ctx.createGain();silent.gain.value=0;source.connect(node);node.connect(silent).connect(ctx.destination);
        for(const t of track.getTracks()){t.onended=()=>{if(active)stop('麦克风已关闭');};t.onmute=()=>stop('麦克风不可用，已停止收音');}
        node.port.onmessage=e=>{const m=e.data;if(!active)return;
          if(m.type==='start'){speaking=true;epoch++;clearAudio();state('你在说…');send({type:'start'});}
          else if(m.type==='end'){speaking=false;send({type:'end'});state('正在等待搭档回应…');}
          else if(m.type==='audio'){const bytes=new Uint8Array(m.buffer);let str='';for(const b of bytes)str+=String.fromCharCode(b);send({type:'audio',data:btoa(str)});}
        };listening=true;
      }
      el('live-stop').disabled=false;el('live-interrupt').disabled=false;
      heartbeat=setInterval(()=>send({type:'heartbeat'}),2000);timer=setTimeout(()=>stop('本次60秒已结束，未自动续跑'),60000);
      state(mock?'离线 fixture · 无麦克风、无模型':connected?'在听 · Gemini Live 已连接':'麦克风已开启 · 正在连接模型');
    }catch(e){await stop(e.name==='NotAllowedError'?'没有麦克风权限 · 可以继续文字和按钮操作':'语音未启动：'+reasonText(e.message));}
  }
  el('live-start').onclick=()=>begin(false);el('live-stop').onclick=()=>stop();
  el('live-interrupt').onclick=()=>{clearAudio();epoch++;send({type:'text',text:'先等等，暂停自主动作，等我明确说继续。'});state('已打断 · 已发送等待请求');};
  api('status').then(s=>{el('live-budget').textContent=`剩余${s.remaining}次连接；总预留上限$${s.totalUsd.toFixed(2)}；可能实际计费`;
    if(!s.runtimeReady){el('live-start').disabled=true;state(reasonText(s.runtimeCode));}
    else if(s.remaining===0){el('live-start').disabled=true;state('本轮连接额度已用完，未发起模型连接');}
    if(s.fixture){const b=document.createElement('button');b.textContent='离线 mock（无麦克风）';b.id='live-fixture';b.onclick=()=>begin(true);panel.append(b);}
  }).catch(()=>state('语音状态不可用'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)stop('已暂停收音 · 页面在后台');});
  window.addEventListener('pagehide',()=>stop('页面已关闭'));
  return {stop,update(){if(active&&getView().paused)stop('游戏暂停 · 已关闭麦克风');}};
}
