async (page) => {
  const checks=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  const check=(name,passed,detail)=>{checks.push({name,passed:!!passed,detail});if(!passed)throw new Error(name+': '+JSON.stringify(detail));};
  const state=()=>page.evaluate(()=>window.__KOW__.snapshot());
  const controls=()=>page.evaluate(()=>window.__KOW__.controls());
  const canvas=page.locator('.game-canvas canvas');
  try {
    await page.setViewportSize({width:1440,height:900}); await page.reload(); await page.bringToFront();
    await page.getByRole('button',{name:'Continue exploring',exact:false}).click(); await page.waitForFunction(()=>window.__KOW__?.snapshot().chunks>=20);
    if((await page.evaluate(()=>window.__KOW__.diagnostics().region))!=='thrissur') {
      await page.getByRole('button',{name:'Open world map',exact:true}).first().click();await page.getByRole('button',{name:'Select Thrissur',exact:true}).click();await page.getByRole('button',{name:'Explore this location',exact:true}).click();await page.waitForFunction(()=>window.__KOW__?.diagnostics().region==='thrissur');await page.waitForTimeout(400);
    }
    await page.getByRole('button',{name:'Arrow keys',exact:true}).click(); await canvas.focus();
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(400);
    await page.getByRole('button',{name:'Pause game',exact:true}).click();
    let a=await state(); await page.waitForTimeout(500); let b=await state();
    check('Pause freezes movement',Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)<0.001);
    check('Pause clears held keyboard input',(await controls()).held.keys.length===0);
    await page.keyboard.up('ArrowUp'); await page.getByRole('button',{name:'Resume journey',exact:false}).click();
    check('Resume restores keyboard focus to the game',await canvas.evaluate(el=>el===document.activeElement));
    await page.waitForTimeout(100); a=await state(); await page.waitForTimeout(500); b=await state();
    check('Resume has no residual walking',Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)<0.02);
    await canvas.focus(); await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300);
    const other=await page.context().newPage(); await other.bringToFront(); await other.waitForTimeout(300); await other.close(); await page.bringToFront(); await page.keyboard.up('ArrowRight'); await page.waitForTimeout(500);
    check('Changing tabs releases held input',(await controls()).held.keys.length===0);
    a=await state(); await page.waitForTimeout(400); b=await state();
    check('Focus return has no stuck movement',Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)<0.02);
    await page.mouse.move(900,400); await page.mouse.wheel(0,450); await page.waitForTimeout(500); const distance=(await controls()).cameraDistance;
    await page.getByRole('button',{name:'Open settings',exact:true}).click();
    await page.getByRole('slider',{name:'Camera sensitivity',exact:true}).fill('1.2');
    await page.getByRole('button',{name:'Close settings',exact:true}).click();
    check('Unrelated settings preserve zoom',Math.abs((await controls()).cameraDistance-distance)<0.001);
    await page.getByRole('button',{name:'Open world map',exact:true}).first().click(); await page.getByRole('button',{name:'Select Wayanad',exact:true}).click(); await page.getByRole('button',{name:'Explore this location',exact:true}).click();
    await page.waitForFunction(()=>window.__KOW__?.diagnostics().region==='wayanad'); await page.waitForTimeout(800);
    check('Female body loads in hill terrain',(await controls()).avatar.gender==='female');
    await page.mouse.move(800,400); await page.mouse.down({button:'right'}); await page.mouse.move(800,50,{steps:16}); await page.mouse.up({button:'right'}); await page.mouse.wheel(0,2500); await page.waitForTimeout(600);
    let c=await controls(); check('Low-pitch maximum zoom clears hill terrain',c.terrainClearance>=0.299 && c.cameraClear,{pitch:c.cameraPitch,clearance:c.terrainClearance});
    await canvas.focus(); await page.keyboard.down('Shift'); await page.keyboard.down('ArrowUp');
    let clear=true;
    for(let i=0;i<8;i++){await page.waitForTimeout(180);c=await controls();clear=clear&&c.terrainClearance>=0.299&&c.cameraClear;}
    await page.keyboard.up('ArrowUp');await page.keyboard.up('Shift');
    check('Camera stays clear while running on slopes',clear);
    await page.screenshot({path:'output/playwright/character-hill-camera.png'});
    await page.mouse.move(800,100); await page.mouse.down({button:'right'}); await page.mouse.move(800,800,{steps:20}); await page.mouse.up({button:'right'}); await page.mouse.move(900,400); await page.mouse.wheel(0,-4000); await page.waitForTimeout(600);
    c=await controls(); check('High-pitch minimum zoom remains bounded',c.cameraPitch<=0.95&&c.cameraDistance===3&&c.cameraClear&&c.terrainClearance>=0.299,{pitch:c.cameraPitch,distance:c.cameraDistance,clearance:c.terrainClearance,clear:c.cameraClear});
    await canvas.focus();await page.keyboard.press('Escape'); await page.getByRole('button',{name:'Save & return home',exact:false}).click();
    await page.getByRole('button',{name:'Begin your journey',exact:true}).click();
    check('Saved preferences still require an explicit avatar choice',await page.getByRole('button',{name:'Continue',exact:true}).isDisabled());
    await page.getByRole('button',{name:'Female avatar Curious. Ready for the road.',exact:true}).click();
    await page.getByLabel('Hairstyle',{exact:true}).selectOption('curly');
    await page.getByRole('button',{name:'Female avatar Curious. Ready for the road.',exact:true}).click();
    check('Reselecting same body preserves hairstyle',(await page.getByLabel('Hairstyle',{exact:true}).inputValue())==='curly');
    const originalCanvas=await page.locator('.avatar-preview canvas').elementHandle();
    await page.getByRole('button',{name:'Top option 3',exact:true}).click();await page.getByLabel('Outfit',{exact:true}).selectOption('casual');await page.waitForTimeout(200);
    check('Customization preserves the live renderer',await page.evaluate(old=>old===document.querySelector('.avatar-preview canvas'),originalCanvas));
    const rotation=Number(await page.locator('.avatar-preview').getAttribute('data-rotation'));
    const bounds=await page.locator('.avatar-preview canvas').boundingBox();
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+100,bounds.y+bounds.height/2,{steps:10});await page.mouse.up();await page.waitForTimeout(100);
    check('Drag rotates the actual character preview',Number(await page.locator('.avatar-preview').getAttribute('data-rotation'))>rotation+0.7);
    await page.setViewportSize({width:390,height:844});await page.locator('.character-stage').scrollIntoViewIfNeeded();await page.waitForTimeout(400);
    check('Mobile character studio fits the viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check('Mobile preview stays live',(await page.locator('.avatar-preview').getAttribute('data-ready'))==='true');
    await page.screenshot({path:'output/playwright/character-studio-mobile.png'});
    await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>scrollTo(0,0));
    await page.getByRole('button',{name:'Run',exact:true}).click();await page.waitForTimeout(600);await page.screenshot({path:'output/playwright/character-running-preview.png'});
    await page.getByRole('button',{name:'Idle',exact:true}).click();await page.waitForTimeout(700);
    await page.screenshot({path:'output/playwright/character-studio-final.png'});
    await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('combobox',{name:'Starting district',exact:true}).selectOption('thrissur');await page.getByRole('button',{name:'Start game',exact:true}).click();await page.bringToFront();await page.waitForFunction(()=>window.__KOW__?.snapshot().chunks>=20);
    await canvas.focus();await page.keyboard.press('e');await page.waitForTimeout(300);
    check('Final vehicle entry',(await state()).driving);
    let outside=true;
    await page.keyboard.down('ArrowUp');
    for(let i=0;i<6;i++){await page.waitForTimeout(100);outside=outside&&(await controls()).cameraBodyDistance>=2.79;}
    await page.keyboard.up('ArrowUp');check('Vehicle transition keeps camera outside the body',outside);
    const yaw=(await controls()).cameraYaw;
    await page.mouse.move(700,400);await page.mouse.down({button:'right'});await page.mouse.move(1000,400,{steps:12});await page.mouse.up({button:'right'});await page.waitForTimeout(250);
    check('Keyboard driving permits independent camera orbit',Math.abs((await controls()).cameraYaw-yaw)>0.8);
    await canvas.focus();await page.keyboard.down('Space');await page.waitForTimeout(1300);await page.keyboard.up('Space');await page.keyboard.press('e');await page.waitForTimeout(250);
    check('Final vehicle exits safely',!(await state()).driving);
    await page.getByRole('button',{name:'Save game',exact:true}).click();await page.waitForTimeout(1000);
    check('No browser errors in edge checks',errors.length===0,errors);
    return {checks,errors,final:await state()};
  } catch(e){return {checks,errors,failure:e.message};}
}
