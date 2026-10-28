import { el, uniqueId } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";

export interface TabSpec {
  readonly id: string;
  readonly label: string;
  /** Drawn when the tab is shown, disposed when another is. */
  render(): readonly Rendered[];
}

export interface Tabs {
  readonly element: HTMLElement;
  /** Marks the tabs with unsaved changes. */
  mark(unsaved: (id: string) => boolean): void;
  dispose(): void;
}

const tabButton = (doc: Document, spec: TabSpec, panelId: string) =>
  el("button", {
    doc,
    className: "mav-settings-tab",
    text: spec.label,
    attrs: {
      type: "button",
      role: "tab",
      id: uniqueId(doc, `mav-tab-${spec.id}`),
      "aria-controls": panelId,
      "data-tab": spec.id,
    },
  });

/** The tab a key moves to from `index`, round the ends; none for other keys. */
function keyTarget(key: string, index: number, count: number): number | null {
  const last = count - 1;
  const to: Readonly<Record<string, number>> = {
    ArrowDown: index === last ? 0 : index + 1,
    ArrowUp: index === 0 ? last : index - 1,
    Home: 0,
    End: last,
  };
  return to[key] ?? null;
}

const tabPanel = (doc: Document, id: string): HTMLElement =>
  el("div", {
    doc,
    className: "mav-settings-panel",
    attrs: { id, role: "tabpanel", tabindex: "-1" },
  });

const tabList = (
  doc: Document,
  buttons: readonly HTMLElement[],
  label: string,
): HTMLElement =>
  el("div", {
    doc,
    className: "mav-settings-tabs",
    attrs: {
      role: "tablist",
      "aria-label": label,
      "aria-orientation": "vertical",
    },
    children: buttons,
  });

/**
 * Tabs down the side, as Foundry's own settings: one panel at a time, so
 * a tab's previews run only while it is shown. Arrow keys move between
 * them; Home and End go to the ends.
 */
export function createTabs(
  doc: Document,
  specs: readonly TabSpec[],
  label: string,
): Tabs {
  const panelId = uniqueId(doc, "mav-settings-panel");
  const panel = tabPanel(doc, panelId);
  let shown: readonly Rendered[] = [];
  const buttons = specs.map((spec) => tabButton(doc, spec, panelId));
  const show = (index: number): void => {
    const spec = specs[index];
    if (!spec) return;
    for (const part of shown) part.dispose();
    buttons.forEach((b, i) => {
      b.setAttribute("aria-selected", String(i === index));
      b.tabIndex = i === index ? 0 : -1;
    });
    panel.setAttribute("aria-labelledby", buttons[index]?.id ?? "");
    shown = spec.render();
    panel.replaceChildren(...shown.map((p) => p.element));
  };
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      show(index);
    });
    button.addEventListener("keydown", (event) => {
      const to = keyTarget(event.key, index, buttons.length);
      if (to === null) return;
      event.preventDefault();
      show(to);
      buttons[to]?.focus();
    });
  });
  show(0);
  return {
    element: el("div", {
      doc,
      className: "mav-settings-tabbed",
      children: [tabList(doc, buttons, label), panel],
    }),
    mark(unsaved) {
      buttons.forEach((b, i) => {
        b.toggleAttribute("data-unsaved", unsaved(specs[i]?.id ?? ""));
      });
    },
    dispose() {
      for (const part of shown) part.dispose();
    },
  };
}
