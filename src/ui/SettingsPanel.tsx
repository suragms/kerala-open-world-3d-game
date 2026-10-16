import { useState } from "react";
import {
  X,
  Monitor,
  Mouse,
  Volume2,
  Globe,
  RotateCcw,
  Keyboard,
} from "lucide-react";
import type { Settings } from "../types";
import { DEFAULT_SETTINGS } from "../types";
export function SettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"controls" | "world" | "audio">("controls"),
    [remapping, setRemapping] = useState<string | null>(null);
  const update = (key: keyof Settings, value: unknown) =>
    onChange({ ...settings, [key]: value });
  return (
    <div className="modal-shade">
      <section
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onKeyDown={(e) => {
          if (remapping) {
            e.preventDefault();
            e.stopPropagation();
            if (e.code === "Escape") setRemapping(null);
            else if (
              !Object.values(settings.bindings).includes(e.code) ||
              settings.bindings[remapping] === e.code
            ) {
              update("bindings", { ...settings.bindings, [remapping]: e.code });
              setRemapping(null);
            }
          }
        }}
      >
        <div className="modal-top">
          <div>
            <span className="eyebrow">YOUR WORLD, YOUR WAY</span>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="tabs">
          {(
            [
              ["controls", "Controls", Mouse],
              ["world", "World & display", Monitor],
              ["audio", "Audio & language", Volume2],
            ] as const
          ).map(([id, title, Icon]) => (
            <button
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
              key={id}
            >
              <Icon size={15} />
              {title}
            </button>
          ))}
        </div>
        <div className="settings-content">
          {tab === "controls" ? (
            <>
              <Setting
                label="Movement mode"
                detail="Change at any time during your journey."
              >
                <select
                  aria-label="Movement mode"
                  value={settings.movement}
                  onChange={(e) => update("movement", e.target.value)}
                >
                  <option value="arrows">Arrow keys + WASD</option>
                  <option value="mouse">Mouse · click to move</option>
                  <option value="wasd">WASD + arrow keys</option>
                </select>
              </Setting>
              <Range
                label="Camera sensitivity"
                value={settings.sensitivity}
                min={0.2}
                max={2.5}
                step={0.1}
                onChange={(v) => update("sensitivity", v)}
              />
              <Range
                label="Camera distance"
                value={settings.distance}
                min={3}
                max={20}
                step={1}
                onChange={(v) => update("distance", v)}
              />
              <Setting
                label="Mouse steering"
                detail="In mouse mode: move horizontally to steer, hold left to accelerate and right to brake."
              >
                <input
                  aria-label="Mouse steering"
                  type="checkbox"
                  checked={settings.mouseSteering}
                  onChange={(e) => update("mouseSteering", e.target.checked)}
                />
              </Setting>
              <Setting label="Invert camera vertically">
                <input
                  aria-label="Invert camera vertically"
                  type="checkbox"
                  checked={settings.invert}
                  onChange={(e) => update("invert", e.target.checked)}
                />
              </Setting>
              <div className="subsection-label">
                <Keyboard size={14} /> KEY BINDINGS
              </div>
              <div className="bindings-grid">
                {Object.entries(settings.bindings).map(([action, code]) => (
                  <button
                    className={remapping === action ? "remapping" : ""}
                    key={action}
                    onClick={() => setRemapping(action)}
                  >
                    <span>{action}</span>
                    <kbd>
                      {remapping === action
                        ? "Press a key…"
                        : code
                            .replace("Key", "")
                            .replace("Arrow", "")
                            .replace("Left", " L")}
                    </kbd>
                  </button>
                ))}
              </div>
            </>
          ) : tab === "world" ? (
            <>
              <Setting
                label="Graphics quality"
                detail="Low mode reduces vegetation, shadows, traffic and resolution."
              >
                <select
                  aria-label="Graphics quality"
                  value={settings.quality}
                  onChange={(e) => update("quality", e.target.value)}
                >
                  {["low", "medium", "high", "ultra"].map((q) => (
                    <option key={q} value={q}>
                      {q[0].toUpperCase() + q.slice(1)}
                    </option>
                  ))}
                </select>
              </Setting>
              <Setting label="Weather">
                <select
                  aria-label="Weather"
                  value={settings.weather}
                  onChange={(e) => update("weather", e.target.value)}
                >
                  {["sunny", "cloudy", "rainy", "monsoon", "foggy"].map((q) => (
                    <option key={q} value={q}>
                      {q[0].toUpperCase() + q.slice(1)}
                    </option>
                  ))}
                </select>
              </Setting>
              <Setting label="Time of day">
                <select
                  aria-label="Time of day"
                  value={settings.time}
                  onChange={(e) => update("time", e.target.value)}
                >
                  {["morning", "afternoon", "evening", "night"].map((q) => (
                    <option key={q} value={q}>
                      {q[0].toUpperCase() + q.slice(1)}
                    </option>
                  ))}
                </select>
              </Setting>
              <p className="fine-note">
                Performance depends on your browser and graphics hardware. Start
                with Low for a device with limited memory.
              </p>
            </>
          ) : (
            <>
              <Range
                label="Master volume"
                value={settings.master}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => update("master", v)}
              />
              <Range
                label="Nature & weather"
                value={settings.ambience}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => update("ambience", v)}
              />
              <Range
                label="Vehicle engine"
                value={settings.engine}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => update("engine", v)}
              />
              <Setting
                label="Menu language"
                detail="Core menu labels. Place names and detailed descriptions use English."
              >
                <select
                  aria-label="Menu language"
                  value={settings.language}
                  onChange={(e) => update("language", e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="ml">മലയാളം</option>
                </select>
              </Setting>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button
            className="text-button"
            onClick={() =>
              onChange({
                ...DEFAULT_SETTINGS,
                bindings: { ...DEFAULT_SETTINGS.bindings },
              })
            }
          >
            <RotateCcw size={14} /> Reset defaults
          </button>
          <button className="primary" onClick={onClose}>
            Done <span>✓</span>
          </button>
        </div>
      </section>
    </div>
  );
}
function Setting({
  label,
  detail,
  children,
}: {
  label: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
      {children}
    </div>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <Setting label={label}>
      <div className="range-control">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span>
          {max === 1 ? `${Math.round(value * 100)}%` : value.toFixed(1)}
        </span>
      </div>
    </Setting>
  );
}
