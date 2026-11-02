import type {
  ChoiceControl,
  Control,
  Observable,
  RangeControl,
  ToggleControl,
} from "@modular-av/api";
import { el } from "@modular-av/kit";
import type { Writer } from "../model/queue.ts";
import type { MixerContext, Rendered } from "./context.ts";
import { slider, switchField } from "./fields.ts";

const follow = <T>(
  state: Observable<T>,
  show: (value: T) => void,
): (() => void) => {
  show(state.get());
  return state.subscribe(show);
};

/** A range's value as its slider shows it, with its unit. */
export const rangeText = (
  ctx: Pick<MixerContext, "text">,
  control: Pick<RangeControl, "unit">,
  value: number,
): string =>
  control.unit ? `${String(value)} ${ctx.text(control.unit)}` : String(value);

function range(
  ctx: MixerContext,
  doc: Document,
  control: RangeControl,
  writes: Writer,
): Rendered {
  const field = slider(doc, {
    label: ctx.text(control.label),
    min: control.min,
    max: control.max,
    step: control.step,
    format: (value) => rangeText(ctx, control, value),
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
