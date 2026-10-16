import type { Settings } from "../types";
export class InputManager {
  keys = new Set<string>();
  driving = false;
  mouseX = 0;
  leftHeld = false;
  rightHeld = false;
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
      if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(tag)) return;
      if (!active()) return;
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
      e.preventDefault();
      canvas.focus();
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      callbacks.track?.(e.clientX, e.clientY);
      if (e.button === 0) {
        this.leftHeld = true;
        if (this.settings.movement === "mouse")
          callbacks.click(e.clientX, e.clientY);
      }
      if (e.button === 2) {
        this.rightHeld = true;
        this.leftHeld = false;
      }
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      callbacks.track?.(e.clientX, e.clientY);
      if (
        active() &&
        this.rightHeld &&
        !(
          this.settings.mouseSteering &&
          this.driving &&
          this.settings.movement === "mouse"
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
    return (
      Number(
        this.keys.has(this.settings.bindings[positive]) ||
          this.keys.has(alternatePositive),
      ) -
      Number(
        this.keys.has(this.settings.bindings[negative]) ||
          this.keys.has(alternateNegative),
      )
    );
  }
  clear() {
    this.keys.clear();
    this.leftHeld = false;
    this.rightHeld = false;
  }
  dispose() {
    this.cleanups.forEach((fn) => fn());
    this.clear();
  }
}
