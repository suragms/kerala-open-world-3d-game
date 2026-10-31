async (page) => {
  const errors=[],samples=[],phases=new Set(),state=()=>page.evaluate(()=>window.__KOW__.snapshot());
  page.on('pageerror',e=>errors.push(e.message));
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const advance=async seconds=>{
    const step=await page.evaluate(seconds=>window.__KOW__.advanceJourney(seconds),seconds);
    check(step.maxStep<1.2,`Discontinuous physical simulation step: ${step.maxStep} metres`);
    step.phases.forEach(p=>phases.add(p)); return step;
  };
  await page.getByRole('button',{name:'Mouse movement',exact:true}).click();
  await page.getByRole('button',{name:'Toggle run',exact:true}).click();
  const walkingStart=await state();
  await page.getByRole('button',{name:'Travel by bus, rail or air',exact:true}).click();
  await page.locator('.bus-service').filter({hasText:'Guruvayur KSRTC'}).getByRole('button',{name:/Walk to departure station/}).click();
  for(let i=0;i<40;i++){
    const terminals=await page.evaluate(()=>window.__KOW__.controls().terminals);
    if(terminals.find(t=>t.id==='way-241740100')?.distance<20)break;
    const step=await advance(20);
    check(step.snapshot.destination || step.snapshot.near.includes('Bus station'),`Walking route stopped before the terminal: ${JSON.stringify(step.snapshot.position)}`);
    if(i===5)await page.screenshot({path:'output/playwright/phase8-suite/phase8-full-walk-to-station.png'});
  }
  const atStation=await state();
  check(atStation.nearStation?.id==='way-241740100','Did not reach Thrissur bus station on foot');
  check(await page.evaluate(()=>window.__KOW__.diagnostics().area)==='thrissur','The walk unexpectedly changed scenes');
  await page.getByRole('button',{name:'Travel by bus, rail or air',exact:true}).click();
  await page.locator('.bus-service').filter({hasText:'Guruvayur KSRTC'}).getByRole('button',{name:'Wait for this bus',exact:true}).click();
  await page.waitForFunction(()=>!!window.__KOW__?.journey());
  await page.getByRole('button',{name:'Walk to passenger door',exact:true}).click();
  for(let i=0;i<20&&!(await state()).bus.canBoard;i++)await advance(2);
  check((await state()).bus.canBoard,'Bus did not arrive or player could not approach the door');
  await page.getByRole('button',{name:'Board bus',exact:true}).click();
  await page.getByRole('dialog',{name:'Choose a passenger seat',exact:true}).waitFor();
  await page.getByRole('button',{name:'Seat 1 available',exact:true}).click();
  await page.getByRole('button',{name:'Begin full journey',exact:true}).click();
  await page.waitForFunction(()=>window.__KOW__.snapshot().bus?.phase==='travelling');
  await page.getByRole('button',{name:'Get off at next stop',exact:true}).click();
  for(let i=0;i<2000 && !(await state()).bus.canExit;i++)await advance(2);
  const requestedStop=await state();
  check(requestedStop.bus.phase==='dwelling' && requestedStop.bus.acknowledgedStop && !requestedStop.bus.requestStop,'Requested stop was not acknowledged');
  await advance(15);
  const resumed=await state();
  check(resumed.bus.phase==='travelling' && resumed.bus.door===0 && resumed.bus.speed>0,'Bus did not resume after the passenger stayed aboard');
  const before=await page.evaluate(()=>window.__KOW__.perf());
  let lastProgress=0,stationary=0;
  for(let i=0;i<240;i++){
    const step=await advance(30),bus=step.snapshot.bus;
    check(bus.mode==='full','Full journey changed to Fast Journey');
    check(step.perf.chunks<=34,`Unbounded loaded chunks: ${step.perf.chunks}`);
    if(i%12===0){samples.push({iteration:i,progress:bus.progress,position:step.snapshot.position,district:step.snapshot.district,perf:step.perf});await page.screenshot({path:`output/playwright/phase8-suite/phase8-full-route-${i}.png`});}
    if(bus.phase==='arrived')break;
    stationary=Math.abs(bus.progress-lastProgress)<.00001?stationary+1:0;lastProgress=bus.progress;
    check(stationary<5,`The bus is stuck at ${JSON.stringify(step.snapshot.position)}`);
  }
  const arrived=await state();
  check(arrived.bus.phase==='arrived','Full bus journey did not arrive');
  check(phases.has('dwelling'),'No intermediate stop dwelling was observed');
  await page.screenshot({path:'output/playwright/phase8-suite/phase8-full-guruvayur-arrival.png'});
  await page.getByRole('button',{name:'Exit at stop',exact:true}).click();
  await page.waitForFunction(()=>window.__KOW__.snapshot().bus?.phase==='exited');
  check(!(await page.evaluate(()=>window.__KOW__.diagnostics().blocked)),'Full journey exit is blocked');
  await page.getByRole('button',{name:'Jump',exact:true}).click();await page.waitForTimeout(250);check((await state()).groundY>.05,'On-foot controls did not restore after leaving bus');await page.waitForTimeout(800);
  await page.getByRole('button',{name:'Save game',exact:true}).click();
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('kow.save.v2')));
  check(save.journeys.at(-1).completed&&save.journeys.at(-1).mode==='full','Full journey completion was not saved');
  await page.reload();await page.locator('.continue-button').click();await page.waitForFunction(()=>!!window.__KOW__?.snapshot());
  const restored=await state();
  check(Math.hypot(restored.position.x-save.position.x,restored.position.z-save.position.z)<5,'Destination position did not restore');
  check((await page.evaluate(()=>window.__KOW__.controls().avatar.gender))===save.avatar.gender,'Avatar did not restore');
  check(!(await page.evaluate(()=>window.__KOW__.diagnostics().blocked)),'Restored destination is blocked');
  await page.getByRole('button',{name:'Open world map',exact:true}).first().click();
  await page.getByRole('button',{name:'Select Kannur',exact:true}).click();
  await page.getByRole('button',{name:'Explore this location',exact:true}).click();
  await page.waitForFunction(()=>window.__KOW__?.diagnostics().region==='kannur');
  check(errors.length===0,errors.join('\n'));
  return {clock:'Accelerated deterministic integration of the normal live simulation; no Fast Journey used',walkingStart,atStation,requestedStop,resumed,arrived,restored,phases:[...phases],before,samples,save,continuedExploration:await state(),errors};
}
