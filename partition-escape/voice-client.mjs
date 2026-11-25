// All credentialed provider access stays on the server; this module sends event IDs only.
export function setupTts({room,key,getView}){
  const panel=document.querySelector('#tts-panel');
  panel.innerHTML='<div class="small">ElevenLabs 朗读 · TTS，不识别语音</div><p id="tts-status" class="small" role="status">正在读取语音状态…</p><button id="tts-read" disabled>朗读搭档最新公开消息</button> <button id="tts-stop" disabled>停止播放</button> <button id="tts-disable" disabled>停用 ElevenLabs</button>';
  const read=panel.querySelector('#tts-read'),stop=panel.querySelector('#tts-stop'),disable=panel.querySelector('#tts-disable'),status=panel.querySelector('#tts-status');
  let state,audio,blobUrl,request,busy=false,generation=0;
  const headers={Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  const event=()=>getView()?.events.filter(e=>e.seat!==getView().role&&e.source==='script'&&['message','clue'].includes(e.type)).at(-1);
  function update(){read.disabled=busy||!state?.enabled||!event()||getView()?.paused;disable.disabled=!state?.enabled;}
  async function refresh(){
    try{const r=await fetch(`/api/rooms/${room}/voice-status`,{headers});if(!r.ok)throw Error();state=await r.json();
      const u=state.used,l=state.limits;
      status.textContent=state.mode==='off'?'ElevenLabs 未启用：额度待确认，真实请求 0。可用上方本机朗读（如有）。':`${state.mode==='mock'?'离线 mock 提示音，非 ElevenLabs 人声，真实请求 0':'ElevenLabs · 仅朗读已分享消息'}。${state.reason||''} 请求 ${u.requests}/${l.requests} · 字符 ${u.characters}/${l.characters} · ${state.mode==='mock'?'模拟计数':'预留费用'} $${(u.microUsd/1e6).toFixed(4)}/$${(l.microUsd/1e6).toFixed(2)} · 每条 ≤${l.perRequest} 字。`;
    }catch{state=null;status.textContent='语音不可用，文字游戏可继续。';}update();
  }
  function stopPlayback(){generation++;request?.abort();request=null;audio?.pause();audio=null;if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl=null;stop.disabled=true;busy=false;update();}
  read.onclick=async()=>{
    const e=event();if(!e||read.disabled)return;stopPlayback();const current=generation;busy=true;update();stop.disabled=false;
    request=new AbortController();status.textContent=`正在生成公开消息 #${e.id} 的朗读；不会自动连续请求。`;
    try{
      const r=await fetch(`/api/rooms/${room}/voice`,{method:'POST',headers,body:JSON.stringify({eventId:e.id}),signal:request.signal});
      if(!r.ok){const d=await r.json();throw Error(d.error);}
      const blob=await r.blob();if(current!==generation)return;
      blobUrl=URL.createObjectURL(blob);audio=new Audio(blobUrl);audio.onended=stopPlayback;
      globalThis.speechSynthesis?.cancel();await audio.play();await refresh();
    }catch(e){if(current===generation){status.textContent=e.name==='AbortError'?'已停止播放。':'朗读未完成（不自动重试）：'+e.message;stop.disabled=true;}}
    finally{if(current===generation){busy=false;request=null;update();}}
  };
  stop.onclick=stopPlayback;
  disable.onclick=async()=>{stopPlayback();await fetch(`/api/rooms/${room}/voice-disable`,{method:'POST',headers,body:'{}'});await refresh();};
  window.addEventListener('pagehide',stopPlayback);refresh();
  return {update:()=>{if(getView()?.paused&&(audio||request))stopPlayback();update();},stop:stopPlayback};
}
