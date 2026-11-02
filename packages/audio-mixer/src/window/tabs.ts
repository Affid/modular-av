import { el } from "@modular-av/kit";
import type { Table } from "../table/table.ts";
import type { MixerContext, MixerTab, MixerView, Rendered } from "./context.ts";
import { renderTableView } from "./table-view.ts";

const TABS: readonly MixerTab[] = ["mine", "table"];

/** A GM's window: their own channel, and the table's, drawn only while shown. */
export function withTable(
  ctx: MixerContext,
  doc: Document,
  table: Table,
  mine: Rendered,
): MixerView {
  const buttons = new Map(
    TABS.map((tab) => [
      tab,
      el("button", {
        doc,
        text: ctx.t(`tabs.${tab}`),
        attrs: { type: "button", role: "tab", "data-tab": tab },
      }),
    ]),
  );
  const panel = el("div", { doc, attrs: { role: "tabpanel" } });
  let tableView: Rendered | null = null;
  let closed = false;

  /**
   * The own channel is hidden, never taken out: its gate meter stops for good
   * once it leaves the page, and only pauses while hidden.
   */
  const show = (tab: MixerTab): void => {
    if (closed) return;
    tableView?.dispose();
    tableView = tab === "table" ? renderTableView(ctx, doc, table) : null;
    mine.element.hidden = tableView !== null;
    panel.replaceChildren(
      ...[mine.element, tableView?.element].filter((e) => e !== undefined),
    );
    for (const [name, button] of buttons)
      button.setAttribute("aria-selected", String(name === tab));
  };
  for (const [tab, button] of buttons)
    button.addEventListener("click", () => {
      show(tab);
    });
  show("mine");
  return {
    show,
    element: el("div", {
      doc,
      children: [
        el("div", {
          doc,
          className: "mav-mixer-tabs",
          attrs: { role: "tablist", "aria-label": ctx.t("tabs.label") },
          children: [...buttons.values()],
        }),
        panel,
      ],
    }),
    dispose() {
      closed = true;
      tableView?.dispose();
      mine.dispose();
    },
  };
}
