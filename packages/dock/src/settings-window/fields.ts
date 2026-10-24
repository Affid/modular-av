import { el, uniqueId } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { run } from "../ui/run.ts";

/** A section of the settings window, with a heading. */
export function section(
  doc: Document,
  title: string,
  children: readonly HTMLElement[],
): HTMLElement {
  return el("section", {
    doc,
    className: "mav-settings-section",
    children: [el("h2", { doc, text: title }), ...children],
  });
}

/** A labelled row: the label is tied to its control for screen readers. */
export function row(
  doc: Document,
  label: string,
  control: HTMLElement,
  hint?: string,
): HTMLElement {
  const id = control.id || uniqueId(doc, "mav-field");
  control.id = id;
  return el("div", {
    doc,
    className: "mav-settings-row",
    children: [
      el("label", { doc, text: label, attrs: { for: id } }),
      control,
      hint
        ? el("p", { doc, className: "mav-settings-hint", text: hint })
        : null,
    ],
  });
}

export interface Option {
  readonly value: string;
  readonly label: string;
}

/** A select whose options and value follow `read`, set through `write`. */
export function selectField(
  ctx: DockContext,
  doc: Document,
  options: {
    readonly read: () => {
      readonly options: readonly Option[];
      readonly value: string;
    };
    readonly write: (value: string) => Promise<void>;
    readonly subscribe: (render: () => void) => () => void;
  },
  alerts: HTMLElement,
): Rendered {
  const select = el("select", { doc });
  const render = (): void => {
    const { options: list, value } = options.read();
    const same =
      list.length === select.options.length &&
      list.every((o, i) => select.options[i]?.value === o.value);
    if (!same)
      select.replaceChildren(
        ...list.map((o) =>
          el("option", { doc, text: o.label, attrs: { value: o.value } }),
        ),
      );
    select.value = value;
  };
  select.addEventListener("change", () => {
    run(ctx, alerts, () => options.write(select.value));
  });
  render();
  return { element: select, dispose: options.subscribe(render) };
}

/** A switch (`role="switch"`) that follows `read`. */
export function switchField(
  ctx: DockContext,
  doc: Document,
  options: {
    readonly label: string;
    readonly read: () => boolean;
    readonly write: (on: boolean) => Promise<void>;
    readonly subscribe: (render: () => void) => () => void;
  },
  alerts: HTMLElement,
): Rendered {
  const button = el("button", {
    doc,
    className: "mav-control-switch",
    text: options.label,
    attrs: { type: "button", role: "switch" },
  });
  const render = (): void => {
    button.setAttribute("aria-checked", String(options.read()));
  };
  button.addEventListener("click", () => {
    run(ctx, alerts, () => options.write(!options.read()));
  });
  render();
  return { element: button, dispose: options.subscribe(render) };
}
