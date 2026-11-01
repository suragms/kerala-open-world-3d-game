import { deadzone } from "./gamepad";
export function mouseSteering(position: number, neutral: number, sensitivity: number, zone: number) {
  return deadzone(Math.max(-1, Math.min(1, (position - neutral) * sensitivity)), zone);
}
export function smoothSteering(current: number, target: number, speed: number, dt: number, assist = true) {
  const limit = assist ? 1 / (1 + Math.abs(speed) * 0.045) : 1;
  return current + (target * limit - current) * (1 - Math.exp(-dt * (target === 0 ? 5 : 7)));
}
export function vehicleThrottle(speed: number, accelerator: number, brake: number, reverse: boolean, handbrake: boolean, dt: number) {
  if (![speed,accelerator,brake,dt].every(Number.isFinite) || dt<=0) return Number.isFinite(speed)?speed:0;
  accelerator=Math.max(0,Math.min(1,accelerator));brake=Math.max(0,Math.min(1,brake));
  const direction = reverse ? -1 : 1;
  if(speed*direction<-.15 && accelerator){accelerator=0;brake=Math.max(brake,1);}
  if(brake || handbrake)accelerator=0;
  const drag=accelerator?.14:.85,decay=Math.exp(-drag*dt),force=accelerator*direction*(reverse?4:7.5);
  let next=speed*decay+force/drag*(1-decay);
  if (brake || handbrake) {
    const amount = (brake * 13 + Number(handbrake) * 20) * dt;
    next = Math.sign(next) * Math.max(0, Math.abs(next) - amount);
  }
  return Math.abs(next) < 0.035 ? 0 : Math.max(-7, Math.min(28, next));
}
export function vehicleAttitude(pitch:number,roll:number,targetPitch:number,targetRoll:number,speed:number,braking:boolean,dt:number) {
  const blend=1-Math.exp(-Math.max(0,dt)*6);
  return {pitch:pitch+(Math.max(-.32,Math.min(.32,targetPitch+(braking&&Math.abs(speed)>1?.025:0)))-pitch)*blend,
    roll:roll+(Math.max(-.22,Math.min(.22,targetRoll))-roll)*blend};
}
