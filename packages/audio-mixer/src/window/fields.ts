import { el, uniqueId } from "@modular-av/kit";
import type { Rendered } from "./context.ts";

export interface Slider {
  readonly element: HTMLElement;
  /** The value from outside; left alone while the player drags it. */
  show(value: number): void;
  lock(): void;
}

export interface SliderSpec {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly attrs?: Readonly<Record<string, string>>;
  format(value: number): string;
  write(value: number): void;
}

export function slider(doc: Document, spec: SliderSpec): Slider {
  const input = el("input", {
    doc,
    attrs: {
      type: "range",
      min: String(spec.min),
      max: String(spec.max),
      step: String(spec.step),
      "aria-label": spec.label,
      ...spec.attrs,
    },
  });
  const output = el("output", { doc });
  const element = el("div", {
    doc,
    className: "mav-mixer-slider",
    children: [el("span", { doc, text: spec.label }), input, output],
  });
  input.addEventListener("input", () => {
    const value = Number(input.value);
    output.textContent = spec.format(value);
    spec.write(value);
  });
  return {
    element,
    show(value) {
      if (doc.activeElement === input) return;
      input.value = String(value);
      output.textContent = spec.format(value);
    },
    lock() {
      input.disabled = true;
    },
  };
}

export const PERCENT = 100;

export const percentText = (percent: number): string =>
  `${String(Math.round(percent))}%`;

/** A level from 0 to 1, shown and dragged as a percentage. */
export function levelSlider(
  doc: Document,
  label: string,
  field: string,
  write: (level: number) => void,
): Slider {
  const inner = slider(doc, {
    label,
    min: 0,
    max: PERCENT,
    step: 1,
    attrs: { "data-field": field },
    format: percentText,
    write: (percent) => {
      write(percent / PERCENT);
    },
  });
  return {
    element: inner.element,
    show: (level) => {
      inner.show(Math.round(level * PERCENT));
    },
    lock: () => {
      inner.lock();
    },
  };
}

export function switchField(
  doc: Document,
  label: string,
  attrs: Readonly<Record<string, string>>,
  onChange: (on: boolean) => void,
): { element: HTMLElement; input: HTMLInputElement } {
  const id = uniqueId(doc, "mav-mixer-switch");
  const input = el("input", { doc, attrs: { id, type: "checkbox", ...attrs } });
  input.addEventListener("change", () => {
    onChange(input.checked);
  });
  return {
    input,
    element: el("div", {
      doc,
      className: "mav-mixer-switch",
      children: [input, el("label", { doc, text: label, attrs: { for: id } })],
    }),
  };
}

export const undrawn = (element: HTMLElement): Rendered => ({
  element,
  dispose: () => undefined,
});
