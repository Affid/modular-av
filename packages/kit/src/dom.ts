/**
 * DOM helpers. Elements are built from text and attributes only, never
 * from markup, which keeps UIs free of injection whatever a player's name
 * or a plugin's label holds.
 */

type Child = Node | string | null | undefined | false;

export interface ElementOptions {
  readonly className?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly children?: readonly Child[];
  /** Where to build it; the page's document if not given. */
  readonly doc?: Document;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const doc = options.doc ?? document;
  const element = doc.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {}))
    element.setAttribute(name, value);
  for (const child of options.children ?? []) if (child) element.append(child);
  return element;
}

/**
 * Gives an element its accessible name and Foundry's tooltip. Foundry
 * renders `data-tooltip` as HTML, so only a module's own localized text
 * goes there; anything else (a player's name, a plugin's label) goes in
 * `data-tooltip-text`, shown as text.
 */
export function setLabel(
  element: HTMLElement,
  label: string,
  options: { readonly trusted?: boolean } = {},
): void {
  element.setAttribute("aria-label", label);
  if (options.trusted ?? true) {
    element.dataset.tooltip = label;
    delete element.dataset.tooltipText;
  } else {
    element.dataset.tooltipText = label;
    delete element.dataset.tooltip;
  }
}

const FONT_AWESOME = /^fa-[a-z0-9-]+$/;

/** A Font Awesome icon, hidden from screen readers. */
export function icon(name: string, doc: Document = document): HTMLElement {
  if (!FONT_AWESOME.test(name))
    throw new Error(`"${name}" is not a Font Awesome icon name`);
  return el("i", {
    doc,
    className: `fa-solid fa-fw ${name}`,
    attrs: { "aria-hidden": "true" },
  });
}

/**
 * An id no element of `doc` has yet, e.g. to tie a label to its control.
 * Not `crypto.randomUUID()`: it exists only on secure pages, and Foundry
 * is often served over plain HTTP on a LAN.
 */
export function uniqueId(doc: Document, prefix: string): string {
  for (;;) {
    const id = `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
    if (!doc.getElementById(id)) return id;
  }
}

/** Font Awesome's style and width classes, not glyphs. */
const STYLES: ReadonlySet<string> = new Set([
  "fa-solid",
  "fa-regular",
  "fa-brands",
  "fa-light",
  "fa-thin",
  "fa-duotone",
  "fa-fw",
]);

/**
 * The icon named by a contribution's classes ("fa-solid fa-droplet"): its
 * glyph, drawn as the UI draws its own icons.
 */
export function iconOf(classes: string, doc: Document = document): HTMLElement {
  const glyph =
    classes
      .split(" ")
      .filter((c) => c !== "" && !STYLES.has(c))
      .at(-1) ?? "fa-circle";
  return icon(glyph, doc);
}

interface MovingParent {
  moveBefore(node: Node, child: Node | null): void;
}

/** Moves a node without restarting what plays in it, where the browser can. */
function moveBefore(parent: Element, node: Element, before: Node | null): void {
  if (
    typeof (parent as Partial<MovingParent>).moveBefore === "function" &&
    node.isConnected &&
    parent.isConnected
  ) {
    (parent as unknown as MovingParent).moveBefore(node, before);
    return;
  }
  const playing = Array.from(node.querySelectorAll("video, audio")).filter(
    (m) => !(m as HTMLMediaElement).paused,
  ) as HTMLMediaElement[];
  parent.insertBefore(node, before);
  for (const media of playing) media.play().catch(() => undefined);
}

/**
 * Makes `children` the children of `parent`, in that order, moving only
 * those out of place: a video moved keeps playing (`moveBefore` in Chrome,
 * else it is resumed).
 */
export function placeInOrder(
  parent: Element,
  children: readonly Element[],
): void {
  children.forEach((child, index) => {
    const at = parent.children[index] ?? null;
    if (at !== child) moveBefore(parent, child, at);
  });
  while (parent.children.length > children.length)
    parent.lastElementChild?.remove();
}
