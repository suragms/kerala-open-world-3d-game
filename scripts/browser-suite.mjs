import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { runInThisContext } from "node:vm";
import { resolve } from "node:path";
import net from "node:net";

const checks = (process.env.BROWSER_CHECKS ?? "controls,mouse-driving,gamepad,districts,transport,settings,character-movement,movement-edges,performance,final-review,phase8,bus-stop,rail,bus-full,bus-interdistrict,phase9,acceptance,loading-recovery,phase10,phase10-female").split(",");
const output = resolve(process.env.BROWSER_OUTPUT ?? "output/playwright/phase10");
await mkdir(output, { recursive: true });
const port = await new Promise((ok,fail) => { const server=net.createServer();server.once("error",fail);server.listen(0,"127.0.0.1",()=>{const port=server.address().port;server.close(()=>ok(port));}); });
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port",String(port),"--strictPort"],{stdio:["ignore","pipe","pipe"],windowsHide:true});
let serverLog="", browser;
server.stdout.on("data",b=>serverLog+=b);server.stderr.on("data",b=>serverLog+=b);
const base=`http://127.0.0.1:${port}/`, results=[];
const assertResult=(value,path="result")=>{
  if (!value || typeof value!=="object") return;
  if (value.passed===false || value.failure || Array.isArray(value.errors)&&value.errors.length) throw new Error(`Failed browser assertion at ${path}: ${JSON.stringify(value).slice(0,1500)}`);
  for(const [key,item]of Object.entries(value))if(item&&typeof item==="object")assertResult(item,`${path}.${key}`);
};
try {
  const deadline=Date.now()+30000;
  while(true){try{const response=await fetch(base);if(response.ok)break;}catch{}if(Date.now()>deadline)throw new Error("Test server did not become ready");await new Promise(r=>setTimeout(r,150));}
  browser=await chromium.launch({channel:"chromium",headless:process.env.HEADED!=="1"});
  for(const check of checks){
    if(!/^[a-z0-9-]+$/.test(check))throw new Error("Invalid browser workflow name");
    const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
    page.setDefaultTimeout(60000);
    const errors=[],requests=[];let result;
    page.on("pageerror",e=>errors.push(e.message));
    page.on("console",m=>{if(m.type()==="error")errors.push({message:m.text(),url:m.location().url});});
    page.on("requestfailed",r=>{if(r.failure()?.errorText!=="net::ERR_ABORTED")requests.push({url:r.url(),error:r.failure()?.errorText});});
    page.on("response",r=>{if(r.status()>=400)requests.push({url:r.url(),status:r.status()});});
    // Existing workflows keep their capture paths; redirect generated captures into the run directory.
    const screenshot=page.screenshot.bind(page);page.screenshot=options=>screenshot({...options,path:resolve(output,String(options.path??"capture.png").split(/[\\/]/).at(-1))});
    await context.tracing.start({screenshots:true,snapshots:true,sources:true});
    const began=Date.now();
    try{
      await page.goto(base);
      for(const name of ["start",check]){
        const fn=runInThisContext(`(${await readFile(`tests/browser-${name}.js`,"utf8")})`,{filename:`browser-${name}.js`});
        result=await fn(page);assertResult(result);if(!result)throw new Error(`${name} returned no result`);
        if(name==="start"){
          // Movement-edges deliberately reloads a saved female avatar.
          await page.getByRole("button",{name:"Save game",exact:true}).click();
        }
      }
      const expected=new Set(result.expectedNetworkFailures??[]);
      const expectedResponse=(url,status)=>url.startsWith(base) && expected.has(`${status} ${new URL(url).pathname}`);
      const unexpectedRequests=requests.filter(r=>!expectedResponse(r.url,r.status));
      const unexpectedErrors=errors.filter(e=>typeof e==="string" || !expectedResponse(e.url,503) || !/Failed to load resource.*503/.test(e.message));
      if(unexpectedErrors.length||unexpectedRequests.length)throw new Error(JSON.stringify({errors:unexpectedErrors,requests:unexpectedRequests}));
      results.push({check,passed:true,seconds:(Date.now()-began)/1000});
      console.log(`PASS ${check} (${results.at(-1).seconds.toFixed(1)}s)`);
      await context.tracing.stop();
    }catch(error){
      results.push({check,passed:false,error:String(error),seconds:(Date.now()-began)/1000});
      console.error(`FAIL ${check}: ${error}`);
      await writeFile(resolve(output,`failure-${check}-state.json`),JSON.stringify(await page.evaluate(()=>({snapshot:window.__KOW__?.snapshot(),perf:window.__KOW__?.perf(),controls:window.__KOW__?.controls()})).catch(()=>null),null,2));
      await page.screenshot({path:`failure-${check}.png`,fullPage:true}).catch(()=>{});
      await writeFile(resolve(output,`failure-${check}.html`),await page.content().catch(()=>"Page unavailable"));
      await context.tracing.stop({path:resolve(output,`trace-${check}.zip`)}).catch(()=>{});
    }finally{
      await writeFile(resolve(output,`${check}.json`),JSON.stringify({result,errors,requests},null,2));
      await writeFile(resolve(output,"suite-results.json"),JSON.stringify(results,null,2));
      await context.close();
    }
  }
  if(results.some(r=>!r.passed))process.exitCode=1;
}catch(error){console.error(error);process.exitCode=1;}
finally{
  await browser?.close();server.kill();await writeFile(resolve(output,"server.log"),serverLog);
}
