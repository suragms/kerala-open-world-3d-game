async (page) => {
  const errors=[],samples=[],phases=new Set(),state=()=>page.evaluate(()=>window.__KOW__.snapshot());
  page.on('pageerror',e=>errors.push(e.message));
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const advance=async seconds=>{
    const step=await page.evaluate(seconds=>window.__KOW__.advanceJourney(seconds),seconds);
    check(step.maxStep<1.2,`Discontinuous physical simulation step: ${step.maxStep} metres`);
    step.phases.forEach(p=>phases.add(p)); return step;
  };
  // One continuous female-avatar session through controls, car travel, the full bus route and reload.
  await page.reload();
  await page.getByRole('button',{name:'Begin your journey',exact:true}).click();
  await page.getByRole('button',{name:'Female avatar Curious. Ready for the road.',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Starting district',{exact:true}).selectOption('thrissur');
  await page.getByRole('button',{name:'Start game',exact:true}).click();
  await page.waitForFunction(()=>window.__KOW__?.snapshot().chunks>=20);
  check((await page.evaluate(()=>window.__KOW__.controls().avatar.gender))==='female','Female avatar did not load');
  await page.getByRole('button',{name:'Mouse movement',exact:true}).click();
  let spawn=await state();
  const ground=await page.evaluate(p=>window.__KOW__.projectGround({x:p.x+5,z:p.z-10}),spawn.position);
  await page.mouse.click(ground.x,ground.y);await page.waitForTimeout(700);
  check(Math.hypot((await state()).position.x-spawn.position.x,(await state()).position.z-spawn.position.z)>.5,'Mouse walking failed');
  await page.getByRole('button',{name:'Toggle run',exact:true}).click();await page.waitForTimeout(350);
  check((await state()).runEnabled,'Run action failed');
  await page.getByRole('button',{name:'Jump',exact:true}).click();await page.waitForTimeout(180);check((await state()).groundY>.05,'Jump action failed');
  await page.waitForTimeout(800);await page.getByRole('button',{name:'Stop moving',exact:true}).click();
  const yaw=await page.evaluate(()=>window.__KOW__.controls().cameraYaw);
  await page.mouse.move(800,400);await page.mouse.down({button:'right'});await page.mouse.move(920,410,{steps:6});await page.mouse.up({button:'right'});
  check(Math.abs((await page.evaluate(()=>window.__KOW__.controls().cameraYaw))-yaw)>.1,'Mouse camera orbit failed');
  await page.getByRole('button',{name:'Pause game',exact:true}).click();await page.getByRole('button',{name:'Return to arrival point',exact:false}).click();
  await page.mouse.move(720,400);await page.locator('.interact-prompt').click();await page.waitForTimeout(250);check((await state()).driving,'Mouse car entry failed');
  await page.mouse.move(720,400);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();check((await state()).speed>3,'Mouse acceleration failed');
  await page.mouse.down({button:'right'});await page.waitForTimeout(900);await page.mouse.up({button:'right'});check((await state()).speed<1,'Mouse brake failed');
  await page.locator('.interact-prompt').click();await page.waitForTimeout(500);check(!(await state()).driving,'Car exit failed');
  check(!(await page.evaluate(()=>window.__KOW__.diagnostics().blocked)),'Car exit blocked');
  await page.getByRole('button',{name:'Open world map',exact:true}).first().click();await page.getByRole('button',{name:'Close world map',exact:true}).click();
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
    if(i===5)await page.screenshot({path:'output/playwright/phase8-suite/phase10-female-walk-to-station.png'});
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
  let openingChecked=false;
  for(let i=0;i<2000 && !(await state()).bus.canExit;i++){
    const live=await page.evaluate(()=>window.__KOW__.controls().bus);
    const next=live.stops.find(s=>s.distance>live.travelled+.01);
    const step=await advance(next && next.distance-live.travelled<25?.1:2);
    if(step.snapshot.bus.phase==='opening'){
      check(step.snapshot.bus.attached,'Passenger detached during door opening');
      check(await page.getByRole('button',{name:'Board bus',exact:true}).count()===0,'Opening stop displayed boarding controls to a seated passenger');
      openingChecked=true;
    }
  }
  check(openingChecked,'Did not inspect the intermediate door-opening state');
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
    if(i%12===0){samples.push({iteration:i,progress:bus.progress,position:step.snapshot.position,district:step.snapshot.district,perf:step.perf});await page.screenshot({path:`output/playwright/phase8-suite/phase10-female-route-${i}.png`});}
    if(bus.phase==='arrived')break;
    stationary=Math.abs(bus.progress-lastProgress)<.00001?stationary+1:0;lastProgress=bus.progress;
    check(stationary<5,`The bus is stuck at ${JSON.stringify(step.snapshot.position)}`);
  }
  const arrived=await state();
  check(arrived.bus.phase==='arrived','Full bus journey did not arrive');
  check(phases.has('dwelling'),'No intermediate stop dwelling was observed');
  await page.screenshot({path:'output/playwright/phase8-suite/phase10-female-guruvayur-arrival.png'});
  await page.getByRole('button',{name:'Exit at stop',exact:true}).click();
  await page.waitForFunction(()=>window.__KOW__.snapshot().bus?.phase==='exited');
  check(!(await page.evaluate(()=>window.__KOW__.diagnostics().blocked)),'Full journey exit is blocked');
  await page.getByRole('button',{name:'Jump',exact:true}).click();await page.waitForTimeout(250);check((await state()).groundY>.05,'On-foot controls did not restore after leaving bus');await page.waitForTimeout(800);
  const exitPosition=(await state()).position;
  let walked=false;
  for(let i=0;i<12&&!walked;i++){
    const a=i*Math.PI/6,screen=await page.evaluate(p=>window.__KOW__.projectGround(p),{x:exitPosition.x+Math.sin(a)*7,z:exitPosition.z+Math.cos(a)*7});
    if(!screen.visible||screen.x<270||screen.x>1100||screen.y<150||screen.y>680)continue;
    await page.mouse.click(screen.x,screen.y);await page.waitForTimeout(700);
    walked=Math.hypot((await state()).position.x-exitPosition.x,(await state()).position.z-exitPosition.z)>.3;
  }
  check(walked,'Mouse walking did not resume after arrival');
  await page.getByRole('button',{name:'Stop moving',exact:true}).click();await page.waitForTimeout(200);
  await page.getByRole('button',{name:'Save game',exact:true}).click();
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('kow.save.v2')));
  check(save.journeys.at(-1).completed&&save.journeys.at(-1).mode==='full','Full journey completion was not saved');
  await page.reload();await page.locator('.continue-button').click();await page.waitForFunction(()=>!!window.__KOW__?.snapshot());
  const restored=await state();
  check(Math.hypot(restored.position.x-save.position.x,restored.position.z-save.position.z)<5,'Destination position did not restore');
  check((await page.evaluate(()=>window.__KOW__.controls().avatar.gender))===save.avatar.gender,'Avatar did not restore');
  check(!(await page.evaluate(()=>window.__KOW__.diagnostics().blocked)),'Restored destination is blocked');
  check(restored.locality===save.locality && /Guruvayur/.test(restored.locality),'Destination locality did not restore');
  await page.getByRole('button',{name:'Open world map',exact:true}).first().click();
  await page.getByRole('button',{name:'Select Kannur',exact:true}).click();
  await page.getByRole('button',{name:'Explore this location',exact:true}).click();
  await page.waitForFunction(()=>window.__KOW__?.diagnostics().region==='kannur');
  check(errors.length===0,errors.join('\n'));
  return {clock:'Accelerated deterministic integration of the normal live simulation; no Fast Journey used',walkingStart,atStation,requestedStop,resumed,arrived,restored,phases:[...phases],before,samples,save,continuedExploration:await state(),errors};
}
