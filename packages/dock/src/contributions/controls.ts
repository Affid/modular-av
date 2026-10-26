import type {
  ChoiceControl,
  Control,
  ControlContribution,
  Observable,
  RangeControl,
  ToggleControl,
} from "@modular-av/api";
import { el, iconOf, uniqueId } from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import { run } from "../ui/run.ts";

/** Something drawn, with what undoes its subscriptions. */
export interface Rendered {
  readonly element: HTMLElement;
  dispose(): void;
}

/** The current value and each change, until disposed. */
function follow<T>(
  observable: Observable<T>,
  apply: (value: T) => void,
  onError: (error: unknown) => void,
): () => void {
  const safe = (value: T): void => {
    try {
      apply(value);
    } catch (error: unknown) {
      onError(error);
    }
  };
  safe(observable.get());
  return observable.subscribe(safe);
}

/** The label row of a control: its icon (if any) and text, as text. */
function labelOf(
  ctx: DockContext,
  doc: Document,
  control: Control,
  forId?: string,
): HTMLElement {
  return el(forId ? "label" : "span", {
    doc,
    className: "mav-control-label",
    attrs: forId ? { for: forId } : {},
    children: [
      control.icon ? iconOf(control.icon, doc) : null,
      ctx.text(control.label),
    ],
  });
}

function toggle(
  ctx: DockContext,
  doc: Document,
  control: ToggleControl,
  alerts: HTMLElement | null,
): Rendered {
  const button = el("button", {
    doc,
    className: "mav-control-switch",
    attrs: { type: "button", role: "switch", "aria-checked": "false" },
    children: [labelOf(ctx, doc, control)],
  });
  const nested = el("div", { doc, className: "mav-control-nested" });
  let on = false;
  let children: readonly Rendered[] = [];
  button.addEventListener("click", () => {
    run(ctx, alerts, () => control.set(!on));
  });
  const off = follow(
    control.state,
    (state) => {
      on = state.on;
      button.setAttribute("aria-checked", String(state.on));
      button.disabled = state.disabled === true;
      button.toggleAttribute("aria-busy", state.busy === true);
      nested.hidden = !state.on;
      if (state.on && children.length === 0 && control.controls)
        children = control.controls.map((c) =>
          renderControl(ctx, doc, c, alerts),
        );
      nested.replaceChildren(...children.map((c) => c.element));
    },
    ctx.onError,
  );
  const element = el("div", {
    doc,
    className: "mav-control",
    attrs: { "data-control": control.type },
    children: [button, nested],
  });
  return {
    element,
    dispose() {
      off();
      for (const c of children) c.dispose();
    },
  };
}

function range(
  ctx: DockContext,
  doc: Document,
  control: RangeControl,
  alerts: HTMLElement | null,
): Rendered {
  const id = uniqueId(doc, "mav-control");
  const unit = control.unit ? ctx.text(control.unit) : "";
  const input = el("input", {
    doc,
    attrs: {
      id,
      type: "range",
      min: String(control.min),
      max: String(control.max),
      step: String(control.step),
    },
  });
  const describe = (): void => {
    input.setAttribute("aria-valuetext", `${input.value}${unit}`);
  };
  input.addEventListener("input", describe);
  input.addEventListener("change", () => {
    run(ctx, alerts, () => control.set(Number(input.value)));
  });
  const off = follow(
    control.state,
    (value) => {
      input.value = String(value);
      describe();
    },
    ctx.onError,
  );
  const element = el("div", {
    doc,
    className: "mav-control",
    attrs: { "data-control": "range" },
    children: [labelOf(ctx, doc, control, id), input],
  });
  return { element, dispose: off };
}

const STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * A choice whose options have pictures: a radio group of thumbnails, named
 * by their labels; arrow keys move to the next and pick it (one tab stop).
 */
function pictureChoice(
  ctx: DockContext,
  doc: Document,
  control: ChoiceControl,
  alerts: HTMLElement | null,
): Rendered {
  const pick = (value: string): void => {
    run(ctx, alerts, () => control.set(value));
  };
  const radios = control.options.map((o) => {
    const label = ctx.text(o.label);
    const radio = el("button", {
      doc,
      className: "mav-control-picture",
      attrs: {
        type: "button",
        role: "radio",
        "aria-checked": "false",
        "aria-label": label,
        title: label,
        "data-value": o.value,
      },
      children: [
        o.image
          ? el("img", {
              doc,
              attrs: {
                src: o.image,
                alt: "",
                loading: "lazy",
                draggable: "false",
              },
            })
          : el("span", { doc, text: label }),
      ],
    });
    radio.addEventListener("click", () => {
      pick(o.value);
    });
    return radio;
  });
  const group = el("div", {
    doc,
    className: "mav-control-pictures",
    attrs: { role: "radiogroup", "aria-label": ctx.text(control.label) },
    children: radios,
  });
  group.addEventListener("keydown", (event) => {
    const step = STEPS[event.key];
    const at = radios.findIndex((r) => r === event.target);
    if (step === undefined || at < 0) return;
    event.preventDefault();
    const next = radios[(at + step + radios.length) % radios.length];
    next?.focus();
    const value = next?.dataset.value;
    if (value !== undefined) pick(value);
  });
  const off = follow(
    control.state,
    (value) => {
      const current = radios.some((r) => r.dataset.value === value);
      radios.forEach((r, i) => {
        const checked = r.dataset.value === value;
        r.setAttribute("aria-checked", String(checked));
        // One tab stop: the picked one, or the first if none is.
        r.tabIndex = checked || (!current && i === 0) ? 0 : -1;
      });
    },
    ctx.onError,
  );
  const element = el("div", {
    doc,
    className: "mav-control",
    attrs: { "data-control": "choice" },
    children: [labelOf(ctx, doc, control), group],
  });
  return { element, dispose: off };
}

function choice(
  ctx: DockContext,
  doc: Document,
  control: ChoiceControl,
  alerts: HTMLElement | null,
): Rendered {
  if (control.options.some((o) => o.image))
    return pictureChoice(ctx, doc, control, alerts);
  const id = uniqueId(doc, "mav-control");
  const select = el("select", {
    doc,
    attrs: { id },
    children: control.options.map((o) =>
      el("option", { doc, text: ctx.text(o.label), attrs: { value: o.value } }),
    ),
  });
  select.addEventListener("change", () => {
    run(ctx, alerts, () => control.set(select.value));
  });
  const off = follow(
    control.state,
    (value) => {
      select.value = value;
    },
    ctx.onError,
  );
  const element = el("div", {
    doc,
    className: "mav-control",
    attrs: { "data-control": "choice" },
    children: [labelOf(ctx, doc, control, id), select],
  });
  return { element, dispose: off };
}

/** One control of a contribution, in the dock's style. */
export function renderControl(
  ctx: DockContext,
  doc: Document,
  control: Control,
  alerts: HTMLElement | null,
): Rendered {
  if (control.type === "toggle") return toggle(ctx, doc, control, alerts);
  if (control.type === "range") return range(ctx, doc, control, alerts);
  if (control.type === "choice") return choice(ctx, doc, control, alerts);
  const button = el("button", {
    doc,
    className: "mav-control-button",
    attrs: { type: "button" },
    children: [labelOf(ctx, doc, control)],
  });
  button.addEventListener("click", () => {
    run(ctx, alerts, () => control.run());
  });
  const element = el("div", {
    doc,
    className: "mav-control",
    attrs: { "data-control": "button" },
    children: [button],
  });
  return { element, dispose: () => undefined };
}

/** A contribution's own drawing, for what a declaration can't express. */
function custom(
  ctx: DockContext,
  doc: Document,
  draw: (element: HTMLElement) => () => void,
): Rendered {
  const element = el("div", { doc, className: "mav-control-custom" });
  let undo: () => void = () => undefined;
  try {
    const result: unknown = draw(element);
    if (typeof result === "function") undo = result as () => void;
  } catch (error: unknown) {
    ctx.onError(error);
  }
  return { element, dispose: undo };
}

const byOrder = <T extends { readonly order?: number }>(a: T, b: T): number =>
  (a.order ?? 0) - (b.order ?? 0);

/** Every control contributed for `place`, in order. */
export function renderContributedControls(
  ctx: DockContext,
  doc: Document,
  place: ControlContribution["place"],
  alerts: HTMLElement | null,
): readonly Rendered[] {
  return ctx.api.contributions
    .list()
    .filter(
      (c): c is ControlContribution =>
        c.kind === "control" && c.place === place,
    )
    .sort(byOrder)
    .map((c) => {
      const rendered = c.render
        ? custom(ctx, doc, c.render)
        : renderControl(ctx, doc, c, alerts);
      rendered.element.dataset.contribution = c.id;
      return rendered;
    });
}

export { byOrder, follow };
