import { deadzone } from "./gamepad";
export function mouseSteering(position: number, neutral: number, sensitivity: number, zone: number) {
  return deadzone(Math.max(-1, Math.min(1, (position - neutral) * sensitivity)), zone);
}
export function smoothSteering(current: number, target: number, speed: number, dt: number, assist = true) {
  const limit = assist ? 1 / (1 + Math.abs(speed) * 0.045) : 1;
  return current + (target * limit - current) * (1 - Math.exp(-dt * (target === 0 ? 5 : 7)));
}
export function vehicleThrottle(speed: number, accelerator: number, brake: number, reverse: boolean, handbrake: boolean, dt: number) {
  const direction = reverse ? -1 : 1;
  let next = speed + accelerator * direction * (reverse ? 4 : 7.5) * dt;
  if (brake || handbrake) {
    const amount = (brake * 13 + Number(handbrake) * 20) * dt;
    next = Math.sign(next) * Math.max(0, Math.abs(next) - amount);
  }
  next *= Math.exp(-(accelerator ? 0.14 : 0.85) * dt);
  return Math.abs(next) < 0.035 ? 0 : Math.max(-7, Math.min(28, next));
}
