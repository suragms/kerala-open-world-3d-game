import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/playwright/travel-visual';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium'});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const result=[];
try{
 for(const [width,height]of [[1440,900],[1280,800],[768,1024],[360,800]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:5191');await page.getByRole('button',{name:'Begin your journey',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.home-actions button').disabled);await page.evaluate(()=>document.fonts.ready);
  const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,canvas:document.querySelectorAll('canvas').length}));if(dimensions.scroll>width)throw Error(`Overflow at ${width}`);
  await page.screenshot({path:`${out}/home-${width}.png`});await page.locator('#destinations').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/destinations-${width}.png`});
  result.push({width,...dimensions,timing:await page.evaluate(()=>performance.getEntriesByType('navigation')[0].toJSON())});
 }
 await page.setViewportSize({width:1440,height:900});await page.goto('http://127.0.0.1:5191');await page.getByRole('textbox',{name:'Search places',exact:true}).fill('Guruvayur KSRTC');await page.getByRole('button',{name:'Bus stands',exact:true}).click();await page.locator('.destination-results button').first().click();await page.getByRole('button',{name:'Start here',exact:true}).click();
 await page.getByRole('button',{name:'Female avatar Curious. Ready for the road.',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
 if(await page.getByLabel('Starting district',{exact:true}).inputValue()!=='thrissur')throw Error('Selected district lost');
 await page.getByRole('button',{name:'Start game',exact:true}).click();await page.waitForFunction(()=>window.__KOW__?.snapshot().chunks>=20); const selectedArrival=await page.evaluate(()=>({area:window.__KOW__.diagnostics().area,locality:window.__KOW__.snapshot().locality})); console.log(selectedArrival); if(!/guruvayur/i.test(selectedArrival.locality))throw Error('Selected place lost: '+JSON.stringify(selectedArrival));
 await page.screenshot({path:`${out}/selected-arrival.png`});
 if(errors.length)throw Error(JSON.stringify(errors));
 await writeFile(`${out}/result.json`,JSON.stringify({passed:true,result,selectionPreserved:true,errors},null,2));
 console.log('PASS responsive landing and selected destination through character setup');
}finally{await browser.close();}
