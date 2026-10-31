import { test } from "node:test";
import assert from "node:assert/strict";
import { InputManager } from "../src/game/input";
import { DEFAULT_SETTINGS } from "../src/types";

class Canvas extends EventTarget {
  focus() {}
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 700 }; }
}
function event(type: string, properties: Record<string, unknown>) {
  const e = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(properties)) Object.defineProperty(e, key, { value });
  return e;
}
function setup() {
  const target = new EventTarget(), canvas = new Canvas(), actions: string[] = [], clicks: number[][] = [], orbits: number[][] = [], releases: boolean[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: target });
  let active = true;
  const input = new InputManager(canvas as unknown as HTMLCanvasElement, { ...DEFAULT_SETTINGS, movement: "mouse" }, () => active,
    { action: name => actions.push(name), click: (x,y) => clicks.push([x,y]), orbit:(x,y)=>orbits.push([x,y]), zoom:()=>{}, release:interrupted=>releases.push(interrupted) });
  return { input, target, canvas, actions, clicks, orbits, releases, setActive:(value:boolean)=>{active=value;} };
}
test("Mouse ground selection and UI blocking use the same active context", () => {
  const s=setup();
  s.canvas.dispatchEvent(event("pointerdown",{clientX:300,clientY:400,button:0,pointerId:1}));
  assert.deepEqual(s.clicks,[[300,400]]); assert.ok(s.input.leftHeld);
  s.input.setContext("MENU_OPEN"); s.setActive(false);
  s.canvas.dispatchEvent(event("pointerdown",{clientX:500,clientY:600,button:0,pointerId:1}));
  s.target.dispatchEvent(event("keydown",{code:"ArrowUp",repeat:false}));
  assert.equal(s.clicks.length,1); assert.equal(s.input.leftHeld,false); assert.equal(s.input.axis("backward","forward","KeyS","KeyW"),0);
  s.input.dispose();
});
test("Mouse release preserves a click destination but interrupts held following and lost capture",()=>{
  const s=setup();
  s.canvas.dispatchEvent(event("pointerdown",{clientX:300,clientY:400,button:0,pointerId:1}));
  s.target.dispatchEvent(event("pointerup",{button:0,pointerId:1}));assert.equal(s.releases.at(-1),false);assert.equal(s.input.leftHeld,false);
  s.canvas.dispatchEvent(event("pointerdown",{clientX:300,clientY:400,button:0,pointerId:1}));
  s.canvas.dispatchEvent(event("lostpointercapture",{}));assert.equal(s.releases.at(-1),true);assert.equal(s.input.leftHeld,false);
  s.canvas.dispatchEvent(event("pointerdown",{clientX:300,clientY:400,button:0,pointerId:1}));s.target.dispatchEvent(new Event("blur"));
  assert.equal(s.input.leftHeld,false);assert.equal(s.releases.at(-1),true);
  s.input.setContext("TRAIN_PASSENGER");s.target.dispatchEvent(event("keydown",{code:"KeyW",repeat:false}));assert.equal(s.input.axis("backward","forward","KeyS","KeyW"),0);
  s.input.dispose();s.target.dispatchEvent(event("keydown",{code:"KeyW",repeat:false}));assert.equal(s.input.keys.size,0);
});
test("Driving brake does not orbit the camera; dedicated look-around does", () => {
  const s=setup(); s.input.driving=true; s.input.setContext("IN_VEHICLE");
  s.canvas.dispatchEvent(event("pointerdown",{clientX:500,clientY:400,button:2,pointerId:1}));
  s.canvas.dispatchEvent(event("pointermove",{clientX:600,clientY:400,movementX:100,movementY:0}));
  assert.equal(s.orbits.length,0); assert.ok(s.input.rightHeld);
  s.input.lookAround=true;
  s.canvas.dispatchEvent(event("pointermove",{clientX:650,clientY:400,movementX:50,movementY:0}));
  assert.deepEqual(s.orbits,[[50,0]]); s.input.dispose();
});
test("Mouse vehicle direction controls require driving context and clear safely", () => {
  const s=setup(); s.input.setContext("IN_VEHICLE");
  s.input.setMouseDriveDirection(-1);
  assert.equal(s.input.mouseDriveDirection,-1); assert.equal(s.input.device,"mouse");
  s.input.setMouseDriveDirection(1); assert.equal(s.input.mouseDriveDirection,1);
  s.input.setContext("ON_FOOT"); assert.equal(s.input.mouseDriveDirection,0);
  s.input.setContext("IN_VEHICLE"); s.input.setMouseDriveDirection(1);
  s.input.clear(); assert.equal(s.input.mouseDriveDirection,0);
  s.input.setContext("ON_FOOT"); s.input.settings={...s.input.settings,movement:"arrows"};
  s.input.setContext("IN_VEHICLE"); s.input.setMouseDriveDirection(-1);
  assert.equal(s.input.mouseDriveDirection,0); s.input.dispose();
});
test("Context transitions, focus loss and pointer cancellation clear held controls", () => {
  const s=setup(); s.target.dispatchEvent(event("keydown",{code:"ArrowUp",repeat:false}));
  assert.equal(s.input.axis("backward","forward","KeyS","KeyW"),1);
  s.input.setContext("BUS_PASSENGER"); assert.equal(s.input.keys.size,0);
  s.target.dispatchEvent(event("keydown",{code:"KeyW",repeat:false}));
  assert.equal(s.input.axis("backward","forward","KeyS","KeyW"),0);
  s.input.setContext("ON_FOOT");
  s.canvas.dispatchEvent(event("pointerdown",{clientX:300,clientY:400,button:0,pointerId:1}));
  s.canvas.dispatchEvent(event("pointercancel",{})); assert.equal(s.input.leftHeld,false);
  s.target.dispatchEvent(event("keydown",{code:"ArrowUp",repeat:false})); s.target.dispatchEvent(new Event("blur"));
  assert.equal(s.input.keys.size,0); s.input.dispose();
});
test("Remapped actions fire once per key press while arrows and WASD remain supported", () => {
  const s=setup(); s.input.settings={...s.input.settings,bindings:{...s.input.settings.bindings,interact:"KeyF"}};
  s.target.dispatchEvent(event("keydown",{code:"KeyF",repeat:false})); s.target.dispatchEvent(event("keydown",{code:"KeyF",repeat:true}));
  assert.deepEqual(s.actions,["interact"]);
  s.target.dispatchEvent(event("keydown",{code:"KeyW",repeat:false})); assert.equal(s.input.axis("backward","forward","KeyS","KeyW"),1);
  s.input.clear(); s.target.dispatchEvent(event("keydown",{code:"ArrowLeft",repeat:false})); assert.equal(s.input.axis("left","right","KeyA","KeyD"),-1);
  s.input.dispose();
});
