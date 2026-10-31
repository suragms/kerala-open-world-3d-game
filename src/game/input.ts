import type { Settings } from "../types";
import { controller } from "./gamepad";
export type InputContext = "ON_FOOT" | "IN_VEHICLE" | "BUS_PASSENGER" | "TRAIN_PASSENGER" | "AIR_TRAVEL" | "MENU_OPEN" | "PAUSED";
export class InputManager {
  keys = new Set<string>();
  driving = false;
  mouseX = 0;
  leftHeld = false;
  rightHeld = false;
  mouseDriveDirection: -1 | 0 | 1 = 0;
  lookAround = false;
  device = "keyboard";
  context: InputContext = "ON_FOOT";
  neutral = 0;
  private previousClick = 0;
  private cleanups: (() => void)[] = [];
  constructor(
    public canvas: HTMLCanvasElement,
    public settings: Settings,
    public active: () => boolean,
    callbacks: {
      action: (name: string) => void;
      click: (x: number, y: number) => void;
      orbit: (dx: number, dy: number) => void;
      zoom: (delta: number) => void;
      track?: (x: number, y: number) => void;
    },
  ) {
    const listen = <K extends keyof WindowEventMap>(
      type: K,
      handler: (event: WindowEventMap[K]) => void,
    ) => {
      window.addEventListener(type, handler);
      this.cleanups.push(() => window.removeEventListener(type, handler));
    };
    listen("keydown", (e) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(tag) || (e.target as HTMLElement)?.isContentEditable) return;
      if (!active()) return;
      this.device = "keyboard";
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          e.code,
        )
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) {
        const action = Object.keys(this.settings.bindings).find(
          (k) => this.settings.bindings[k] === e.code,
        );
        if (action) callbacks.action(action);
        if (e.code === "Escape") callbacks.action("pause");
      }
    });
    listen("keyup", (e) => {
      this.keys.delete(e.code);
    });
    listen("blur", () => this.clear());
    const down = (e: PointerEvent) => {
      if (!active()) return;
      this.device = "mouse";
      e.preventDefault();
      canvas.focus();
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      callbacks.track?.(e.clientX, e.clientY);
      if (e.button === 0) {
        this.leftHeld = true;
        if (!this.driving && this.settings.movement === "mouse") {
          if (performance.now() - this.previousClick < 320) callbacks.action("sprintDestination");
          this.previousClick = performance.now();
          callbacks.click(e.clientX, e.clientY);
        }
      }
      if (e.button === 2) {
        this.rightHeld = true;
        if (!this.driving) this.leftHeld = false;
      }
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (active()) this.device = "mouse";
      this.mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      callbacks.track?.(e.clientX, e.clientY);
      if (
        active() &&
        this.rightHeld &&
        !(
          this.driving &&
          this.settings.movement === "mouse" && !this.lookAround
        )
      )
        callbacks.orbit(e.movementX, e.movementY);
    };
    const up = (e: PointerEvent) => {
      if (e.button === 0) this.leftHeld = false;
      if (e.button === 2) this.rightHeld = false;
    };
    const context = (e: MouseEvent) => e.preventDefault();
    const cancel = () => this.clear();
    const release = () => {
      this.leftHeld = false;
      this.rightHeld = false;
    };
    const wheel = (e: WheelEvent) => {
      if (active()) {
        e.preventDefault();
        callbacks.zoom(e.deltaY);
      }
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("lostpointercapture", release);
    canvas.addEventListener("contextmenu", context);
    canvas.addEventListener("wheel", wheel, { passive: false });
    this.cleanups.push(() => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", release);
      canvas.removeEventListener("contextmenu", context);
      canvas.removeEventListener("wheel", wheel);
    });
  }
  axis(
    negative: string,
    positive: string,
    alternateNegative: string,
    alternatePositive: string,
  ) {
    if (!this.active() || this.context === "BUS_PASSENGER") return 0;
    const analog = positive === "forward" ? controller.frame.moveY : controller.frame.moveX;
    if (Math.abs(analog) > 0.01) this.device = "gamepad";
    const keyboard = (
      Number(
        this.keys.has(this.settings.bindings[positive]) ||
          this.keys.has(alternatePositive),
      ) -
      Number(
        this.keys.has(this.settings.bindings[negative]) ||
          this.keys.has(alternateNegative),
      )
    );
    return keyboard || analog;
  }
  setContext(context: InputContext) {
    if (context !== this.context) this.clear();
    this.context = context;
  }
  setMouseDriveDirection(direction: -1 | 0 | 1) {
    const available = this.active() && this.context === "IN_VEHICLE" && this.settings.movement === "mouse";
    if (available) this.device = "mouse";
    this.mouseDriveDirection = available ? direction : 0;
  }
  clear() {
    this.keys.clear();
    this.leftHeld = false;
    this.rightHeld = false;
    this.mouseDriveDirection = 0;
  }
  dispose() {
    this.cleanups.forEach((fn) => fn());
    this.clear();
  }
}
