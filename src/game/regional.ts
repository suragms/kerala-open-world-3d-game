import type { Vec2 } from "../types";

export type PlantKind = "palm" | "banana" | "rubber" | "tea" | "broadleaf";
export interface RegionalProfile {
  landscape: string;
  walls: readonly string[];
  roof: string;
  plants: readonly PlantKind[];
}
const coastal = ["#e3d5b7", "#c4d1c2", "#e7c7a3", "#d9e1d7"];
const town = ["#e3d6ba", "#c9c7b8", "#b6c7c2", "#e1c4ac"];
const hills = ["#ddd4bc", "#bfcab8", "#d5baa0", "#b6c7c5"];
/** Art direction from the project brief. Plantings and architecture are Level C approximations. */
export const REGIONAL_PROFILES: Record<string, RegionalProfile> = {
  thiruvananthapuram: { landscape: "Capital streets and coastal gardens", walls: town, roof: "#97563c", plants: ["palm","palm","broadleaf","banana"] },
  kollam: { landscape: "Coast and lake settlements", walls: coastal, roof: "#91553f", plants: ["palm","palm","banana","broadleaf"] },
  pathanamthitta: { landscape: "River valleys and wooded foothills", walls: hills, roof: "#95583f", plants: ["broadleaf","rubber","banana","broadleaf"] },
  alappuzha: { landscape: "Backwaters and paddy country", walls: coastal, roof: "#a35e42", plants: ["palm","palm","banana","broadleaf"] },
  kottayam: { landscape: "Plantation towns and backwater edges", walls: town, roof: "#94543b", plants: ["rubber","rubber","banana","palm"] },
  idukki: { landscape: "Tea slopes and highland settlements", walls: hills, roof: "#855c48", plants: ["tea","tea","broadleaf","banana"] },
  ernakulam: { landscape: "Commercial streets and coastal neighbourhoods", walls: town, roof: "#98634a", plants: ["palm","broadleaf","banana","palm"] },
  thrissur: { landscape: "Temple town and tiled-roof neighbourhoods", walls: town, roof: "#9e5137", plants: ["palm","broadleaf","banana","palm"] },
  palakkad: { landscape: "Agricultural plains and fort town", walls: ["#d7ccb1","#d8bd92","#c5cdb5","#e2d6be"], roof: "#a6603e", plants: ["broadleaf","palm","banana","broadleaf"] },
  malappuram: { landscape: "Northern towns and plantation fringes", walls: coastal, roof: "#8e6048", plants: ["palm","banana","rubber","broadleaf"] },
  kozhikode: { landscape: "Coastal markets and city streets", walls: coastal, roof: "#97573d", plants: ["palm","palm","broadleaf","banana"] },
  wayanad: { landscape: "Wooded valleys and highland plantations", walls: hills, roof: "#805b46", plants: ["broadleaf","broadleaf","banana","rubber"] },
  kannur: { landscape: "Coastal settlements and laterite heritage", walls: coastal, roof: "#9b5940", plants: ["palm","broadleaf","palm","banana"] },
  kasaragod: { landscape: "Northern coast and rural settlements", walls: ["#dbc8a6","#c9d2bf","#d0b295","#e4d6ba"], roof: "#985637", plants: ["palm","palm","broadleaf","banana"] },
};
export function regionalPlant(profile: RegionalProfile, choice: number, tags: Record<string,string> = {}): PlantKind {
  const crop = `${tags.crop ?? ""} ${tags.trees ?? ""} ${tags.produce ?? ""}`;
  if (/tea/.test(crop)) return "tea";
  if (/rubber/.test(crop)) return "rubber";
  if (/banana/.test(crop)) return "banana";
  if (/coconut|palm/.test(crop)) return "palm";
  return profile.plants[Math.min(profile.plants.length - 1, Math.floor(Math.max(0,choice)*profile.plants.length))];
}
export function footprintFrame(points: Vec2[]) {
  const ring = points.filter((p,i) => i === 0 || Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z) > .001);
  if (ring.length > 2 && Math.hypot(ring[0].x-ring.at(-1)!.x,ring[0].z-ring.at(-1)!.z) < .001) ring.pop();
  let twiceArea=0, longest=0, ux=1, uz=0;
  for(let i=0;i<ring.length;i++) {
    const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    twiceArea+=a.x*b.z-b.x*a.z;if(length>longest){longest=length;ux=dx/length;uz=dz/length;}
  }
  const xs=ring.map(p=>p.x*ux+p.z*uz),zs=ring.map(p=>-p.x*uz+p.z*ux);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const x=(minX+maxX)/2,z=(minZ+maxZ)/2,w=maxX-minX,d=maxZ-minZ;
  return {ring,area:Math.abs(twiceArea)/2,winding:Math.sign(twiceArea),width:w,depth:d,
    rectangularity:w*d>0?Math.abs(twiceArea)/2/(w*d):0,center:{x:x*ux-z*uz,z:x*uz+z*ux},yaw:Math.atan2(-uz,ux)};
}
export function facadeSlots(points: Vec2[], levels: number, budget: number) {
  const {ring,winding}=footprintFrame(points),slots:{point:Vec2;y:number;yaw:number}[]=[];
  for(let floor=0;floor<Math.min(4,levels);floor++)for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    if(length<2.6)continue;
    const count=Math.min(8,Math.max(1,Math.floor(length/3.5))),nx=winding*dz/length,nz=-winding*dx/length;
    for(let j=0;j<count;j++)slots.push({point:{x:a.x+dx*(j+.5)/count+nx*.08,z:a.z+dz*(j+.5)/count+nz*.08},
      y:floor*3.2+1.9,yaw:Math.atan2(nx,nz)});
  }
  const count=Math.min(slots.length,Math.max(0,budget));
  return Array.from({length:count},(_,i)=>slots[Math.floor(i*slots.length/count)]);
}
