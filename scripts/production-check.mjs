import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { chromium } from "playwright";

const base="/kerala-open-world/",dist=resolve("dist-subdirectory"),output=resolve("output/playwright/phase10-production");
await mkdir(output,{recursive:true});
const build=spawn(process.execPath,["node_modules/vite/bin/vite.js","build","--base",base,"--outDir",dist],{stdio:"inherit",windowsHide:true});
if(await new Promise(ok=>build.once("exit",ok))!==0)process.exit(1);
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,"http://local").pathname);
  if(!path.startsWith(base)){res.writeHead(404);res.end("Outside deployment");return;}
  const file=resolve(dist,path.slice(base.length)||"index.html");
  if(file!==dist&&!file.startsWith(dist+sep)){res.writeHead(403);res.end();return;}
  try{const data=await readFile(file);res.setHeader("Content-Type",({".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".geojson":"application/json",".svg":"image/svg+xml"})[extname(file)]??"application/octet-stream");res.end(data);}
  catch{res.writeHead(404);res.end("Missing asset");}
});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const browser=await chromium.launch({channel:"chromium"}),page=await browser.newPage({viewport:{width:1440,height:900}}),failures=[];
page.setDefaultTimeout(60000);
page.on("pageerror",e=>failures.push(e.message));page.on("response",r=>{if(r.status()>=400)failures.push(`${r.status()} ${r.url()}`);});
page.on("console",message=>{if(message.type()==="error")failures.push(message.text());});
page.on("requestfailed",r=>{if(r.failure()?.errorText!=="net::ERR_ABORTED")failures.push(r.url());});
try{
  await page.goto(`http://127.0.0.1:${server.address().port}${base}`);
  await page.getByRole("button",{name:"Begin your journey",exact:true}).click();
  await page.getByRole("button",{name:"Male avatar Easygoing. Ready to explore.",exact:true}).click();
  await page.getByRole("button",{name:"Continue",exact:true}).click();
  await page.getByLabel("Starting district",{exact:true}).selectOption("thrissur");
  await page.getByRole("button",{name:"Start game",exact:true}).click();
  await page.waitForFunction(()=>window.__KOW__?.snapshot().chunks>=20);
  const diag=await page.evaluate(()=>window.__KOW__.diagnostics());
  if(diag.blocked)throw new Error("Production spawn blocked");
  await page.getByRole("button",{name:"Save game",exact:true}).click();await page.reload();
  await page.getByRole("button",{name:"Continue exploring",exact:false}).click();await page.waitForFunction(()=>!!window.__KOW__?.snapshot());
  const restored=await page.evaluate(()=>window.__KOW__.snapshot());
  if(restored.district!=="thrissur")throw new Error("Production save restoration failed");
  await page.screenshot({path:resolve(output,"subdirectory-continue.png")});
  if(failures.length)throw new Error(failures.join("\n"));
  await writeFile(resolve(output,"result.json"),JSON.stringify({passed:true,base,diag,restored,failures},null,2));
  console.log("PASS production subdirectory assets, terrain, male avatar, save and continue");
}catch(error){
  await page.screenshot({path:resolve(output,"failure.png")});await writeFile(resolve(output,"result.json"),JSON.stringify({passed:false,error:String(error),failures},null,2));console.error(error);process.exitCode=1;
}finally{await browser.close();await new Promise(ok=>server.close(ok));}
