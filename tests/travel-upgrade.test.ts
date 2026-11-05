import test from 'node:test';
import assert from 'node:assert/strict';
import { bicycleThrottle } from '../src/game/vehicle';
import { TaxiJourney, taxiRoute } from '../src/game/taxi';
import { CollisionWorld, RoadNetwork } from '../src/game/navigation';
import { destinationCategory, travelCapabilities } from '../src/game/travel';
import { validateSave } from '../src/game/save';
import { DEFAULT_AVATAR, type Place, type Region } from '../src/types';

test('Bicycle accelerates gradually, caps at 25 km/h, brakes without reverse',()=>{
  let v=0;for(let i=0;i<1200;i++)v=bicycleThrottle(v,1,0,1/60);
  assert.ok(v<=25/3.6&&v>6);for(let i=0;i<180;i++)v=bicycleThrottle(v,1,1,1/60);assert.equal(v,0);
  assert.equal(bicycleThrottle(0,-1,0,.1),0);
});
const network=()=>new RoadNetwork([{id:1,name:'Local road',kind:'residential',width:8,oneway:false,points:[{x:0,z:0},{x:0,z:-100}]}]);
test('Taxi route rejects disconnected roads and solid obstacles',()=>{
  const world=new CollisionWorld(),roads=network();
  assert.ok(taxiRoute(roads,world,{x:3,z:-5},{x:2,z:-85}));
  world.boxes=[{center:{x:0,z:-40},yaw:0,halfWidth:5,halfLength:4}];
  assert.equal(taxiRoute(roads,world,{x:3,z:-5},{x:2,z:-85}),undefined);
  const disconnected=new RoadNetwork([...roads.roads,{id:2,name:'Separate road',kind:'residential',width:8,oneway:false,points:[{x:40,z:0},{x:40,z:-100}]}]);
  assert.equal(taxiRoute(disconnected,new CollisionWorld(),{x:0,z:-5},{x:40,z:-85}),undefined);
});
test('Taxi requires pickup, completes a physical ride, stops at obstacles and on cancellation',()=>{
  const world=new CollisionWorld(),points=[{x:0,z:0},{x:0,z:-80}],pickup={x:3,z:0};
  const taxi=new TaxiJourney(points,pickup,{x:3,z:-80},'Village');
  assert.equal(taxi.board({x:30,z:0}),false);assert.equal(taxi.board(pickup),true);
  let previous={...taxi.position};for(let i=0;i<1200;i++){taxi.update(1/30,world);assert.ok(Math.hypot(taxi.position.x-previous.x,taxi.position.z-previous.z)<.3);previous={...taxi.position};}
  assert.equal(taxi.phase,'arrived');assert.equal(taxi.snapshot(taxi.position).canExit,true);
  const blocked=new TaxiJourney(points,pickup,{x:3,z:-80},'Village');blocked.board(pickup);world.boxes=[{center:{x:0,z:-20},yaw:0,halfWidth:3,halfLength:3}];
  for(let i=0;i<500;i++)blocked.update(1/30,world);assert.equal(blocked.phase,'blocked');assert.ok(blocked.position.z>-15);
  const cancelled=new TaxiJourney(points,pickup,{x:3,z:-80},'Village');cancelled.board(pickup);for(let i=0;i<100;i++)cancelled.update(1/30,new CollisionWorld());cancelled.stop();for(let i=0;i<100;i++)cancelled.update(1/30,new CollisionWorld());assert.equal(cancelled.speed,0);assert.equal(cancelled.phase,'blocked');
});
test('Travel coverage and passenger lock agree for every destination category',()=>{
  const r={id:'thrissur',origin:[76,10]} as Region;
  const p={id:'v',name:'Village',district:'thrissur',kind:'village',lat:10,lon:76} as Place;
  assert.equal(destinationCategory(p),'village');assert.equal(destinationCategory({...p,kind:'town'}),'city');
  assert.equal(travelCapabilities(p,r).quickTravel,true);assert.equal(travelCapabilities({...p,lon:77},r).covered,false);
  const locked=travelCapabilities(p,r,{region:r,area:'thrissur',snapshot:{taxi:{attached:true}} as never,reachable:true});assert.equal(locked.quickTravel,false);assert.equal(locked.gps,false);assert.equal(locked.taxi,false);
});
test('Interrupted taxi save restores the safe on-foot checkpoint',()=>{
  const saved=validateSave({version:2,avatar:DEFAULT_AVATAR,region:'thrissur',position:{x:0,z:-100},yaw:0,visited:[],discovered:[],distance:100,savedAt:new Date().toISOString(),checkpoint:'last-transport-stop',safeLocation:{region:'thrissur',area:'thrissur',position:{x:3,z:0},name:'Taxi pickup'}});
  assert.deepEqual(saved?.position,{x:3,z:0});assert.equal(saved?.locality,'Taxi pickup');
});
