async (page) => {
 const errors=[];page.on('pageerror',e=>errors.push(e.name));
 await page.evaluate(()=>{
  window.liveTest={microphoneRequests:0,contexts:[]};
  Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{window.liveTest.microphoneRequests++;throw Error('No microphone allowed in fixture');}}});
  const Audio=window.AudioContext;
  window.AudioContext=class extends Audio{constructor(options){super(options);window.liveTest.contexts.push(this);}};
 });
 await page.getByRole('button',{name:'离线 mock（无麦克风）',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('live-result').textContent.includes('房间事件'),{timeout:15000});
 const running=await page.evaluate(()=>({state:document.getElementById('live-state').textContent,receipt:document.getElementById('live-result').textContent,contexts:window.liveTest.contexts.map(c=>c.state),microphoneRequests:window.liveTest.microphoneRequests}));
 await page.getByRole('button',{name:'结束语音',exact:true}).click();
 await page.waitForFunction(()=>window.liveTest.contexts.every(c=>c.state==='closed'));
 const stopped=await page.evaluate(()=>({state:document.getElementById('live-state').textContent,contexts:window.liveTest.contexts.map(c=>c.state),stopDisabled:document.getElementById('live-stop').disabled,interruptDisabled:document.getElementById('live-interrupt').disabled}));
 if(running.microphoneRequests!==0||!running.receipt.includes('recorded')||!stopped.stopDisabled||!stopped.interruptDisabled||errors.length)throw Error('Actual game fixture regression');
 await page.locator('#live-panel').screenshot({path:'output/playwright/live-start-game-stopped.png'});
 return {source:'real-local-game-with-offline-worker',realModelRequests:0,errors,running,stopped};
}
