import type {
  ChoiceControl,
  Control,
  ControlContribution,
  Observable,
  RangeControl,
  ToggleControl,
} from "@modular-av/api";
import { el, icon, uniqueId } from "@modular-av/kit";
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
      control.icon ? safeIcon(doc, control.icon) : null,
      ctx.text(control.label),
    ],
  });
}

/** Contributions name icons as "fa-solid fa-x" (checked when registered). */
function safeIcon(doc: Document, classes: string): HTMLElement {
  const name = classes.split(" ").find((c) => c !== "fa-solid") ?? "fa-circle";
  return icon(name, doc);
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

function choice(
  ctx: DockContext,
  doc: Document,
  control: ChoiceControl,
  alerts: HTMLElement | null,
): Rendered {
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
    undo = draw(element);
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
