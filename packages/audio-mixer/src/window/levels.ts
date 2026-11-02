import type { AudioPlace } from "@modular-av/api";
import { el, uniqueId } from "@modular-av/kit";
import { PLACES } from "../model/rack.ts";
import { nameOf } from "./card.ts";
import { type ChainData, type ChainLocal, heldEntry } from "./chain-data.ts";
import type { MixerContext } from "./context.ts";
import { PERCENT, percentText } from "./fields.ts";

export interface LevelsHandlers {
  mix(effect: string, level: number): void;
  channel(level: number): void;
  cutTails(on: boolean): void;
  select(key: string): void;
}

export interface Levels {
  readonly element: HTMLElement;
  update(local: ChainLocal): void;
}

interface Strip {
  readonly element: HTMLElement;
  show(value: number): void;
}

/** One vertical fader, 0 to 100%. */
function strip(
  doc: Document,
  spec: {
    readonly key: string;
    readonly name: string;
    readonly label: string;
    readonly field: string;
    readonly locked: boolean;
    readonly off: boolean;
    write(level: number): void;
  },
): Strip {
  const input = el("input", {
    doc,
    attrs: {
      type: "range",
      min: "0",
      max: String(PERCENT),
      step: "1",
      "aria-label": spec.label,
      "data-field": spec.field,
    },
  });
  input.disabled = spec.locked;
  const track = el("span", {
    doc,
    className: "mav-mixer-fader",
    children: [input],
  });
  const output = el("output", { doc });
  const fill = (percent: number): void => {
    track.style.setProperty("--mav-mixer-fill", `${String(percent)}%`);
  };
  input.addEventListener("input", () => {
    output.textContent = percentText(Number(input.value));
    fill(Number(input.value));
    spec.write(Number(input.value) / PERCENT);
  });
  return {
    element: el("div", {
      doc,
      className: "mav-mixer-strip",
      attrs: {
        "data-fader": spec.key,
        ...(spec.off ? { "data-off": "" } : {}),
        ...(spec.locked ? { "data-held": "" } : {}),
      },
      children: [
        el("span", {
          doc,
          className: "mav-mixer-strip-name",
          text: spec.name,
          attrs: { title: spec.name },
        }),
        track,
        output,
      ],
    }),
    show(value) {
      const percent = Math.round(value * PERCENT);
      output.textContent = percentText(percent);
      if (doc.activeElement === input) return;
      input.value = String(percent);
      fill(percent);
    },
  };
}

function group(
  doc: Document,
  heading: string,
  strips: readonly HTMLElement[],
  className = "mav-mixer-faders",
): HTMLElement {
  const id = uniqueId(doc, "mav-mixer-faders");
  return el("div", {
    doc,
    className,
    attrs: { role: "group", "aria-labelledby": id },
    children: [
      el("span", {
        doc,
        className: "mav-mixer-faders-name",
        text: heading,
        attrs: { id },
      }),
      el("div", { doc, className: "mav-mixer-strips", children: [...strips] }),
    ],
  });
}

/** Every level of the chain in one place, in its order, Channel last. */
export function renderLevels(
  ctx: MixerContext,
  doc: Document,
  data: ChainData,
  handlers: LevelsHandlers | null,
): Levels {
  const shown = new Map<string, Strip>();
  const groups = PLACES.flatMap((place: AudioPlace) => {
    const here = data.faders.filter((fader) => fader.place === place);
    if (!here.length) return [];
    const strips = here.map((fader) => {
      const slot = data.racks
        .flatMap((r) => r.slots)
        .find((s) => s.key === fader.key);
      const name = slot ? nameOf(ctx, slot) : fader.effect.id;
      const made = strip(doc, {
        key: fader.key,
        name,
        label: ctx.t(place === "send" ? "returnOf" : "wetOf", { effect: name }),
        field: `mix.${fader.effect.id}`,
        locked:
          !handlers ||
          (slot ? heldEntry(data, slot)?.mix !== undefined : false),
        off: !data.local.chosenEffects.includes(fader.effect.id),
        write: (level) => {
          handlers?.mix(fader.effect.id, level);
        },
      });
      shown.set(fader.key, made);
      return made.element;
    });
    return [group(doc, ctx.t(`faders.${place}`), strips)];
  });
  const channel = strip(doc, {
    key: "channel",
    name: ctx.t("channel"),
    label: ctx.t("channel"),
    field: "channel",
    locked: !handlers || data.held?.channelLevel !== undefined,
    off: false,
    write: (level) => {
      handlers?.channel(level);
    },
  });
  const cut = el("button", {
    doc,
    className: "mav-mixer-toggle",
    text: ctx.t("cutTailsShort"),
    attrs: {
      type: "button",
      title: ctx.t("cutTails"),
      "data-field": "cutTails",
      "aria-pressed": String(data.local.audioCutTails),
    },
  });
  cut.disabled = !handlers;
  cut.addEventListener("click", () => {
    handlers?.cutTails(cut.getAttribute("aria-pressed") !== "true");
  });
  const element = el("section", {
    doc,
    className: "mav-mixer-levels",
    attrs: { "data-panel": "levels", "aria-label": ctx.t("levels") },
    children: [
      el("header", {
        doc,
        className: "mav-mixer-levels-head",
        children: [el("h3", { doc, text: ctx.t("levels") }), cut],
      }),
      el("div", {
        doc,
        className: "mav-mixer-mix",
        children: [
          el("div", { doc, className: "mav-mixer-scroll", children: groups }),
          group(
            doc,
            ctx.t("faders.channel"),
            [channel.element],
            "mav-mixer-faders mav-mixer-master",
          ),
        ],
      }),
    ],
  });
  element.addEventListener("focusin", (event) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-fader]",
    )?.dataset.fader;
    if (key && key !== "channel") handlers?.select(key);
  });
  const update = (local: ChainLocal): void => {
    for (const [key, made] of shown) {
      const fader = data.faders.find((f) => f.key === key);
      if (!fader) continue;
      const value = local.audioEffectMix[fader.effect.id];
      if (value !== undefined) made.show(value);
      made.element.toggleAttribute(
        "data-off",
        !local.chosenEffects.includes(fader.effect.id),
      );
    }
    channel.show(local.audioChannelLevel);
    cut.setAttribute("aria-pressed", String(local.audioCutTails));
  };
  update(data.local);
  return { element, update };
}
