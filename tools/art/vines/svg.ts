import { type Box, VIEW } from "./geometry.ts";

/** A picture's own size in CSS pixels, for one a stylesheet cuts into slices. */
export interface PictureSize {
  readonly width: number;
  readonly height: number;
}

/**
 * A picture that fills the frame layer, stretched with it: the layer round
 * a scattered tile, or with `box` whatever else it is drawn for. With
 * `size` it has a size of its own, which a `border-image` slices by.
 */
export function svgDocument(
  body: string,
  box?: Box,
  size?: PictureSize,
): string {
  const view = box
    ? `${box.left} ${box.top} ${box.right - box.left} ${box.bottom - box.top}`
    : `0 0 ${VIEW.width} ${VIEW.height}`;
  const own = size ? ` width="${size.width}" height="${size.height}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg"${own} viewBox="${view}" preserveAspectRatio="none">${body}</svg>\n`;
}

/** Every `id` a picture defines. */
export const idsOf = (svg: string): readonly string[] =>
  [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1] ?? "");

/** Every id a picture refers to, by `href` or `url(#…)`. */
export const linksOf = (svg: string): readonly string[] =>
  [...svg.matchAll(/(?:href="#|url\(#)([^")]+)/g)].map((m) => m[1] ?? "");

/** The points of every path with the given id prefix. */
export function pathPoints(
  svg: string,
  idPrefix: string,
): readonly (readonly [number, number])[] {
  const paths = [
    ...svg.matchAll(new RegExp(`<path id="${idPrefix}[^"]*" d="([^"]+)"`, "g")),
  ];
  return paths.flatMap((m) =>
    [...(m[1] ?? "").matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(
      (pair) => [Number(pair[1]), Number(pair[2])] as const,
    ),
  );
}

/** Whether every element a picture opens is closed, in order. */
export function isWellFormed(svg: string): boolean {
  const tags = [...svg.matchAll(/<(\/?)([A-Za-z][\w-]*)[^>]*?(\/?)>/g)];
  const open = tags.reduce<readonly string[] | null>((stack, tag) => {
    const [, closing, name = "", selfClosing] = tag;
    if (stack === null || selfClosing) return stack;
    if (!closing) return [...stack, name];
    return stack.at(-1) === name ? stack.slice(0, -1) : null;
  }, []);
  return tags.length > 0 && open?.length === 0;
}
