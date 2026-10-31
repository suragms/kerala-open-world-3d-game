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
  private previousClick = -Infinity;
  private pointer?: number;
  private heldSince = 0;
  private callbacks: { release?: (interrupted: boolean) => void };
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
      release?: (interrupted: boolean) => void;
    },
  ) {
    this.callbacks = callbacks;
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
        if (e.code === "Escape" && action !== "pause") callbacks.action("pause");
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
        this.heldSince = performance.now();
        if (!this.driving && this.settings.movement === "mouse") {
          if (performance.now() - this.previousClick < 320) callbacks.action("sprintDestination");
          this.previousClick = performance.now();
          callbacks.click(e.clientX, e.clientY);
        }
      }
      if (e.button === 2) {
        this.rightHeld = true;
        if (!this.driving && this.leftHeld) { callbacks.release?.(true); this.leftHeld = false; }
      }
      this.pointer = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch { this.clear(); }
    };
    const move = (e: PointerEvent) => {
      if (this.pointer === e.pointerId && typeof e.buttons === "number") {
        if (this.leftHeld && !(e.buttons & 1)) callbacks.release?.(performance.now() - this.heldSince >= 250);
        this.leftHeld = Boolean(e.buttons & 1); this.rightHeld = Boolean(e.buttons & 2);
      }
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
      if (this.pointer !== undefined && e.pointerId !== this.pointer) return;
      if (e.button === 0 && this.leftHeld) {
        callbacks.release?.(performance.now() - this.heldSince >= 250);
        this.leftHeld = false;
      }
      if (e.button === 2) this.rightHeld = false;
      if (!this.leftHeld && !this.rightHeld) this.releasePointer();
    };
    const context = (e: MouseEvent) => e.preventDefault();
    const cancel = () => this.clear();
    const release = () => {
      if (this.leftHeld) callbacks.release?.(true);
      this.leftHeld = false;
      this.rightHeld = false;
      this.pointer = undefined;
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
    const visibility = () => { if (document.hidden) this.clear(); };
    // InputManager is also exercised without a document in deterministic unit tests.
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", visibility);
    this.cleanups.push(() => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", release);
      canvas.removeEventListener("contextmenu", context);
      canvas.removeEventListener("wheel", wheel);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", visibility);
    });
  }
  axis(
    negative: string,
    positive: string,
    alternateNegative: string,
    alternatePositive: string,
  ) {
    if (!this.active() || !["ON_FOOT", "IN_VEHICLE"].includes(this.context)) return 0;
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
    if (this.leftHeld) this.callbacks.release?.(true);
    this.keys.clear();
    this.leftHeld = false;
    this.rightHeld = false;
    this.mouseDriveDirection = 0;
    this.lookAround = false;
    this.previousClick = -Infinity;
    this.releasePointer();
  }
  private releasePointer() {
    const id = this.pointer; this.pointer = undefined;
    if (id !== undefined && this.canvas.hasPointerCapture?.(id)) this.canvas.releasePointerCapture(id);
  }
  dispose() {
    this.cleanups.forEach((fn) => fn());
    this.clear();
  }
}
