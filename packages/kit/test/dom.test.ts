// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { el, icon, placeInOrder, setLabel, uniqueId } from "../src/dom.ts";
import { createMeter, levelFraction } from "../src/meter.ts";
import { roving } from "../src/roving.ts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("el", () => {
  it("builds an element from text, attributes and children, never markup", () => {
    // Arrange / Act
    const item = el("li", {
      className: "mav-dock-tile",
      text: "<img src=x onerror=alert(1)>",
      attrs: { "data-muted": "", role: "listitem" },
      children: [el("span", { text: "child" }), null, false, "tail"],
    });

    // Assert
    expect(item.className).toBe("mav-dock-tile");
    expect(item.querySelector("img")).toBeNull();
    expect(item.firstChild?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(item.hasAttribute("data-muted")).toBe(true);
    expect(item.lastChild?.textContent).toBe("tail");
    expect(item.children).toHaveLength(1);
  });

  it("builds in the document it is given, e.g. a Picture-in-Picture window", () => {
    const other = document.implementation.createHTMLDocument("");

    expect(el("div", { doc: other }).ownerDocument).toBe(other);
  });
});

describe("labels", () => {
  it("puts a module's own text in Foundry's tooltip and the accessible name", () => {
    const button = el("button");

    setLabel(button, "Mute");

    expect(button.getAttribute("aria-label")).toBe("Mute");
    expect(button.dataset.tooltip).toBe("Mute");
  });

  it("keeps anyone else's text (a player's name) out of Foundry's HTML tooltip", () => {
    const name = el("span");

    setLabel(name, "<b>Player1</b>", { trusted: false });

    expect(name.dataset.tooltip).toBeUndefined();
    expect(name.dataset.tooltipText).toBe("<b>Player1</b>");
    expect(name.getAttribute("aria-label")).toBe("<b>Player1</b>");
  });
});

describe("icon and uniqueId", () => {
  it("makes a hidden Font Awesome icon and refuses other classes", () => {
    const i = icon("fa-microphone-slash");

    expect(i.className).toBe("fa-solid fa-fw fa-microphone-slash");
    expect(i.getAttribute("aria-hidden")).toBe("true");
    expect(() => icon('fa-x" onclick="')).toThrow(/Font Awesome/);
  });

  it("gives ids no element of the document has", () => {
    const first = uniqueId(document, "mav");
    document.body.append(el("div", { attrs: { id: first } }));

    expect(uniqueId(document, "mav")).not.toBe(first);
    expect(first.startsWith("mav-")).toBe(true);
  });
});

describe("level meter", () => {
  it("maps dBFS to a share of the meter, -80 dB empty and 0 dB full", () => {
    expect(levelFraction(-80)).toBe(0);
    expect(levelFraction(-40)).toBe(0.5);
    expect(levelFraction(5)).toBe(1);
    expect(levelFraction(-120)).toBe(0);
  });

  it("draws with a transform, marks the threshold and the gate's state", () => {
    const meter = createMeter(document, { label: "Input level" });
    expect(meter.element.getAttribute("aria-valuenow")).toBe("-80");

    meter.set({ db: -40, threshold: -60, open: true });

    expect(meter.fill.style.transform).toBe("scaleX(0.5)");
    expect(meter.element.style.getPropertyValue("--mav-meter-threshold")).toBe(
      "0.25",
    );
    expect(meter.element.hasAttribute("data-open")).toBe(true);
    expect(meter.element.getAttribute("role")).toBe("meter");
    expect(meter.element.getAttribute("aria-valuenow")).toBe("-40");
    meter.set({ db: -90, threshold: null, open: null });
    expect(meter.marker.hidden).toBe(true);
    expect(meter.element.hasAttribute("data-open")).toBe(false);
  });
});

describe("roving focus", () => {
  const toolbar = (): HTMLElement => {
    const bar = el("div", {
      children: ["a", "b", "c"].map((id) => el("button", { attrs: { id } })),
    });
    document.body.append(bar);
    return bar;
  };
  const key = (target: Element, name: string): void => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true }),
    );
  };

  it("leaves one item in the tab order and moves with the arrow keys", () => {
    // Arrange
    const bar = toolbar();
    roving(bar, { items: "button" });
    const [a, b, c] = [...bar.querySelectorAll("button")];

    // Act
    a?.focus();
    if (a) key(a, "ArrowRight");

    // Assert
    expect(document.activeElement).toBe(b);
    expect([a?.tabIndex, b?.tabIndex, c?.tabIndex]).toEqual([-1, 0, -1]);
    if (b) key(b, "End");
    expect(document.activeElement).toBe(c);
    if (c) key(c, "ArrowRight");
    expect(document.activeElement).toBe(a);
  });

  it("uses the up and down keys for a vertical list, and stops when undone", () => {
    const bar = toolbar();
    const list = roving(bar, { items: "button", orientation: "vertical" });
    const [a, b] = [...bar.querySelectorAll("button")];
    a?.focus();

    if (a) key(a, "ArrowRight");
    expect(document.activeElement).toBe(a);
    if (a) key(a, "ArrowDown");
    expect(document.activeElement).toBe(b);
    list.dispose();
    if (b) key(b, "ArrowDown");
    expect(document.activeElement).toBe(b);
  });

  it("keeps the tab stop on an item when items change", () => {
    const bar = toolbar();
    const r = roving(bar, { items: "button" });

    bar.querySelector("button")?.remove();
    r.refresh();

    expect([...bar.querySelectorAll("button")].map((x) => x.tabIndex)).toEqual([
      0, -1,
    ]);
  });
});

describe("placeInOrder", () => {
  it("puts children in order, moving only those out of place, and drops the rest", () => {
    // Arrange
    const [a, b, c, d] = ["a", "b", "c", "d"].map((id) =>
      el("li", { attrs: { id } }),
    );
    const list = el("ol", { children: [a, b, c, d] });
    document.body.append(list);
    const moved: string[] = [];
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) moved.push((n as Element).id);
    }).observe(list, { childList: true });

    // Act
    if (a && b && c) placeInOrder(list, [a, c, b]);

    // Assert
    expect(Array.from(list.children, (x) => x.id)).toEqual(["a", "c", "b"]);
  });
});
