async(page)=>{
  const errors=[],samples=[],state=()=>page.evaluate(()=>window.__KOW__.snapshot());page.on('pageerror',e=>errors.push(e.message));
  const advance=async(seconds=30)=>{
    const step=await page.evaluate(seconds=>window.__KOW__.advanceJourney(seconds),seconds);
    if(step.maxStep>1.2||step.perf.chunks>34)throw new Error('Discontinuous journey or unbounded world streaming');return step;
  };
  await page.getByRole('button',{name:'Open world map',exact:true}).first().click();
  await page.getByRole('textbox',{name:'Search places',exact:true}).fill('Thrissur KSRTC Bus Station');
  await page.getByRole('button',{name:'Bus stations',exact:true}).click();await page.locator('.search-results .place-result').first().click();await page.getByRole('button',{name:'Explore this location',exact:true}).click();
  await page.waitForFunction(()=>window.__KOW__?.diagnostics().area==='station-thrissur');
  await page.getByRole('button',{name:'Travel by bus, rail or air',exact:true}).click();
  await page.getByRole('combobox',{name:'Bus type',exact:true}).selectOption('coach');
  await page.locator('.bus-service').filter({hasText:'KSRTC Bus Station Ernakulam'}).getByRole('button',{name:/Walk to departure station/}).click();
  for(let i=0;i<30&&!(await state()).nearStation;i++)await advance();
  await page.getByRole('button',{name:'Travel by bus, rail or air',exact:true}).click();await page.getByRole('combobox',{name:'Bus type',exact:true}).selectOption('coach');
  await page.locator('.bus-service').filter({hasText:'KSRTC Bus Station Ernakulam'}).getByRole('button',{name:'Wait for this bus',exact:true}).click();
  await page.waitForFunction(()=>!!window.__KOW__?.journey());await page.getByRole('button',{name:'Walk to passenger door',exact:true}).click();
  for(let i=0;i<30&&!(await state()).bus.canBoard;i++)await advance(2);
  await page.getByRole('button',{name:'Board bus',exact:true}).click();await page.getByRole('button',{name:'Seat 1 available',exact:true}).click();await page.getByRole('button',{name:'Begin full journey',exact:true}).click();
  const before=await page.evaluate(()=>window.__KOW__.perf()),districts=new Set(),phases=new Set();let last=0,stationary=0;
  for(let i=0;i<400;i++){
    const step=await advance(),bus=step.snapshot.bus;districts.add(step.snapshot.district);step.phases.forEach(p=>phases.add(p));
    if(bus.mode!=='full')throw new Error('Inter-district Full Journey changed mode');
    if(i%60===0){samples.push({iteration:i,position:step.snapshot.position,district:step.snapshot.district,bus,perf:step.perf});await page.screenshot({path:`output/playwright/phase8-suite/phase8-interdistrict-${i}.png`});}
    if(bus.phase==='arrived')break;
    stationary=Math.abs(bus.progress-last)<.00001?stationary+1:0;last=bus.progress;
    if(stationary>8)throw new Error(`Coach stopped making progress at ${JSON.stringify(step.snapshot.position)}`);
  }
  const arrived=await state();if(arrived.bus.phase!=='arrived'||arrived.district!=='ernakulam'||!districts.has('thrissur'))throw new Error('Wrong inter-district arrival');
  await page.getByRole('button',{name:'Exit at stop',exact:true}).click();await page.waitForFunction(()=>window.__KOW__.snapshot().bus.phase==='exited');
  const blocked=await page.evaluate(()=>window.__KOW__.diagnostics().blocked);if(blocked||errors.length)throw new Error('Invalid inter-district exit or browser error');
  await page.screenshot({path:'output/playwright/phase8-suite/phase8-interdistrict-arrival.png'});
  return {clock:'Accelerated normal simulation, Full Journey throughout',route:'thrissur-ernakulam',districts:[...districts],phases:[...phases],before,samples,arrived,after:await state(),blocked,errors};
}
