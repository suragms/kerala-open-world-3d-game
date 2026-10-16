import {
  ArrowLeft,
  ArrowRight,
  Check,
  PersonStanding,
  RotateCw,
  Shirt,
  Footprints,
} from "lucide-react";
import { ScenePreview } from "./ScenePreview";
import type { AvatarStyle, Gender } from "../types";
import { useState } from "react";
import type { CharacterMotion } from "../game/character";
export function CharacterSetup({
  avatar,
  gender,
  onGender,
  onChange,
  onBack,
  onContinue,
}: {
  avatar: AvatarStyle;
  gender: Gender | null;
  onGender: (g: Gender) => void;
  onChange: (a: AvatarStyle) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [animation, setAnimation] = useState<CharacterMotion>("idle");
  const [rotation, setRotation] = useState(0.2);
  const palettes: [string, string, string[]][] = [
    [
      "skin",
      "Skin tone",
      ["#d7a47d", "#b98055", "#a96c48", "#825036", "#603b2a"],
    ],
    ["shirt", "Top", ["#e8dfc5", "#3e6258", "#a66a4d", "#859daa", "#333c3b"]],
    [
      "pants",
      "Trousers",
      ["#40544b", "#d1bd94", "#3b454e", "#826e5b", "#272a28"],
    ],
    ["shoes", "Footwear", ["#3a2e27", "#e3dbbf", "#1e2829", "#8c6a43"]],
  ];
  return (
    <main className="setup-screen character-screen">
      <section className="setup-form">
        <button className="text-button back-link" onClick={onBack}>
          <ArrowLeft size={16} /> Back to home
        </button>
        <div className="step-label">
          <span>01</span> YOUR CHARACTER <i /> 02{" "}
          <span className="muted"> YOUR STARTING POINT</span>
        </div>
        <span className="eyebrow">EVERY JOURNEY BEGINS WITH YOU</span>
        <h1>
          Make this
          <br />
          journey yours.
        </h1>
        <p className="lead">
          A familiar face. A favourite outfit.
          <br />
          Your own way to explore Kerala.
        </p>
        <fieldset className="avatar-choices">
          <legend>SELECT YOUR AVATAR</legend>
          {(["male", "female"] as const).map((g) => (
            <button
              type="button"
              key={g}
              className={`avatar-choice ${gender === g ? "active" : ""}`}
              onClick={() => onGender(g)}
              aria-pressed={gender === g}
            >
              <span className={`avatar-mini ${g}`}>
                <PersonStanding size={33} strokeWidth={1.3} />
              </span>
              <span>
                <strong>
                  {g === "male" ? "Male avatar" : "Female avatar"}
                </strong>
                <small>
                  {g === "male"
                    ? "Easygoing. Ready to explore."
                    : "Curious. Ready for the road."}
                </small>
              </span>
              <span className="radio-ring">
                {gender === g ? <Check size={12} /> : null}
              </span>
            </button>
          ))}
        </fieldset>
        <div className={`customization ${!gender ? "disabled-options" : ""}`}>
          <div className="subsection-label">
            <Shirt size={15} /> MAKE IT YOUR OWN
          </div>
          <div className="hair-row">
            <label htmlFor="outfit">Outfit</label>
            <select
              id="outfit"
              value={avatar.outfit ?? "casual"}
              disabled={!gender}
              onChange={(e) =>
                onChange({
                  ...avatar,
                  outfit: e.target.value as AvatarStyle["outfit"],
                })
              }
            >
              <option value="casual">Everyday · short sleeves</option>
              <option value="field">Explorer · rolled sleeves</option>
            </select>
          </div>
          <div className="hair-row">
            <label htmlFor="hair">Hairstyle</label>
            <select
              id="hair"
              value={avatar.hair}
              disabled={!gender}
              onChange={(e) =>
                onChange({
                  ...avatar,
                  hair: e.target.value as AvatarStyle["hair"],
                })
              }
            >
              <option value="short">Short & natural</option>
              <option value="curly">Textured curls</option>
              <option value="long">Long & flowing</option>
            </select>
          </div>
          {palettes.map(([key, label, colors]) => (
            <div className="swatch-row" key={key}>
              <span>{label}</span>
              <div role="group" aria-label={label}>
                {colors.map((color, i) => (
                  <button
                    disabled={!gender}
                    key={color}
                    className={`swatch ${avatar[key as keyof AvatarStyle] === color ? "active" : ""}`}
                    style={{ backgroundColor: color }}
                    aria-label={`${label} option ${i + 1}`}
                    aria-pressed={avatar[key as keyof AvatarStyle] === color}
                    onClick={() => onChange({ ...avatar, [key]: color })}
                  >
                    {avatar[key as keyof AvatarStyle] === color ? (
                      <Check
                        size={12}
                        color={
                          ["#e8dfc5", "#d1bd94", "#e3dbbf", "#d7a47d"].includes(
                            color,
                          )
                            ? "#375044"
                            : "#fff9eb"
                        }
                      />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          className="primary wide"
          disabled={!gender}
          onClick={onContinue}
        >
          Continue <ArrowRight size={18} />
        </button>
        {!gender ? (
          <p className="selection-note">Choose an avatar to continue.</p>
        ) : (
          <p className="selection-note">
            <Check size={12} /> Your character preferences are saved on this
            device.
          </p>
        )}
      </section>
      <section className="character-stage">
        <div className="stage-title">
          <span className="eyebrow">YOUR EXPLORER</span>
          <span className="pill">3D PREVIEW</span>
        </div>
        <ScenePreview
          avatar={gender ? avatar : null}
          animation={animation}
          rotation={rotation}
        />
        <div
          className="preview-controls"
          aria-label="Character preview controls"
        >
          <span>
            {gender
              ? `${gender === "male" ? "Male" : "Female"} explorer · ${gender === "male" ? "1.88" : "1.77"} m`
              : "Choose your explorer"}
          </span>
          <div role="group" aria-label="Preview animation">
            {(["idle", "walk", "run", "jump"] as const).map((motion) => (
              <button
                key={motion}
                disabled={!gender}
                aria-pressed={animation === motion}
                onClick={() => setAnimation(motion)}
              >
                {motion.charAt(0).toUpperCase() + motion.slice(1)}
              </button>
            ))}
          </div>
          <div className="preview-rotation">
            <button
              aria-label="Rotate character left"
              onClick={() => setRotation((v) => v - Math.PI / 4)}
            >
              <ArrowLeft size={14} />
            </button>
            <small>Drag to rotate · live 3D</small>
            <button
              aria-label="Rotate character right"
              onClick={() => setRotation((v) => v + Math.PI / 4)}
            >
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
        <div className="preview-annotation">
          <span className="fine-rule" />
          <RotateCw size={15} />
          <span>Ready for the journey ahead</span>
        </div>
        <div className="stage-bottom">
          <Footprints size={16} />
          <span>Walk. Wander. Find your Kerala.</span>
          <span>10.524° N, 76.214° E</span>
        </div>
        <div className="stage-ring ring-one" />
        <div className="stage-ring ring-two" />
      </section>
    </main>
  );
}
