async(page)=>{
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const state=()=>page.evaluate(()=>window.__KOW__.snapshot());
 const probe=await page.evaluate(()=>window.__KOW__.travelProbe());assert(probe.bicycle,'Bicycle safely spawned');
 await page.getByRole('button',{name:'Mouse movement',exact:true}).click();
 await page.getByRole('button',{name:'Find bicycle',exact:true}).click();for(let i=0;i<30&&!(await state()).driving;i++)await page.evaluate(()=>window.__KOW__.advanceJourney(4));
 assert((await state()).vehicle==='Bicycle','Bicycle mounted through scene interaction');
 await page.keyboard.down('KeyW');await page.waitForTimeout(1200);await page.keyboard.up('KeyW');assert((await state()).speed>0&&(await state()).speed<=25,'Bicycle moves below cap');
 await page.screenshot({path:'bicycle.png'});await page.getByRole('button',{name:'Exit vehicle',exact:true}).click();await page.waitForTimeout(2000);assert(!(await state()).driving,'Bicycle safe dismount');
 await page.getByRole('button',{name:'Pause game',exact:true}).click();await page.getByRole('button',{name:'Return to arrival point',exact:false}).click();
 let taxi=null;
 const candidates=await page.evaluate(()=>window.__KOW__.travelProbe().taxiCandidates);
 for(const point of candidates){const booked=await page.evaluate(p=>window.__KOW__.requestLocalTaxi(p),point);if(booked){await page.waitForTimeout(120);if((await state()).taxi.remaining<250){taxi=point;break;}await page.getByRole('button',{name:'Cancel taxi',exact:true}).click();}}
 assert(taxi,'Safe short taxi route available in real scene: '+JSON.stringify(await page.evaluate(()=>window.__KOW__.travelProbe())));
 for(let i=0;i<30&&!(await state()).taxi?.canBoard;i++)await page.evaluate(()=>window.__KOW__.advanceJourney(4));
 assert((await state()).taxi.canBoard,'Walk reaches taxi pickup');await page.getByRole('button',{name:'Board taxi',exact:true}).click();await page.waitForTimeout(200);
 await page.getByRole('button',{name:'Save game',exact:true}).click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('kow.save.v2')));assert(saved.checkpoint==='last-transport-stop','Taxi saves safe checkpoint');
 for(let i=0;i<60&&(await state()).taxi.phase!=='arrived';i++)await page.evaluate(()=>window.__KOW__.advanceJourney(4));
 const arrival=await state();assert(arrival.taxi.phase==='arrived','Taxi completes full local ride');
 await page.screenshot({path:'taxi-arrived.png'});await page.getByRole('button',{name:'Exit taxi',exact:true}).click();await page.waitForTimeout(250);assert(!(await state()).taxi,'Taxi safe exit');
 return {passed:true,bicycle:true,taxiFullRide:true,taxiDestination:taxi,arrival};
}
