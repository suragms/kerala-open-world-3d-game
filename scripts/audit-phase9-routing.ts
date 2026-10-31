import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { estimateJourney } from "../src/game/navigation";
import type { Place, StateNetwork } from "../src/types";

const places = JSON.parse(readFileSync("public/data/places.json","utf8")) as Place[];
const network = JSON.parse(readFileSync("public/data/state-network.json","utf8")) as StateNetwork;
const pairs = [["Thrissur","Guruvayur"],["Thrissur","Ernakulam"],["Ernakulam","Aluva"],["Kozhikode","Kannur"],["Kottayam","Ernakulam"]];
const results = pairs.flatMap(([from,to]) => {
  const station = (name: string) => places.find(p=>p.kind === "station" && p.name.toLowerCase().includes(name.toLowerCase()))!;
  const a=station(from),b=station(to);
  return (["road","rail"] as const).map(mode=>({from:a.name,to:b.name,mode,...estimateJourney([a.lon,a.lat],[b.lon,b.lat],mode,network)}));
});
const registry=JSON.parse(readFileSync("public/data/bus-services.json","utf8"));
for(const service of registry.routes){
  const a=registry.stations.find((s: {id:string})=>s.id===service.from),b=registry.stations.find((s: {id:string})=>s.id===service.to);
  results.push({from:a.name,to:b.name,mode:"road",...estimateJourney(a.coordinate,b.coordinate,"road",network)});
}
mkdirSync("output/playwright/phase9",{recursive:true});
writeFileSync("output/playwright/phase9/routing-audit.json",JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
