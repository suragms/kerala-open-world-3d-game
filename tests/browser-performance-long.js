async (page) => {
  const samples=[];
  const scene=async(name)=>{
    await page.getByRole('button',{name:'Open world map',exact:true}).first().click();
    await page.getByRole('button',{name:`Select ${name}`,exact:true}).click();await page.getByRole('button',{name:'Explore this location',exact:true}).click();
    await page.waitForFunction(()=>!!window.__KOW__?.snapshot());await page.waitForTimeout(3000);
  };
  const measure=async(name,seconds)=>{
    const before=await page.evaluate(()=>window.__KOW__.perf());
    const timing=await page.evaluate(seconds=>new Promise(resolve=>{
      const samples=[],longTasks=[],began=performance.now();let previous=began;
      const observer=typeof PerformanceObserver==='function'?new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration))):null;
      try{observer?.observe({type:'longtask',buffered:false});}catch{}
      const tick=now=>{samples.push(now-previous);previous=now;if(now-began<seconds*1000){requestAnimationFrame(tick);return;}
        observer?.disconnect();const sorted=[...samples].sort((a,b)=>a-b),worst=sorted.slice(-Math.max(1,Math.ceil(sorted.length*.01)));
        const canvas=document.querySelector('.game-canvas canvas'),gl=canvas?.getContext('webgl2'),debug=gl?.getExtension('WEBGL_debug_renderer_info');
        resolve({seconds:(now-began)/1000,frames:samples.length,averageFPS:1000/(samples.reduce((a,b)=>a+b,0)/samples.length),onePercentLowFPS:1000/(worst.reduce((a,b)=>a+b,0)/worst.length),
          p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],framesOver50ms:samples.filter(v=>v>50).length,longTasks,
          renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable',userAgent:navigator.userAgent});
      };requestAnimationFrame(tick);
    }),seconds);
    const after=await page.evaluate(()=>window.__KOW__.perf());await page.screenshot({path:`long-performance-${name}.png`});
    samples.push({name,before,timing,after,snapshot:await page.evaluate(()=>window.__KOW__.snapshot())});
  };
  for(const [district,label]of [['Thiruvananthapuram','dense-urban'],['Kasaragod','rural-coast'],['Idukki','hill-terrain']]){
    await scene(district);await page.getByRole('button',{name:'Arrow keys',exact:true}).click();const canvas=page.locator('.game-canvas canvas');await canvas.focus();
    await page.keyboard.down('Shift');await page.keyboard.down('ArrowRight');await measure(label,30);await page.keyboard.up('ArrowRight');await page.keyboard.up('Shift');
  }
  await scene('Thrissur');await page.getByRole('button',{name:'Open world map',exact:true}).first().click();
  await page.getByRole('textbox',{name:'Search places',exact:true}).fill('Thrissur KSRTC Bus Station');await page.getByRole('button',{name:'Bus stations',exact:true}).click();await page.locator('.search-results .place-result').first().click();await page.getByRole('button',{name:'Explore this location',exact:true}).click();await page.waitForFunction(()=>window.__KOW__?.diagnostics().area==='station-thrissur');
  await page.getByRole('button',{name:'Mouse movement',exact:true}).click();await page.getByRole('button',{name:'Toggle run',exact:true}).click();
  await page.getByRole('button',{name:'Travel by bus, rail or air',exact:true}).click();await page.locator('.bus-service').filter({hasText:'Guruvayur KSRTC'}).getByRole('button',{name:/Walk to departure station/}).click();
  for(let i=0;i<30&&!(await page.evaluate(()=>window.__KOW__.snapshot().nearStation));i++)await page.evaluate(()=>window.__KOW__.advanceJourney(2));
  await page.getByRole('button',{name:'Travel by bus, rail or air',exact:true}).click();await page.locator('.bus-service').filter({hasText:'Guruvayur KSRTC'}).getByRole('button',{name:'Wait for this bus',exact:true}).click();await page.waitForFunction(()=>!!window.__KOW__?.journey());await page.getByRole('button',{name:'Walk to passenger door',exact:true}).click();
  for(let i=0;i<30&&!(await page.evaluate(()=>window.__KOW__.snapshot().bus.canBoard));i++)await page.evaluate(()=>window.__KOW__.advanceJourney(2));
  await page.getByRole('button',{name:'Board bus',exact:true}).click();await page.getByRole('button',{name:'Seat 1 available',exact:true}).click();await page.getByRole('button',{name:'Begin full journey',exact:true}).click();await page.waitForFunction(()=>window.__KOW__.snapshot().bus.phase==='travelling');
  await measure('active-bus',60);
  return {method:'Actual requestAnimationFrame intervals during 30-second moving scenes and a 60-second live bus journey. No deterministic clock used during timed measurement; no hardware performance guarantee.',samples};
}
