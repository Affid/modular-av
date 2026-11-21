// What makes a button a cut stone: its facets' light and shade, laid over
// the button's own colour by the stylesheet. A whole stone, and the two
// parts of one that a button shares with the menu arrow beside it.
import type { Box } from "../vines/geometry.ts";
import { svgDocument } from "../vines/svg.ts";

export type ButtonPart = "whole" | "left" | "right";

/** A button's picture is stretched to it: 100 units a side. */
const SIDE = 100;
const BOX: Box = { left: 0, top: 0, right: SIDE, bottom: SIDE };
/** Where the facets end and the flat top begins, from each side. */
const NEAR = 22;
const FAR = SIDE - NEAR;

const SHEEN = `<linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>`;

/** The flat top's sides: where a part meets the other, it runs to the picture's edge. */
function top(part: ButtonPart): { readonly from: number; readonly to: number } {
  return {
    from: part === "right" ? 0 : NEAR,
    to: part === "left" ? SIDE : FAR,
  };
}

export function drawButton(part: ButtonPart): string {
  const { from, to } = top(part);
  const [hasLeft, hasRight] = [part !== "right", part !== "left"];
  // Lit from the upper left: the upper and left facets light, the others in shade.
  const upper = `<path d="M0 0H${SIDE}L${to} ${NEAR}H${from}Z" fill="#fff" fill-opacity=".4"/>`;
  const lower = `<path d="M0 ${SIDE}L${from} ${FAR}H${to}L${SIDE} ${SIDE}Z" fill="#000" fill-opacity=".4"/>`;
  const leftFacet = hasLeft
    ? `<path d="M0 0L${NEAR} ${NEAR}V${FAR}L0 ${SIDE}Z" fill="#fff" fill-opacity=".2"/>`
    : "";
  const rightFacet = hasRight
    ? `<path d="M${SIDE} 0V${SIDE}L${FAR} ${FAR}V${NEAR}Z" fill="#000" fill-opacity=".24"/>`
    : "";
  const table = `<rect x="${from}" y="${NEAR}" width="${to - from}" height="${FAR - NEAR}" fill="url(#t)" fill-opacity=".1"/>`;
  const ridges =
    `M${from} ${NEAR}H${to}M${from} ${FAR}H${to}` +
    (hasLeft
      ? `M${NEAR} ${NEAR}V${FAR}M0 0L${NEAR} ${NEAR}M0 ${SIDE}L${NEAR} ${FAR}`
      : "") +
    (hasRight
      ? `M${FAR} ${NEAR}V${FAR}M${SIDE} 0L${FAR} ${NEAR}M${SIDE} ${SIDE}L${FAR} ${FAR}`
      : "");
  const edges = `<path d="${ridges}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.4"/>`;
  // Where a button's part meets its arrow's: a line cut in the stone.
  const cut =
    part === "right"
      ? `<g id="cut" fill="none"><path d="M1.5 ${NEAR + 2}V${FAR - 2}" stroke="#000" stroke-opacity=".55" stroke-width="3"/><path d="M5.5 ${NEAR + 2}V${FAR - 2}" stroke="#fff" stroke-opacity=".35" stroke-width="2.4"/></g>`
      : "";
  const glint = hasLeft
    ? `<path d="M6 5H${part === "left" ? 60 : 50}" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="3" stroke-linecap="round"/>`
    : "";
  return svgDocument(
    `<defs>${SHEEN}</defs>${upper}${lower}${leftFacet}${rightFacet}${table}${edges}${cut}${glint}`,
    BOX,
  );
}
