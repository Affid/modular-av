import type {
  ChoiceControl,
  Control,
  ControlContribution,
  Observable,
  RangeControl,
  ToggleControl,
} from "@modular-av/api";
import { el } from "@modular-av/kit";
import type { Writer } from "../model/queue.ts";
import type { MixerContext, Rendered } from "./context.ts";
import { slider, switchField } from "./fields.ts";

/** A value that can be saved and set back: buttons have none. */
export type SettingControl = ControlContribution &
  (RangeControl | ToggleControl | ChoiceControl);

export function settingsOf(
  ctx: Pick<MixerContext, "api">,
  effect: string,
): readonly SettingControl[] {
  return ctx.api.contributions
    .list()
    .filter(
      (c): c is SettingControl =>
        c.kind === "control" && c.effect === effect && c.type !== "button",
    );
}

const follow = <T>(
  state: Observable<T>,
  show: (value: T) => void,
): (() => void) => {
  show(state.get());
  return state.subscribe(show);
};

function range(
  ctx: MixerContext,
  doc: Document,
  control: RangeControl,
  writes: Writer,
): Rendered {
  const unit = control.unit ? ` ${ctx.text(control.unit)}` : "";
  const field = slider(doc, {
    label: ctx.text(control.label),
    min: control.min,
    max: control.max,
    step: control.step,
    format: (value) => `${String(value)}${unit}`,
    write: (value) => {
      void writes.run(`control:${control.id}`, () => control.set(value));
    },
  });
  return {
    element: field.element,
    dispose: follow(control.state, (value) => {
      field.show(value);
    }),
  };
}

function toggle(
  ctx: MixerContext,
  doc: Document,
  control: ToggleControl,
  writes: Writer,
): Rendered {
  const field = switchField(doc, ctx.text(control.label), {}, (on) => {
    void writes.run(`control:${control.id}`, () => control.set(on));
  });
  return {
    element: field.element,
    dispose: follow(control.state, ({ on, disabled }) => {
      field.input.checked = on;
      field.input.disabled = disabled === true;
    }),
  };
}

function choice(
  ctx: MixerContext,
  doc: Document,
  control: ChoiceControl,
  writes: Writer,
): Rendered {
  const label = ctx.text(control.label);
  const select = el("select", {
    doc,
    attrs: { "aria-label": label },
    children: control.options.map((option) =>
      el("option", {
        doc,
        text: ctx.text(option.label),
        attrs: { value: option.value },
      }),
    ),
  });
  select.addEventListener("change", () => {
    void writes.run(`control:${control.id}`, () => control.set(select.value));
  });
  return {
    element: el("div", {
      doc,
      className: "mav-mixer-choice",
      children: [el("span", { doc, text: label }), select],
    }),
    dispose: follow(control.state, (value) => {
      select.value = value;
    }),
  };
}

const DRAW = {
  range,
  toggle,
  choice,
} as const;

/** An effect's own setting, drawn without knowing the effect. */
export function renderSetting(
  ctx: MixerContext,
  doc: Document,
  control: Exclude<Control, { type: "button" }>,
  writes: Writer,
): Rendered {
  const draw = DRAW[control.type] as (
    ctx: MixerContext,
    doc: Document,
    control: Control,
    writes: Writer,
  ) => Rendered;
  const drawn = draw(ctx, doc, control, writes);
  drawn.element.dataset.control = control.id;
  return drawn;
}
