/**
 * What a Picture-in-Picture window needs to look and behave like the page:
 * its styles kept in step, native tooltips (Foundry's only work in its own
 * window) and the push to talk key forwarded to Foundry. A lazy chunk,
 * loaded with the first window.
 */

const PIP_BODY_CLASS = "modular-av-pip";

/** A style sheet's rules, or null when it can't be read (cross-origin). */
function rulesOf(sheet: CSSStyleSheet | null): string | null {
  if (!sheet) return null;
  try {
    return Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
  } catch {
    return null;
  }
}

const isLink = (node: Element): node is HTMLLinkElement =>
  node.tagName === "LINK";

/** Mirrors `source`'s style sheets into `target`, one copy per source node. */
function createStyleMirror(source: Document, target: Document): () => void {
  let copies = new Map<Element, Element>();
  const adopted = target.createElement("style");
  const base = target.createElement("base");
  base.href = source.baseURI;
  target.head.append(base, adopted);

  const copyOf = (node: Element): Element => {
    if (isLink(node)) {
      const link = target.createElement("link");
      link.rel = "stylesheet";
      link.href = node.href;
      if (node.media) link.media = node.media;
      return link;
    }
    return target.createElement("style");
  };

  const sync = (): void => {
    const nodes = Array.from(
      source.querySelectorAll('link[rel~="stylesheet"], style'),
    );
    const next = new Map<Element, Element>();
    for (const node of nodes) {
      const copy = copies.get(node) ?? copyOf(node);
      if (!isLink(node)) {
        const text =
          rulesOf((node as HTMLStyleElement).sheet) ?? node.textContent;
        if (copy.textContent !== text) copy.textContent = text;
      }
      if (!copy.isConnected) target.head.append(copy);
      next.set(node, copy);
    }
    for (const [node, copy] of copies) if (!next.has(node)) copy.remove();
    copies = next;
    const sheets = Array.from(source.adoptedStyleSheets, rulesOf);
    adopted.textContent = sheets.filter((t) => t !== null).join("\n");
    target.documentElement.className = source.documentElement.className;
    const rootStyle = source.documentElement.getAttribute("style");
    if (rootStyle) target.documentElement.setAttribute("style", rootStyle);
    else target.documentElement.removeAttribute("style");
    target.body.className = `${source.body.className} ${PIP_BODY_CLASS}`.trim();
  };

  let scheduled = false;
  const later = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      sync();
    });
  };
  const Observer = source.defaultView?.MutationObserver ?? MutationObserver;
  const observer = new Observer(later);
  observer.observe(source.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  for (const node of [source.documentElement, source.body])
    observer.observe(node, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
  sync();
  return () => {
    observer.disconnect();
  };
}

/** Foundry's `data-tooltip` may hold markup: its text, parsed inertly. */
function tooltipText(element: HTMLElement): string | null {
  const plain = element.dataset.tooltipText;
  if (plain) return plain;
  const html = element.dataset.tooltip;
  if (!html) return null;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return parsed.body.textContent.trim() || null;
}

/** Native tooltips: a title from the nearest Foundry tooltip attribute. */
function useNativeTooltips(target: Document): () => void {
  /** Each element titled here, with the title it had before. */
  let titled = new Map<HTMLElement, string | null>();
  const onOver = (event: Event): void => {
    // Elements here may come from either window: no instanceof checks.
    const from = event.target as Partial<Element> | null;
    const element =
      typeof from?.closest === "function"
        ? from.closest<HTMLElement>("[data-tooltip], [data-tooltip-text]")
        : null;
    const text = element ? tooltipText(element) : null;
    if (!element || !text || element.title === text) return;
    if (!titled.has(element))
      titled = new Map(titled).set(element, element.getAttribute("title"));
    element.title = text;
  };
  target.addEventListener("pointerover", onOver);
  return () => {
    target.removeEventListener("pointerover", onOver);
    for (const [element, before] of titled)
      if (before === null) element.removeAttribute("title");
      else element.title = before;
  };
}

const isEditable = (target: EventTarget | null): boolean => {
  const element = target as Partial<HTMLElement> | null;
  return (
    element?.isContentEditable === true ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(element?.tagName ?? "")
  );
};

/** Foundry listens for keys in its own window: forward push to talk there. */
function forwardKeys(
  win: Window,
  source: Document,
  keys: () => readonly string[],
): () => void {
  const forward = (event: KeyboardEvent): void => {
    // Typing in a field is typing, not talking: Foundry ignores it too.
    if (isEditable(event.target)) return;
    if (!keys().includes(event.code)) return;
    const KeyEvent = source.defaultView?.KeyboardEvent ?? KeyboardEvent;
    source.body.dispatchEvent(
      new KeyEvent(event.type, {
        key: event.key,
        code: event.code,
        location: event.location,
        repeat: event.repeat,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        bubbles: true,
        cancelable: true,
      }),
    );
    event.preventDefault();
  };
  for (const type of ["keydown", "keyup"] as const)
    win.addEventListener(type, forward);
  return () => {
    for (const type of ["keydown", "keyup"] as const)
      win.removeEventListener(type, forward);
  };
}

/**
 * Prepares a new window; returns its undo. `pushToTalkKeys` lists the key
 * codes bound to Foundry's push to talk, read on each key.
 */
export function preparePipWindow(
  win: Window,
  source: Document,
  pushToTalkKeys: () => readonly string[],
): () => void {
  const undo = [
    createStyleMirror(source, win.document),
    useNativeTooltips(win.document),
    forwardKeys(win, source, pushToTalkKeys),
  ];
  return () => {
    for (const step of undo) step();
  };
}
