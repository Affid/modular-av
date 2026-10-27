import type { ConnectionQuality } from "@modular-av/api";
import { el } from "@modular-av/kit";

/**
 * Three bars for a link's quality, filled by how good it is: shape and
 * words carry it, not colour alone (the text beside them names it).
 */
export function signalBars(
  doc: Document,
  quality: ConnectionQuality | null,
): HTMLElement {
  const bars = el("span", {
    doc,
    className: "mav-signal",
    attrs: { "aria-hidden": "true" },
    children: [el("i", { doc }), el("i", { doc }), el("i", { doc })],
  });
  setSignal(bars, quality);
  return bars;
}

export function setSignal(
  bars: HTMLElement,
  quality: ConnectionQuality | null,
): void {
  if (quality) bars.dataset.quality = quality;
  else delete bars.dataset.quality;
}
