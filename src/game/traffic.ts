import * as THREE from "three";
import { Human, VehicleModel, box, material, seeded } from "./assets";
import type { VehicleKind } from "./assets";
import { distance } from "./navigation";
import type { Road, CollisionBox } from "./navigation";
import type { Vec2 } from "../types";
import { World } from "./world";
import { RailShuttle } from "./rail";
import { projectRoute, routeLengths, sampleRoute } from "./bus";
import { TrafficStopDwell } from "./trafficStops";
import { LaneMotion, laneLengths, lanePose, trafficBody, safeApproachSpeed, relativeTraffic, signalIsRed, crossingClear,trafficConnections,trafficNodeKey,CorridorReservation } from "./trafficLogic";

export interface TrafficAgent {
  model: VehicleModel;
  road: Road;
  segment: number;
  t: number;
  speed: number;
  direction: number;
  motion: LaneMotion;
}
export interface Pedestrian {
  human: Human;
  a: Vec2;
  b: Vec2;
  progress: number;
  direction: number;
  name: string;
}
export class TrafficManager {
  agents: TrafficAgent[] = [];
  pedestrians: Pedestrian[] = [];
  root = new THREE.Group();
  train?: THREE.Group;
  rail?: RailShuttle;
  private trainAltitude = 0;
  private stopDwell = new TrafficStopDwell();
  private relocationTime=0;
  private connections=new Map<string,{road:Road;metres:number;direction:number}[]>();
  private signals:Vec2[];
  private reservation?:CorridorReservation;
  clearReservation(){this.reservation=undefined;}
  private key=trafficNodeKey;
  get bodies():CollisionBox[]{return this.agents.map(a=>({source:"traffic",center:a.motion.position,yaw:a.motion.yaw,halfWidth:a.motion.body.halfWidth,halfLength:a.motion.body.halfLength,
    minY:this.world.height(a.motion.position.x,a.motion.position.z),maxY:this.world.height(a.motion.position.x,a.motion.position.z)+a.motion.body.height}));}
  staticBlocked(agent:TrafficAgent){const probe=this.world.collisions.withAdditionalBoxes([]);probe.boxes=probe.boxes.filter(b=>b.source!=="traffic");return probe.boxBlocked(agent.motion.position,agent.motion.yaw,agent.motion.body.halfWidth,agent.motion.body.halfLength);}
  constructor(public world: World,corridor?:Vec2[]) {
    world.scene.add(this.root);
    if(corridor?.length)this.reservation=new CorridorReservation(corridor);
    this.signals=world.localFeatures.filter(f=>f.source.tags.highway==="traffic_signals").map(f=>f.center);
    const rng = seeded(world.region.id.length * 1821),
      roads = world.roads.filter((r) => r.width >= 6 && r.points.length > 2);
    const pool = roads.length ? roads : world.roads;
    this.connections=trafficConnections(world.roads);
    const count = world.settings.quality === "low" ? 6 : 12;
    for (let attempt = 0; this.agents.length < count && pool.length && attempt<count*30; attempt++) {
      const i=this.agents.length;
      const road = pool[Math.floor(rng() * pool.length)],
        kind: VehicleKind =
          i % 9 === 0
            ? "Bus"
            : i%9===1 ? "Truck" : i%9===2 ? "Delivery van" : i%9===3 ? "Tourist van" : i%9===5 ? "Motorcycle"
            : i % 4 === 0
              ? "Auto rickshaw"
              : i % 3 === 0
                ? "Scooter"
                : "Hatchback";
      const direction=road.oneway?1:i%2?1:-1,metres=laneLengths(road).at(-1)!*(.15+rng()*.7),body=trafficBody(kind);
      const pose=lanePose(road,metres,direction);
      const probe=world.collisions.withAdditionalBoxes(this.reservation?.near(pose)??[]);
      if(distance(pose,world.spawn)<55 || probe.boxBlocked(pose,pose.yaw,body.halfWidth,body.halfLength) || this.agents.some(a=>distance(a.motion.position,pose)<15))continue;
      const model = new VehicleModel(
        kind,
        ["#a0a89b", "#e4d6b7", "#386c62", "#aa6549", "#b2b4ad"][i % 5],
      );
      const a = {
        model,
        road,
        segment: 1,
        t: rng(),
        speed: 4 + rng() * 4,
        direction,
        motion:new LaneMotion(road,metres,direction,body),
      };
      this.agents.push(a);
      this.root.add(model.root);
    }
    const primary = world.network.nearest(world.spawn)?.road;
    for (let i = 0; i < (world.settings.quality === "low" ? 3 : 8); i++) {
      const road =
        i < 5 && primary ? primary : pool[Math.floor(rng() * pool.length)];
      if (!road) continue;
      const index = Math.min(
          road.points.length - 1,
          1 + Math.floor(rng() * (road.points.length - 1)),
        ),
        a = road.points[index - 1],
        b = road.points[index],
        length = distance(a, b);
      if (length < 5) continue;
      const ox = (-(b.z - a.z) / length) * (road.width / 2 + 1.7),
        oz = ((b.x - a.x) / length) * (road.width / 2 + 1.7),
        pa = { x: a.x + ox, z: a.z + oz },
        pb = { x: b.x + ox, z: b.z + oz };
      if (world.collisions.blocked(pa) || world.collisions.blocked(pb) || !world.collisions.segmentClear(pa,pb,.45))
        continue;
      const human = new Human({
        gender: i % 2 ? "female" : "male",
        skin: ["#8e5537", "#b57e55", "#794a35"][i % 3],
        shirt: ["#c6b88f", "#bd8665", "#597b78", "#a4b7a4"][i % 4],
        pants: i % 2 ? "#ab6657" : "#dad0ac",
        shoes: "#3b3027",
        hair: i % 2 ? "long" : "short",
      });
      this.pedestrians.push({
        human,
        a: pa,
        b: pb,
        progress: rng(),
        direction: 1,
        name: ["Anil · local guide", "Meera · traveller", "Rajan · shopkeeper"][
          i % 3
        ],
      });
      this.root.add(human.root);
    }
    // Keep the arrival area inhabited even when the nearest imported pavement is far away.
    for (let angle = 0; angle < Math.PI * 2; angle += 0.45) {
      const a = {
        x: world.spawn.x + Math.cos(angle) * 6,
        z: world.spawn.z + Math.sin(angle) * 6,
      };
      const b = {
        x: world.spawn.x + Math.cos(angle) * 12,
        z: world.spawn.z + Math.sin(angle) * 12,
      };
      const blocked = Array.from({ length: 9 }, (_, i) => ({
        x: a.x + ((b.x - a.x) * i) / 8,
        z: a.z + ((b.z - a.z) * i) / 8,
      })).some((p) => world.collisions.blocked(p, 0.6));
      if (blocked) continue;
      const human = new Human({
        gender: "female",
        skin: "#a96c48",
        shirt: "#ba8a6a",
        pants: "#e2d3ae",
        shoes: "#382d24",
        hair: "long",
      });
      this.pedestrians.push({
        human,
        a,
        b,
        progress: 0.1,
        direction: 1,
        name: "Meera · local guide",
      });
      this.root.add(human.root);
      break;
    }
    const stations=world.localFeatures.filter(f=>["station","halt","stop"].includes(f.source.tags.railway)||f.source.tags.public_transport==="station").map(f=>({point:f.center,name:f.source.tags["name:en"]??f.source.tags.name??"Mapped station"}));
    if(world.region.theme==="station")stations.unshift({point:world.landmarkPosition,name:world.region.landmark});
    const alignments=[...world.railways,...world.metroTracks].filter(p=>p.length>2&&routeLengths(p).at(-1)!>90);
    const rail=alignments.sort((a,b)=>{
      const separation=(p:Vec2[])=>Math.min(...stations.map(s=>projectRoute(s.point,p,routeLengths(p)).separation),Infinity);
      return separation(a)-separation(b);
    })[0];
    this.trainAltitude = world.railways.includes(rail ?? []) ? 0 : 7.5;
    if (rail && world.region.id !== "idukki" && world.region.id !== "wayanad") {
      this.rail=new RailShuttle(rail,stations);
      this.train = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const coach = new THREE.Group();
        const body=material(i ? "#b3b7a3" : "#955644");
        box(coach,material("#5d5c53"),0,1,0,2.8,.2,13);
        box(coach,body,0,3.35,0,2.9,.2,13);
        for (const x of [-1.42,1.42]) {
          box(coach,body,x,1.55,0,.08,1,13);
          for(let z=-6.4;z<6.5;z+=1.6)box(coach,body,x,2.65,z,.08,1.3,.1);
        }
        for(const z of [-6.5,6.5])box(coach,body,0,1.6,z,2.8,1.1,.1);
        for(let z=-4.5;z<5;z+=1.7)for(const x of [-.85,.85]){
          box(coach,material("#476778"),x,1.5,z,.9,.2,.8);
          box(coach,material("#476778"),x,1.95,z+.35,.9,.8,.12);
        }
        coach.position.z = i * 14;
        this.train.add(coach);
      }
      this.root.add(this.train);
    }
    // Airport passenger NPCs
    if (world.region.theme === "airport") {
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        const a = {
          x: world.spawn.x + Math.cos(angle) * 8,
          z: world.spawn.z + Math.sin(angle) * 8,
        };
        const b = {
          x: world.spawn.x + Math.cos(angle) * 18,
          z: world.spawn.z + Math.sin(angle) * 18,
        };
        if (world.collisions.blocked(a) || world.collisions.blocked(b) || !world.collisions.segmentClear(a,b,.45)) continue;
        const human = new Human({
          gender: i % 2 ? "female" : "male",
          skin: ["#8e5537", "#b57e55", "#c9a882"][i % 3],
          shirt: ["#3a5f6e", "#7a8b6f", "#c2b48e"][i % 3],
          pants: i % 2 ? "#4a5c68" : "#9b9278",
          shoes: "#3b3027",
          hair: i % 2 ? "long" : "short",
        });
        this.pedestrians.push({
          human,
          a,
          b,
          progress: i * 0.33,
          direction: 1,
          name: ["Passenger · departing", "Traveller · arrivals", "Airport staff"][
            i % 3
          ],
        });
        this.root.add(human.root);
      }
    }
  }
  update(dt: number, time: number, player: Vec2,playerBody?:CollisionBox) {
    if(time>this.relocationTime){
      this.relocationTime=time+2;
      const nearest=this.world.network.nearest(player);
      if(nearest)for(const [index,agent] of this.agents.entries())if(distance(agent.motion.position,player)>550){
        const road=nearest.road, lengths=laneLengths(road);
        const choices=road.points.map((p,i)=>({p,i})).filter(({p,i})=>i>0&&distance(p,player)>220&&distance(p,player)<320);
        const target=choices[(index*7)%choices.length];
        if(target){
          const direction=road.oneway?1:index%2?1:-1,pose=lanePose(road,lengths[target.i],direction),body=agent.motion.body;
          if(!this.world.collisions.withAdditionalBoxes(this.reservation?.near(pose)??[]).boxBlocked(pose,pose.yaw,body.halfWidth,body.halfLength)&&!this.agents.some(other=>other!==agent&&distance(other.motion.position,pose)<18)){
            agent.motion=new LaneMotion(road,lengths[target.i],direction,body);this.stopDwell.reset(agent);
          }
        }
      }
    }
    const staticBoxes=this.world.collisions.boxes.filter(b=>b.source!=="traffic");
    const bodies=this.bodies;
    const pedestrianVehicles=this.agents.map(a=>({position:a.motion.position,yaw:a.motion.yaw,speed:a.motion.speed,body:a.motion.body}));
    for (const [index,agent] of this.agents.entries()) {
      const {motion,model}=agent;
      const lengths=laneLengths(motion.road),remaining=motion.direction>0?lengths.at(-1)!-motion.metres:motion.metres;
      if(remaining<.6){
        const endpoint=motion.direction>0?motion.road.points.at(-1)!:motion.road.points[0];
        const options=(this.connections.get(this.key(endpoint))??[]).filter(c=>c.road.width>motion.body.halfWidth*2+.4 && (c.road!==motion.road || distance(motion.road.points[0],motion.road.points.at(-1)!)<.01&&c.direction===motion.direction));
        options.sort((a,b)=>{
          const angle=(c:typeof a)=>{const p=lanePose(c.road,c.metres+c.direction*.1,c.direction);return Math.abs(Math.atan2(Math.sin(p.yaw-motion.yaw),Math.cos(p.yaw-motion.yaw)));};
          return angle(a)-angle(b);
        });
        const next=options[0];if(next)motion.continueOn(next.road,next.metres,next.direction);
      }
      let target=agent.speed,reason:typeof motion.phase="cruising";
      const limit=(speed:number,phase:typeof reason)=>{if(speed<target){target=speed;reason=phase;}};
      for(const other of this.agents)if(other!==agent){
        const relative=relativeTraffic(motion.position,motion.yaw,other.motion.position);
        if(relative.ahead>0&&Math.abs(relative.side)<motion.body.halfWidth+other.motion.body.halfWidth+.5){
          const aligned=Math.cos(other.motion.yaw-motion.yaw)>.65;
          const gap=relative.ahead-motion.body.halfLength-other.motion.body.halfLength-2;
          limit(Math.min(safeApproachSpeed(gap,aligned?other.motion.speed:0),Math.max(0,gap/1.2)),aligned?"following":"yielding");
        }
      }
      const toPlayer=relativeTraffic(motion.position,motion.yaw,player);
      const playerRadius=playerBody?Math.hypot(playerBody.halfWidth,playerBody.halfLength):1;
      if(toPlayer.ahead>0&&Math.abs(toPlayer.side)<motion.body.halfWidth+playerRadius)limit(safeApproachSpeed(toPlayer.ahead-motion.body.halfLength-playerRadius-2),"yielding");
      for(const p of this.pedestrians){const r=relativeTraffic(motion.position,motion.yaw,p.human.root.position);
        if(p.human.root.visible&&r.ahead>0&&Math.abs(r.side)<motion.body.halfWidth+.8)limit(safeApproachSpeed(r.ahead-motion.body.halfLength-2),"crossing");}
      for(const signal of this.signals){const r=relativeTraffic(motion.position,motion.yaw,signal);
        if(r.ahead>0&&r.ahead<65&&Math.abs(r.side)<motion.road.width&&signalIsRed(time,signal))limit(safeApproachSpeed(r.ahead-motion.body.halfLength-2),"signal");}
      if(model.kind==="Bus"){
        const nearStop=this.world.busStopPositions.find(s=>distance(s,motion.position)<12);
        if(this.stopDwell.waiting(agent,nearStop?this.key(nearStop):"",Boolean(nearStop),time))limit(0,"bus-stop");
      }
      const probe=this.world.collisions.withAdditionalBoxes([]);
      probe.boxes=[...staticBoxes,...bodies.filter((_,i)=>i!==index),...this.reservation?.near(motion.position)??[],playerBody??{center:player,yaw:0,halfWidth:.55,halfLength:.55}];
      motion.update(dt,target,probe,reason);
      agent.road=motion.road;agent.direction=motion.direction;agent.segment=motion.segment;agent.t=motion.t;
      model.root.position.set(motion.position.x,this.world.height(motion.position.x,motion.position.z),motion.position.z);
      model.root.rotation.y=-motion.yaw;
      model.root.visible=distance(player,motion.position)<330;
      model.animate(motion.speed,motion.phase!=="cruising",dt);
    }
    for (const p of this.pedestrians) {
      const len=distance(p.a,p.b)||1;
      if(!p.human.root.userData.placed){
        const x=p.a.x+(p.b.x-p.a.x)*p.progress,z=p.a.z+(p.b.z-p.a.z)*p.progress;
        p.human.root.position.set(x,this.world.height(x,z),z);p.human.root.userData.placed=true;
      }
      const walking=(((Math.floor(time+p.a.x)%15)+15)%15>2);
      const next=Math.max(0,Math.min(1,p.progress+(walking?p.direction*dt*.85/len:0)));
      const target={x:p.a.x+(p.b.x-p.a.x)*next,z:p.a.z+(p.b.z-p.a.z)*next};
      const from=p.human.root.position;
      const clear=crossingClear(target,pedestrianVehicles)&&this.world.collisions.segmentClear(from,target,.45);
      const moved=clear?distance(from,target):0;
      if(clear){p.progress=next;p.human.root.position.set(target.x,this.world.height(target.x,target.z),target.z);}
      if(p.progress>=1)p.direction=-1;if(p.progress<=0)p.direction=1;
      p.human.root.rotation.y=Math.atan2((p.b.x-p.a.x)*p.direction,(p.b.z-p.a.z)*p.direction);
      p.human.animate(time,dt>0?moved/dt:0,0);
      p.human.root.visible=distance(player,p.human.root.position)<180;
    }
    if (this.train && this.rail) {
      this.rail.update(dt);
      for (let c=0;c<this.train.children.length;c++) {
        const pose=sampleRoute(this.rail.points,this.rail.lengths,Math.max(0,this.rail.distance-c*14));
        const model=this.train.children[c];
        model.position.set(pose.x,this.world.height(pose.x,pose.z)+.25+this.trainAltitude,pose.z);
        model.rotation.y=-pose.yaw;
      }
    }
  }
}
