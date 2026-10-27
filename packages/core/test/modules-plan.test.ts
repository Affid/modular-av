import { describe, expect, it } from "vitest";
import type { Catalog } from "../src/catalog/catalog.ts";
import { piecesOf, socketOf } from "../src/modules/pieces.ts";
import { withoutPiece, withPiece } from "../src/modules/plan.ts";
import {
  applicable,
  linksFor,
  planDiff,
  updatesFor,
  type WorldModules,
} from "../src/modules/steps.ts";

const url = (id: string) =>
  `https://raw.githubusercontent.com/Affid/modular-av/manifests/${id}/module.json`;
const mod = (id: string, kind: string, requires = ["modular-av"]) => ({
  id,
  title: `Modular A/V — ${id}`,
  description: `${id} does things.`,
  kind: kind as "service",
  version: "0.4.0",
  manifest: url(id),
  requires: requires.map((r) => ({ id: r, minimum: "0.4.0" })),
});
const catalog: Catalog = {
  schema: 1,
  modules: [
    mod("modular-av", "core", []),
    mod("modular-av-livekit", "service"),
    mod("modular-av-p2p", "service"),
    mod("modular-av-dock", "ui"),
    mod("modular-av-mic-denoise", "effect"),
    mod("modular-av-cam-background", "effect"),
    mod("modular-av-dock-vines", "theme", ["modular-av-dock"]),
  ],
  soon: [],
};
const pieces = piecesOf(catalog);
const plan = (...ids: string[]): ReadonlySet<string> => new Set(ids);
const world = (
  entries: Record<string, { active: boolean; version?: string }>,
): WorldModules =>
  new Map(
    Object.entries(entries).map(([id, w]) => [
      id,
      { active: w.active, version: w.version ?? "0.4.0" },
    ]),
  );

describe("the pieces on the board", () => {
  it("leaves the core out: it is the board", () => {
    expect(pieces.map((p) => p.id)).not.toContain("modular-av");
  });

  it("put each kind in its socket, a theme in the socket of what it themes", () => {
    const socket = (id: string) => {
      const piece = pieces.find((p) => p.id === id);
      if (!piece) throw new Error(`no piece ${id}`);
      return socketOf(piece);
    };

    expect(socket("modular-av-livekit")).toEqual({
      key: "core.service",
      single: true,
      parent: null,
    });
    expect(socket("modular-av-mic-denoise")).toMatchObject({
      key: "core.effects",
      single: false,
    });
    expect(socket("modular-av-dock-vines")).toEqual({
      key: "modular-av-dock.theme",
      single: true,
      parent: "modular-av-dock",
    });
  });
});

describe("changing the plan", () => {
  it("adds a piece, replacing the one in a single socket with what hangs off it", () => {
    const before = plan(
      "modular-av-livekit",
      "modular-av-dock",
      "modular-av-dock-vines",
    );

    const swapped = withPiece(before, "modular-av-p2p", pieces);
    const noDock = withoutPiece(before, "modular-av-dock", pieces);

    expect([...swapped.plan].sort()).toEqual([
      "modular-av-dock",
      "modular-av-dock-vines",
      "modular-av-p2p",
    ]);
    expect(swapped.dropped).toEqual(["modular-av-livekit"]);
    expect([...noDock.plan]).toEqual(["modular-av-livekit"]);
    expect(noDock.removed).toEqual([
      "modular-av-dock",
      "modular-av-dock-vines",
    ]);
  });

  it("adds any number of effects", () => {
    const next = withPiece(
      plan("modular-av-mic-denoise"),
      "modular-av-cam-background",
      pieces,
    );

    expect(next.plan.size).toBe(2);
    expect(next.dropped).toEqual([]);
  });

  it("leaves the plan as it was when asked for what it already has", () => {
    const before = plan("modular-av-livekit");

    expect(withPiece(before, "modular-av-livekit", pieces).plan).toBe(before);
  });
});

describe("the steps a plan needs", () => {
  const now = world({
    "modular-av-livekit": { active: true },
    "modular-av-dock": { active: true },
    "modular-av-mic-denoise": { active: false },
  });

  it("splits it into what to install, turn on and turn off", () => {
    const next = plan(
      "modular-av-p2p",
      "modular-av-dock",
      "modular-av-mic-denoise",
    );

    expect(planDiff(next, now)).toEqual({
      turnOn: ["modular-av-p2p", "modular-av-mic-denoise"],
      turnOff: ["modular-av-livekit"],
      install: ["modular-av-p2p"],
    });
  });

  it("keeps the running service on until its replacement is installed", () => {
    const next = plan(
      "modular-av-p2p",
      "modular-av-dock",
      "modular-av-mic-denoise",
    );

    expect(applicable(next, now, pieces)).toEqual({
      on: ["modular-av-mic-denoise"],
      off: [],
      keep: ["modular-av-livekit"],
      waiting: ["modular-av-p2p"],
    });
  });

  it("swaps the service once the new one is installed", () => {
    const installed = world({
      "modular-av-livekit": { active: true },
      "modular-av-p2p": { active: false },
    });

    expect(applicable(plan("modular-av-p2p"), installed, pieces)).toEqual({
      on: ["modular-av-p2p"],
      off: ["modular-av-livekit"],
      keep: [],
      waiting: [],
    });
  });

  it("turns a theme on only with what it themes", () => {
    const installed = world({ "modular-av-dock-vines": { active: false } });
    const next = plan("modular-av-dock", "modular-av-dock-vines");

    expect(applicable(next, installed, pieces)).toMatchObject({
      on: [],
      waiting: ["modular-av-dock", "modular-av-dock-vines"],
    });
  });

  it("asks for the fewest links: a piece another one requires comes with it", () => {
    expect(
      linksFor(["modular-av-dock", "modular-av-dock-vines"], pieces),
    ).toEqual([{ id: "modular-av-dock-vines", brings: ["modular-av-dock"] }]);
  });

  it("names the installed modules with a newer version, the core first", () => {
    const old = world({
      "modular-av": { active: true, version: "0.3.1" },
      "modular-av-dock": { active: true, version: "0.3.1" },
      "modular-av-p2p": { active: false, version: "0.4.0" },
    });

    expect(updatesFor(old, catalog)).toEqual(["modular-av", "modular-av-dock"]);
  });
});
