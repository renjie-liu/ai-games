async (page) => {
// Run with playwright-cli run-code against the loopback-only fixture server.
const results=[],pageErrors=[],external=[];
page.on('pageerror',e=>pageErrors.push(e.name));
page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4319/')&&!r.url().startsWith('data:'))external.push(new URL(r.url()).origin);});
for(const width of [1440,390]){
 await page.setViewportSize({width,height:900});
 for(const scenario of ['background','cancel','eof','suspended']){
  const mode=['background','cancel'].includes(scenario)?'permission':scenario;
  await page.goto('http://127.0.0.1:4319/verification/live-start/fixture.html?case='+mode);
  await page.getByRole('button',{name:scenario==='eof'?'离线 mock（无麦克风）':'开始语音',exact:true}).click();
  if(mode==='permission'){
   await page.waitForFunction(()=>window.fixture.stats.captureRequests===1);
   await page.getByRole('button',{name:scenario==='background'?'模拟后台':'取消启动',exact:true}).click();
   await page.getByRole('button',{name:'模拟授权返回',exact:true}).click();
   await page.waitForFunction(()=>window.fixture.stats.trackStops===1);
  }else if(mode==='eof'){
   await page.waitForFunction(()=>window.fixture.stats.startPosts===1);
   await page.getByRole('button',{name:'模拟下行结束',exact:true}).click();
   await page.waitForFunction(()=>document.getElementById('live-state').textContent==='语音连接已结束');
   await page.getByRole('button',{name:'释放响应',exact:true}).click();
  }else{
   await page.waitForFunction(()=>window.fixture.contexts.length===1&&window.fixture.contexts[0].state==='running');
   await page.getByRole('button',{name:'模拟音频挂起',exact:true}).click();
   await page.getByRole('button',{name:'释放响应',exact:true}).click();
  }
  await page.getByRole('button',{name:'显示检查结果',exact:true}).click();
  const r=await page.evaluate(()=>window.fixture.result());
  if(r.startPosts!==(mode==='eof'?1:0)||!r.stopDisabled||!r.interruptDisabled||r.contextStates.some(x=>x!=='closed')||r.overflow)throw Error('Lifecycle browser failure: '+scenario);
  results.push({scenario,width,...r});
  await page.screenshot({path:'output/playwright/live-start-'+scenario+'-'+width+'.png',fullPage:true});
 }
}
if(pageErrors.length||external.length)throw Error('Unexpected browser errors or external traffic');
return {fixture:true,actualMicrophoneRequests:0,actualModelRequests:0,pageErrors,external,results};

}
