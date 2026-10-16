async (page) => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const areas=await page.evaluate(async()=>await(await fetch('/data/extra-areas.json')).json());const results=[];
 for(const area of areas){
  await page.getByRole('button',{name:'Open world map',exact:true}).first().click();await page.getByRole('textbox',{name:'Search places',exact:true}).fill(area.name);
  const result=page.locator('.search-results .place-result').filter({has:page.getByText(area.name,{exact:true})}).filter({hasText:area.kind.replaceAll('_',' ')}).first();await result.click();
  await page.getByRole('button',{name:'Explore this location',exact:true}).click();await page.waitForFunction(id=>window.__KOW__?.diagnostics().area===id,area.tile);await page.waitForTimeout(700);
  const diag=await page.evaluate(()=>window.__KOW__.diagnostics());const state=await page.evaluate(()=>window.__KOW__.snapshot());
  if(diag.blocked)throw new Error(`${area.tile}: arrival is inside a collision volume`);
  if(area.kind==='airport'&&diag.runways===0)throw new Error(`${area.tile}: missing sourced runway geometry`);
  await page.screenshot({path:`output/playwright/area-${area.tile}.png`});results.push({area:area.tile,name:area.name,district:diag.region,roads:diag.roads,runways:diag.runways,railways:diag.railways,metro:diag.metro,train:diag.train,fps:state.fps,blocked:diag.blocked});
 }
 await page.getByRole('button',{name:'Travel by bus, rail or air',exact:true}).click();await page.getByRole('button',{name:'Airport',exact:true}).click();
 const airports=await page.locator('.transport-destinations > button').count();if(airports!==4)throw new Error(`Airport service should offer four airports, found ${airports}`);
 await page.getByRole('button',{name:'Railway',exact:true}).click();const stations=await page.locator('.transport-destinations > button').count();if(stations<4)throw new Error('Imported railway services missing');
 await page.getByRole('button',{name:'District bus',exact:true}).click();const buses=await page.locator('.transport-destinations > button').count();if(buses!==14)throw new Error('District bus coverage incomplete');
 await page.screenshot({path:'output/playwright/20-transport.png'});await page.getByRole('button',{name:'Close travel',exact:true}).click();return {areas:results,airportServices:airports,railwayServices:stations,busDestinations:buses,errors};
}
