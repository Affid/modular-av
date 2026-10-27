// @vitest-environment happy-dom
import type { ConnectionStats } from "@modular-av/api";
import { avState, participantState } from "@modular-av/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { camerasSurface } from "../src/cameras/dock.ts";
import { openParticipantMenu } from "../src/menus/participant-menu.ts";
import { qualityOf } from "../src/view/connection-view.ts";
import { fakeHost, settle, testDock } from "./context.ts";

/** The details, once their code has loaded. */
function opened(details: HTMLElement | null): HTMLElement {
  if (!details) throw new Error("the details aren't open yet");
  return details;
}

afterEach(() => {
  document.body.replaceChildren();
});

const me = participantState({ id: "me", name: "Me", isLocal: true });
const aria = participantState({ id: "p1", name: "Aria", quality: "good" });
const borin = participantState({ id: "p2", name: "Borin", quality: "poor" });
const inCall = avState({
  participants: [me, aria, borin],
  session: { status: "connected" },
});

function mount(
  state = inCall,
  stats: ReadonlyMap<string | null, ConnectionStats> = new Map(),
) {
  const test = testDock({ state });
  test.api.services.register({ id: "mock", label: "LiveKit" } as never);
  for (const [id, value] of stats) test.api.setStats(id, value);
  const host = fakeHost("left");
  camerasSurface(test.ctx).mount(host);
  const line = (): HTMLButtonElement | null =>
    host.element.querySelector(".mav-dock-connection-status");
  const details = (): HTMLElement | null =>
    document.querySelector(".mav-dock-connection");
  return { ...test, host, line, details };
}

describe("judging a connection from its numbers", () => {
  it.each([
    [{ roundTripMs: 40, packetLoss: 0 }, "excellent"],
    [{ roundTripMs: 180, packetLoss: 0.01 }, "good"],
    [{ roundTripMs: 320 }, "poor"],
    [{ roundTripMs: 60, packetLoss: 0.06 }, "poor"],
    [{}, null],
  ] as const)("%j is %s", (stats, quality) => {
    expect(qualityOf(stats)).toBe(quality);
  });
});

describe("the voice panel's connection line", () => {
  it("shows your round trip, the service and the path while in the call", async () => {
    const { line } = mount(
      inCall,
      new Map([[null, { roundTripMs: 42, relayed: false }]]),
    );

    await settle();

    expect(line()?.hidden).toBe(false);
    expect(line()?.textContent).toContain("42 ms");
    expect(line()?.textContent).toContain("LiveKit · direct");
    expect(line()?.dataset.quality).toBe("excellent");
    // Its accessible name: hidden words around the visible ones.
    expect(line()?.textContent).toBe(
      "Your connection, Excellent: 42 msLiveKit · direct. Connection details",
    );
  });

  it("says it's measuring before the first numbers, and hides outside a call", async () => {
    const { line } = mount();
    await settle();
    expect(line()?.textContent).toContain("Measuring…");

    const out = mount(
      avState({ participants: [me], session: { status: "idle" } }),
    );
    await settle();
    expect(out.line()?.hidden).toBe(true);
  });
});

describe("the connection details", () => {
  it("open from the line with your numbers and every player's link", async () => {
    const { line, details } = mount(
      inCall,
      new Map<string | null, ConnectionStats>([
        [null, { roundTripMs: 42, packetLoss: 0.012, relayed: true }],
        ["p1", { roundTripMs: 38 }],
      ]),
    );
    await settle();

    line()?.click();
    // The details' code loads on first use.
    const panel = await vi.waitFor(() => opened(details()));
    expect(panel.closest("[role='dialog']")?.getAttribute("aria-label")).toBe(
      "Connection details",
    );
    expect(panel.textContent).toContain("1.2%");
    expect(panel.textContent).toContain("Through a relay");
    const players = [
      ...panel.querySelectorAll<HTMLButtonElement>(".mav-dock-link"),
    ];
    expect(players.map((p) => p.textContent)).toEqual([
      "AriaGood",
      "BorinPoor",
    ]);

    players[0]?.click();
    await settle();

    expect(players[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(panel.textContent).toContain("38 ms");
  });

  it("open on a player from their menu's link line", async () => {
    const { ctx, details, host } = mount(
      inCall,
      new Map([["p2", { roundTripMs: 124, packetLoss: 0.04 }]]),
    );
    await settle();
    const anchor = host.element.querySelector<HTMLElement>(
      '[data-participant-id="p2"] .mav-dock-tile-menu',
    );
    if (!anchor) throw new Error("no tile menu");

    const menu = openParticipantMenu(ctx, "p2", anchor);
    await settle();
    const link = menu?.element.querySelector(".mav-dock-link-line");
    expect(link?.textContent).toContain("Link: Poor · 124 ms");
    menu?.element
      .querySelector<HTMLButtonElement>('[data-action="connection"]')
      ?.click();

    const panel = await vi.waitFor(() => opened(details()));
    const expanded = panel.querySelector(
      '.mav-dock-link[aria-expanded="true"]',
    );
    expect(expanded?.textContent).toContain("Borin");
  });
});
