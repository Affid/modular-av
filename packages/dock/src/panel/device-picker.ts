import type { AVState, DeviceKind } from "@modular-av/api";
import { el, uniqueId } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { deviceOptions } from "../settings-window/devices.ts";
import { selectField } from "../settings-window/fields.ts";

const LABELS: Readonly<Record<DeviceKind, string>> = {
  audioInput: "settings.microphone",
  videoInput: "settings.camera",
  audioOutput: "settings.speakers",
};

type Slice = readonly [AVState["devices"][DeviceKind], string];

const sameSlice = (a: Slice, b: Slice): boolean =>
  a[0] === b[0] && a[1] === b[1];

/** A device kind's labelled select: a choice switches the call's device at once. */
export function devicePicker(
  ctx: DockContext,
  doc: Document,
  kind: DeviceKind,
  alerts: HTMLElement,
): Rendered {
  const chosen = (): string => ctx.api.state.get().local.chosenDevices[kind];
  const field = selectField(
    ctx,
    doc,
    {
      read: () => ({
        options: deviceOptions(ctx, kind, chosen()),
        value: chosen(),
      }),
      write: (value) => ctx.api.commands.setDevice(kind, value),
      subscribe: (render) =>
        ctx.api.state.subscribe(
          (s): Slice => [s.devices[kind], s.local.chosenDevices[kind]],
          render,
          { equals: sameSlice },
        ),
    },
    alerts,
  );
  const id = uniqueId(doc, "mav-control");
  field.element.id = id;
  const element = el("div", {
    doc,
    className: "mav-control",
    attrs: { "data-control": "device" },
    children: [
      el("label", {
        doc,
        className: "mav-control-label",
        text: ctx.t(LABELS[kind]),
        attrs: { for: id },
      }),
      field.element,
    ],
  });
  return {
    element,
    dispose() {
      field.dispose();
    },
  };
}

/** Devices in a grid of their own: labels in one column, selects in the other. */
export function deviceGroup(
  ctx: DockContext,
  doc: Document,
  kinds: readonly DeviceKind[],
  alerts: HTMLElement,
): Rendered {
  const pickers = kinds.map((kind) => devicePicker(ctx, doc, kind, alerts));
  return {
    element: el("div", {
      doc,
      className: "mav-dock-quick-devices",
      attrs: { role: "group", "aria-label": ctx.t("settings.devices") },
      children: pickers.map((p) => p.element),
    }),
    dispose() {
      for (const picker of pickers) picker.dispose();
    },
  };
}
