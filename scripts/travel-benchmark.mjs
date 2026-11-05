import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {runInThisContext} from 'node:vm';
import net from 'node:net';
const out='output/playwright/travel-benchmark';await mkdir(out,{recursive:true});const results={};
for(const [name,cwd]of [['before',resolve('output/travel-baseline')],['after',process.cwd()]]){
 const port=await new Promise(ok=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p));});});
 const server=spawn(process.execPath,[resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd,stdio:'ignore',windowsHide:true});
 let browser;
 try{
  const url=`http://127.0.0.1:${port}`;for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chromium'});const landing=[];
  for(let i=0;i<3;i++){const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();const start=Date.now();await page.goto(url);await page.waitForFunction(()=>!document.querySelector('.home-actions button')?.disabled&&document.querySelector('.home-actions button'));await page.evaluate(()=>document.fonts.ready);landing.push({readyMs:Date.now()-start,...await page.evaluate(()=>({resources:performance.getEntriesByType('resource').reduce((s,r)=>s+r.transferSize,0),canvases:document.querySelectorAll('canvas').length}))});await context.close();}
  const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(url);page.setDefaultTimeout(60000);const screenshot=page.screenshot.bind(page);page.screenshot=opts=>screenshot({...opts,path:`${out}/${name}-game.png`});
  const start=runInThisContext(`(${await readFile('tests/browser-start.js','utf8')})`);await start(page);
  // Identical medium settings with dynamic resolution disabled in both builds.
  await page.getByRole('button',{name:'Open settings',exact:true}).click();const adaptive=page.getByLabel(/Adaptive resolution/);if(await adaptive.count())await adaptive.uncheck();await page.getByRole('button',{name:'Close settings',exact:true}).click();
  await page.waitForTimeout(2000);await page.keyboard.down('KeyW');
  const frames=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let previous=performance.now(),start=previous;function tick(now){samples.push(now-previous);previous=now;if(now-start<20000)requestAnimationFrame(tick);else{samples.sort((a,b)=>a-b);resolve({frames:samples.length,fps:1000*samples.length/samples.reduce((a,b)=>a+b,0),p95:samples[Math.floor(samples.length*.95)],p99:samples[Math.floor(samples.length*.99)],slowFrames:samples.filter(v=>v>50).length,perf:window.__KOW__.perf()});}}requestAnimationFrame(tick);}));
  await page.keyboard.up('KeyW');results[name]={landing,frames};console.log(name,JSON.stringify({landing,fps:frames.fps,p95:frames.p95}));
 }finally{await browser?.close();server.kill();}
}
await writeFile(`${out}/comparison.json`,JSON.stringify(results,null,2));
