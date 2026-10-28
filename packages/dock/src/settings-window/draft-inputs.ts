import { el } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { Draft } from "./draft.ts";
import type { DraftKey, DraftValues } from "./draft-fields.ts";
import type { Option } from "./fields.ts";

type KeysOf<T> = {
  [K in DraftKey]: DraftValues[K] extends T ? K : never;
}[DraftKey];

/** A select bound to a drafted field; its options may change. */
export function draftSelect(
  doc: Document,
  draft: Draft,
  key: KeysOf<string>,
  options: () => readonly Option[],
): Rendered {
  const select = el("select", { doc, attrs: { "data-field": key } });
  const render = (): void => {
    const list = options();
    const value = draft.get(key);
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
    draft.set(key, select.value);
  });
  render();
  return { element: select, dispose: draft.subscribe(render) };
}

/** A switch (`role="switch"`) bound to a drafted field. */
export function draftSwitch(
  doc: Document,
  draft: Draft,
  key: KeysOf<boolean>,
  label: string,
): Rendered {
  const button = el("button", {
    doc,
    className: "mav-control-switch",
    text: label,
    attrs: { type: "button", role: "switch", "data-field": key },
  });
  const render = (): void => {
    button.setAttribute("aria-checked", String(draft.get(key)));
  };
  button.addEventListener("click", () => {
    draft.set(key, !draft.get(key));
  });
  render();
  return { element: button, dispose: draft.subscribe(render) };
}

/** Choices from a Foundry setting's registration, labels as text. */
export const settingChoices = (
  choices: Readonly<Record<string, string>> | undefined,
  text: (label: string) => string,
): readonly Option[] =>
  Object.entries(choices ?? {}).map(([value, label]) => ({
    value,
    label: text(label),
  }));
