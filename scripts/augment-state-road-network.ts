import { readFileSync, writeFileSync } from "node:fs";
import type { StateNetwork, BusRouteData } from "../src/types";

/** Reproducible offline addition of already imported, attributed driving corridors. */
const path="public/data/state-network.json";
const network=JSON.parse(readFileSync(path,"utf8")) as StateNetwork;
const registry=JSON.parse(readFileSync("public/data/bus-services.json","utf8"));
network.features=network.features.filter(f=>!f.name.startsWith("Imported driving corridor: "));
registry.routes.forEach((service: {file:string;id:string}, index:number)=>{
  const route=JSON.parse(readFileSync(`public/data/${service.file}`,"utf8")) as BusRouteData;
  network.features.push({id:-900000-index,kind:"road",ref:"",name:`Imported driving corridor: ${service.id}`,
    points:route.points,oneway:true});
});
// A routed driving corridor supplies its sourced direction only; it does not certify reverse access.
network.version="phase9-imported-corridors-1";
writeFileSync(path,JSON.stringify(network));
console.log(`Preserved all existing road/rail features and added ${registry.routes.length} directed, sourced driving corridors.`);
