async(page)=>{
  const errors=[],state=()=>page.evaluate(()=>window.__KOW__.snapshot());page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'Open world map',exact:true}).first().click();
  await page.getByRole('textbox',{name:'Search places',exact:true}).fill('Thrissur railway station');
  await page.locator('.search-results .place-result').first().click();
  await page.getByRole('button',{name:'Explore this location',exact:true}).click();
  await page.waitForFunction(()=>window.__KOW__?.diagnostics().area==='station-thrissur');
  await page.getByRole('button',{name:'Walk to rail boarding area',exact:true}).click();
  for(let i=0;i<100;i++){await page.evaluate(()=>window.__KOW__.advanceJourney(10));if((await state()).rail.canBoard)break;}
  if(!(await state()).rail.canBoard)throw new Error('Could not walk to and wait for the station shuttle');
  await page.getByRole('button',{name:'Board local train',exact:true}).click();
  await page.waitForFunction(()=>window.__KOW__.snapshot().rail.attached);
  const cameras=[];
  for(let i=0;i<3;i++){cameras.push((await state()).cameraMode);await page.screenshot({path:`output/playwright/phase8-suite/phase8-train-camera-${i}.png`});await page.getByRole('button',{name:'Cycle train camera',exact:true}).click();}
  const start=await state();await page.evaluate(()=>window.__KOW__.advanceJourney(30));const moved=await state();
  await page.getByRole('button',{name:'Request station stop',exact:true}).click();
  for(let i=0;i<120;i++){await page.evaluate(()=>window.__KOW__.advanceJourney(30));if((await state()).rail.canExit)break;}
  if(!(await state()).rail.canExit)throw new Error('Requested station stop did not arrive');
  await page.getByRole('button',{name:'Save game',exact:true}).click();
  const checkpoint=await page.evaluate(()=>JSON.parse(localStorage.getItem('kow.save.v2')));
  await page.getByRole('button',{name:'Leave train at station',exact:true}).click();
  await page.waitForFunction(()=>!window.__KOW__.snapshot().rail.attached);
  const after=await state(),blocked=await page.evaluate(()=>window.__KOW__.diagnostics().blocked);
  if(new Set(cameras).size!==3||Math.hypot(start.position.x-moved.position.x,start.position.z-moved.position.z)<10||after.rail.attached||blocked||errors.length)throw new Error('Rail passenger flow failed');
  return {cameras,start,moved,checkpoint:checkpoint.checkpoint,after,blocked,errors};
}
