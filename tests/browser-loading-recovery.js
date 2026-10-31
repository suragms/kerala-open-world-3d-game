async (page) => {
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const select=async name=>{
    await page.getByRole('button',{name:'Open world map',exact:true}).first().click();
    await page.getByRole('button',{name:`Select ${name}`,exact:true}).click();
    await page.getByRole('button',{name:'Explore this location',exact:true}).click();
  };
  let terrainAttempts=0;
  await page.route('**/data/elevation-kollam.json',async route=>{
    terrainAttempts++;if(terrainAttempts<=2)await route.fulfill({status:503,body:'temporarily unavailable'});else await route.continue();
  });
  await select('Kollam');await page.locator('.error-banner').waitFor();
  check(terrainAttempts===2,'Terrain retry was not bounded to two attempts');
  check((await page.evaluate(()=>window.__KOW__.controls().inputContext))==='MENU_OPEN','Failed scene loading resumed gameplay behind the map');
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await page.waitForFunction(()=>window.__KOW__?.diagnostics().region==='kollam');
  check(terrainAttempts===3,'Retry did not reattempt the failed scene');
  let staleAttempts=0;
  await page.route('**/data/pathanamthitta.json',async route=>{
    staleAttempts++;await new Promise(r=>setTimeout(r,650));await route.fulfill({status:503,body:'delayed old request'});
  });
  await select('Pathanamthitta');
  // Reproduce already-queued navigation events while the previous transition is still pending.
  await page.getByRole('button',{name:'Select Alappuzha',exact:true}).dispatchEvent('click');
  await page.getByRole('button',{name:'Explore this location',exact:true}).dispatchEvent('click');
  await page.waitForFunction(()=>window.__KOW__?.diagnostics().region==='alappuzha');await page.waitForTimeout(1800);
  check(staleAttempts===2,'Stale request did not exercise its failure handler');
  check(await page.locator('.error-banner').count()===0,'An older failed request overwrote the current scene');
  let geographyAttempts=0;
  await page.route('**/data/regions.json',async route=>{
    geographyAttempts++;if(geographyAttempts<=2)await route.fulfill({status:503,body:'temporary register failure'});else await route.continue();
  });
  await page.reload();await page.locator('.error-banner').waitFor();check(geographyAttempts===2,'Geography retry was not bounded');
  await page.getByRole('button',{name:'Retry',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.home-actions button').disabled);
  check(geographyAttempts===3,'Rejected geography cache did not recover');
  await page.screenshot({path:'loading-recovery.png'});
  return {terrainAttempts,staleAttempts,geographyAttempts,expectedNetworkFailures:['503 /data/elevation-kollam.json','503 /data/pathanamthitta.json','503 /data/regions.json']};
}
