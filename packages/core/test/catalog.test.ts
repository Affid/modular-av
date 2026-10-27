import { describe, expect, it } from "vitest";
import { MANIFESTS_URL, parseCatalog } from "../src/catalog/catalog.ts";

const manifestOf = (id: string): string => `${MANIFESTS_URL}${id}/module.json`;

const livekit = {
  id: "modular-av-livekit",
  title: "Modular A/V — LiveKit",
  description: "Calls over your LiveKit server or LiveKit Cloud.",
  kind: "service",
  version: "0.3.1",
  manifest: manifestOf("modular-av-livekit"),
  requires: [{ id: "modular-av", minimum: "0.3.1" }],
};
const krisp = {
  id: "modular-av-livekit-krisp",
  title: "Modular A/V — Krisp",
  description: "Krisp noise cancellation on LiveKit Cloud.",
  kind: "effect",
  requires: [{ id: "modular-av" }, { id: "modular-av-livekit" }],
};
const valid = { schema: 1, modules: [livekit], soon: [krisp] };

describe("reading a catalog of the family", () => {
  it("keeps released modules and the ones coming soon", () => {
    // Act
    const catalog = parseCatalog(valid);

    // Assert
    expect(catalog?.modules).toEqual([
      { ...livekit, requires: [{ id: "modular-av", minimum: "0.3.1" }] },
    ]);
    expect(catalog?.soon).toEqual([
      {
        ...krisp,
        requires: [
          { id: "modular-av", minimum: null },
          { id: "modular-av-livekit", minimum: null },
        ],
      },
    ]);
  });

  it("drops fields it doesn't know", () => {
    const catalog = parseCatalog({
      ...valid,
      extra: true,
      modules: [{ ...livekit, script: "alert(1)" }],
    });

    expect(catalog?.modules[0]).not.toHaveProperty("script");
    expect(catalog).not.toHaveProperty("extra");
  });

  it.each([
    ["not an object", "catalog"],
    ["another schema", { ...valid, schema: 2 }],
    ["modules not a list", { ...valid, modules: {} }],
    ["an id outside the family", mod({ id: "evil-module" })],
    ["a kind it doesn't know", mod({ kind: "plugin" })],
    ["a version that isn't semver", mod({ version: "latest" })],
    ["a title too long", mod({ title: "x".repeat(121) })],
    ["a description too long", mod({ description: "x".repeat(501) })],
    ["a requirement outside the family", mod({ requires: [{ id: "x" }] })],
    ["the same module twice", { ...valid, modules: [livekit, livekit] }],
    ["too many modules", { ...valid, modules: Array(101).fill(livekit) }],
  ])("refuses %s", (_case, value) => {
    expect(parseCatalog(value)).toBeNull();
  });

  it.each([
    ["another host", "https://example.com/modular-av-livekit/module.json"],
    ["another branch", livekit.manifest.replace("/manifests/", "/main/")],
    ["another module's manifest", manifestOf("modular-av-p2p")],
    ["a path that climbs out", manifestOf("modular-av-livekit/../../x")],
    ["plain http", livekit.manifest.replace("https:", "http:")],
  ])("refuses a manifest URL on %s", (_case, manifest) => {
    expect(parseCatalog(mod({ manifest }))).toBeNull();
  });
});

function mod(change: Record<string, unknown>): unknown {
  return { ...valid, modules: [{ ...livekit, ...change }] };
}
