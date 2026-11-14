async (page) => {
  const errors=[],external=[];page.on('pageerror',e=>errors.push(e.name));
  await page.context().route('**/*',route=>{
    const url=route.request().url();
    if(url==='http://127.0.0.1:4331/favicon.ico')return route.fulfill({status:204,body:''});
    if(url.startsWith('http://127.0.0.1:4331/'))return route.continue();
    external.push(url.split('?')[0]);return route.abort();
  });
  const results=[];
  for(const width of [1440,390])for(const scenario of ['delivery','pause-before-flush','speech-before-flush','stop-before-flush']){
    await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:4331/'+scenario+'.html');
    const state=await page.evaluate(()=>({text:document.body.innerText,statuses:[...document.querySelectorAll('li')].map(x=>x.textContent.split(' · ')[0]),overflow:document.documentElement.scrollWidth>innerWidth}));
    if(!state.text.includes('离线 fixture · 非真实模型')||!state.text.includes('turn_complete=false')||!state.text.includes('不证明模型已理解')||state.overflow)throw Error('Trace label/layout mismatch');
    if((scenario==='delivery')!==state.statuses.includes('fixture_sent'))throw Error('Delivery status mismatch');
    for(const word of ['PRIVATE_SENTINEL','holdingBrake','keyHere','fanSpinning','不能分别供电','GEMINI_API_KEY'])if(state.text.includes(word))throw Error('Private content leak');
    if(scenario==='delivery'){
      if(!state.text.includes('#3')||!state.text.includes('#4')||!state.text.includes('#7'))throw Error('Missing event links');
      await page.screenshot({path:'output/playwright/live-updates/trace-'+width+'.png',fullPage:true});
    }
    results.push({scenario,width,fixture:true,overflow:state.overflow,passed:true});
  }
  if(errors.length||external.length)throw Error('Browser errors or external request');
  return {realModelRequests:0,microphoneRequested:false,errors,external,results};
}
