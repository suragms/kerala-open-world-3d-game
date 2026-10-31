async(page)=>{
  const state=()=>page.evaluate(()=>window.__KOW__.snapshot()),advance=async(seconds=30)=>page.evaluate(s=>window.__KOW__.advanceJourney(s),seconds);
  await page.getByRole('button',{name:'Open world map',exact:true}).first().click();
  await page.getByRole('textbox',{name:'Search places',exact:true}).fill('Thrissur KSRTC Bus Station');
  await page.getByRole('button',{name:'Bus stations',exact:true}).click();await page.locator('.search-results .place-result').first().click();await page.getByRole('button',{name:'Explore this location',exact:true}).click();
  await page.waitForFunction(()=>window.__KOW__?.diagnostics().area==='station-thrissur');
  await page.getByRole('button',{name:'Travel by bus, rail or air',exact:true}).click();
  await page.locator('.bus-service').filter({hasText:'Guruvayur KSRTC'}).getByRole('button',{name:/Walk to departure station/}).click();
  for(let i=0;i<30&&!(await state()).nearStation;i++)await advance();
  await page.getByRole('button',{name:'Travel by bus, rail or air',exact:true}).click();await page.locator('.bus-service').filter({hasText:'Guruvayur KSRTC'}).getByRole('button',{name:'Wait for this bus',exact:true}).click();
  await page.waitForFunction(()=>!!window.__KOW__?.journey());await page.getByRole('button',{name:'Walk to passenger door',exact:true}).click();
  for(let i=0;i<30&&!(await state()).bus.canBoard;i++)await page.evaluate(()=>window.__KOW__.advanceJourney(2));
  await page.getByRole('button',{name:'Board bus',exact:true}).click();await page.getByRole('button',{name:'Seat 1 available',exact:true}).click();await page.getByRole('button',{name:'Begin full journey',exact:true}).click();
  await page.getByRole('button',{name:'Get off at next stop',exact:true}).click();
  for(let i=0;i<2000&&!(await state()).bus.canExit;i++)await advance(2);
  const stopped=await state();if(stopped.bus.phase!=='dwelling'||!stopped.bus.acknowledgedStop || stopped.bus.requestStop||stopped.bus.speed!==0)throw new Error('Intermediate stop request was not honored');
  await page.screenshot({path:'output/playwright/phase8-suite/phase9-request-acknowledged.png'});
  await page.getByRole('button',{name:'Save game',exact:true}).click();const checkpoint=await page.evaluate(()=>JSON.parse(localStorage.getItem('kow.save.v2')));
  await page.reload();await page.locator('.continue-button').click();await page.waitForFunction(()=>!!window.__KOW__?.snapshot());
  const restored=await state(),blocked=await page.evaluate(()=>window.__KOW__.diagnostics().blocked);
  if(restored.bus?.attached||blocked||Math.hypot(restored.position.x-checkpoint.safeLocation.position.x,restored.position.z-checkpoint.safeLocation.position.z)>5)throw new Error('Ongoing bus checkpoint was not restored safely');
  await page.screenshot({path:'output/playwright/phase8-suite/phase8-stop-checkpoint.png'});
  return {stopped,checkpoint:{kind:checkpoint.checkpoint,safeLocation:checkpoint.safeLocation},restored,blocked};
}
