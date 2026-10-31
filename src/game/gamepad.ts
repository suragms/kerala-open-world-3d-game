import type { Settings } from "../types";

export interface ControllerFrame {
  connected: boolean; id: string; standard: boolean;
  moveX: number; moveY: number; lookX: number; lookY: number;
  accelerate: number; brake: number; sprint: boolean; handbrake: boolean;
  pressed: Set<string>;
}
export function deadzone(value: number, zone: number) {
  if (!Number.isFinite(value)) return 0;
  const d = Math.max(0, Math.min(0.8, zone));
  return Math.sign(value) * Math.min(1, Math.max(0, Math.abs(value) - d) / (1 - d));
}
export const emptyController = (): ControllerFrame => ({ connected: false, id: "", standard: false,
  moveX: 0, moveY: 0, lookX: 0, lookY: 0, accelerate: 0, brake: 0,
  sprint: false, handbrake: false, pressed: new Set() });

/** Pure edge detection, including reset on disconnect. Unknown layouts use editable mappings. */
export class GamepadInputController {
  private previous = new Set<string>();
  private index = -1;
  frame = emptyController();
  sample(pad: Pick<Gamepad, "id" | "index" | "connected" | "mapping" | "axes" | "buttons"> | null, settings: Settings) {
    if (!pad?.connected) {
      this.previous.clear(); this.index = -1;
      return this.frame = emptyController();
    }
    if (this.index !== pad.index) this.previous.clear();
    this.index = pad.index;
    const button = (index: number) => Math.max(0, Math.min(1, pad.buttons[index]?.value ?? 0));
    const down = new Set(Object.entries(settings.gamepadButtons)
      .filter(([, i]) => button(i) > 0.5).map(([action]) => action));
    const pressed = new Set([...down].filter(x => !this.previous.has(x)));
    this.previous = down;
    const axes = settings.gamepadAxes;
    return this.frame = { connected: true, id: pad.id, standard: pad.mapping === "standard",
      moveX: deadzone(pad.axes[axes[0]] ?? 0, settings.gamepadDeadzone),
      moveY: -deadzone(pad.axes[axes[1]] ?? 0, settings.gamepadDeadzone),
      lookX: deadzone(pad.axes[axes[2]] ?? 0, settings.gamepadDeadzone),
      lookY: deadzone(pad.axes[axes[3]] ?? 0, settings.gamepadDeadzone),
      accelerate: button(settings.gamepadButtons.accelerate), brake: button(settings.gamepadButtons.brake),
      sprint: down.has("run"), handbrake: down.has("jump"), pressed };
  }
}
export const controller = new GamepadInputController();
let currentPad: Gamepad | undefined;
export function vibrate(enabled: boolean, strong = 0.35) {
  if (!enabled) return;
  const actuator = currentPad?.vibrationActuator;
  try { void actuator?.playEffect("dual-rumble", { duration: 110, strongMagnitude: strong, weakMagnitude: 0.2 }).catch(() => {}); } catch { /* Optional browser capability. */ }
}

/** The only browser poller. Gameplay and menus share its sampled actions. */
export function startGamepadNavigation(settings: () => Settings, gameplay: () => boolean, action: (name: string) => void) {
  let frameId = 0, lastNavigation = 0, previousTime = 0;
  const poll = (now: number) => {
    const pads = typeof navigator.getGamepads === "function" ? Array.from(navigator.getGamepads()) : [];
    currentPad = pads.find((p): p is Gamepad => Boolean(p?.connected));
    const state = controller.sample(currentPad ?? null, settings());
    const dt = Math.min(0.05, (now - previousTime) / 1000 || 1 / 60);
    previousTime = now;
    if (state.connected && !document.hidden) {
      if (gameplay()) {
        for (const name of state.pressed) if (!["up", "down", "left", "right", "back"].includes(name)) action(name);
      } else {
        const root = document.querySelector<HTMLElement>('[role="dialog"]') ?? document.querySelector<HTMLElement>("main") ?? document.body;
        const controls = Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),[tabindex="0"],a[href]'))
          .filter(e => e.getClientRects().length && e.getAttribute("aria-hidden") !== "true");
        const focused = document.activeElement as HTMLElement;
        let index = controls.indexOf(focused);
        const direction = state.pressed.has("down") || state.pressed.has("right") ? 1
          : state.pressed.has("up") || state.pressed.has("left") ? -1
          : now - lastNavigation > 210 ? Math.abs(state.moveY) > 0.55 ? -Math.sign(state.moveY) : Math.abs(state.moveX) > 0.55 ? Math.sign(state.moveX) : 0 : 0;
        if (direction) {
          if (focused instanceof HTMLSelectElement && (state.pressed.has("left") || state.pressed.has("right"))) {
            focused.selectedIndex = Math.max(0, Math.min(focused.options.length - 1, focused.selectedIndex + direction));
            focused.dispatchEvent(new Event("change", { bubbles: true }));
          } else if (focused instanceof HTMLInputElement && focused.type === "range" && (state.pressed.has("left") || state.pressed.has("right"))) {
            const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
            set.call(focused, String(Number(focused.value) + direction * Number(focused.step || 1)));
            focused.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            index = (index + direction + controls.length) % controls.length;
            controls[index]?.focus(); controls[index]?.scrollIntoView({ block: "nearest" });
          }
          lastNavigation = now;
        }
        if (state.pressed.has("jump") || state.pressed.has("interact")) {
          if (focused instanceof HTMLSelectElement) {
            focused.selectedIndex = (focused.selectedIndex + 1) % focused.options.length;
            focused.dispatchEvent(new Event("change", { bubbles: true }));
          } else {
            const control=index>=0?focused:controls[0];
            if (control) {
              if (typeof control.click === "function") control.click();
              else control.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window}));
            }
          }
        }
        if (state.pressed.has("back") || state.pressed.has("pause") || state.pressed.has("map")) {
          if (document.querySelector('[role="dialog"]')) action("closeMenu");
        }
      }
    }
    // Smooth values at the gameplay layer, not at the menu layer.
    void dt;
    frameId = requestAnimationFrame(poll);
  };
  frameId = requestAnimationFrame(poll);
  return () => { cancelAnimationFrame(frameId); controller.sample(null, settings()); };
}
