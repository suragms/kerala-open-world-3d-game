async (page) => {
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const state=()=>page.evaluate(()=>window.__KOW__.snapshot());
  const results=[];
  await page.getByRole('button',{name:'Mouse movement',exact:true}).click();
  let start=await state();
  const point=await page.evaluate(p=>window.__KOW__.projectGround({x:p.x+7,z:p.z-15}),start.position);
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.waitForTimeout(800);await page.mouse.up();
  await page.waitForTimeout(150);const released=await state();await page.waitForTimeout(700);let stopped=await state();
  check(!stopped.destination && Math.hypot(stopped.position.x-released.position.x,stopped.position.z-released.position.z)<.03,'Held mouse movement survived release');
  results.push({name:'held mouse release',passed:true});
  const click=await page.evaluate(p=>window.__KOW__.projectGround({x:p.x+6,z:p.z-8}),stopped.position);
  await page.mouse.click(click.x,click.y);await page.waitForTimeout(400);check((await state()).destination,'Quick click did not preserve destination');
  await page.getByRole('button',{name:'Stop moving',exact:true}).click();
  results.push({name:'single click destination',passed:true});
  await page.getByRole('button',{name:'Open settings',exact:true}).click();
  await page.locator('.bindings-grid button').filter({hasText:'interact'}).click();await page.keyboard.press('w');
  check((await page.getByRole('alert').innerText()).includes('reserved'),'WASD binding conflict has no warning');
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Close settings',exact:true}).click();
  results.push({name:'binding conflict warning',passed:true});
  const contextLossSupported=await page.locator('.game-canvas canvas').evaluate(canvas=>{
    const extension=canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if(!extension)return false;window.__phase9ContextLoss=extension;extension.loseContext();return true;
  });
  if(contextLossSupported){
    await page.waitForTimeout(200);const lost=await state();await page.waitForTimeout(400);const held=await state();
    check(Math.hypot(lost.position.x-held.position.x,lost.position.z-held.position.z)<.001,'Graphics loss did not freeze simulation');
    await page.evaluate(()=>{window.__phase9ContextLoss.restoreContext();delete window.__phase9ContextLoss;});
    await page.waitForTimeout(600);results.push({name:'real WebGL context loss and restoration',passed:true});
  }
  const lifecycle=[];
  for(const district of ['ernakulam','wayanad','thrissur','ernakulam','wayanad','thrissur']){
    await page.getByRole('button',{name:'Open world map',exact:true}).first().click();
    await page.getByRole('button',{name:`Select ${district==='ernakulam'?'Ernakulam':district==='wayanad'?'Wayanad':'Thrissur'}`,exact:true}).click();
    await page.getByRole('button',{name:'Explore this location',exact:true}).click();
    await page.waitForFunction(id=>window.__KOW__?.diagnostics().region===id,district);
    await page.waitForFunction(()=>window.__KOW__.perf().streaming.queued===0);
    const diag=await page.evaluate(()=>window.__KOW__.diagnostics()),perf=await page.evaluate(()=>window.__KOW__.perf());
    check(!diag.blocked,'District restore is blocked');check(await page.locator('.game-canvas canvas').count()===1,'Orphaned canvas after scene switch');
    lifecycle.push({district,perf});
  }
  results.push({name:'repeated scene initialization/disposal and terrain streaming',passed:true});
  await page.screenshot({path:'phase9-input-and-lifecycle.png'});
  return {results,lifecycle,contextLossSupported};
}
