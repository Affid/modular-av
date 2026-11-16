import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listModulePackages } from "../workspace.ts";
import { CARD_GROUPS, GROUPS, MODULES, classify, versionOf } from "./parts.ts";

describe("MODULES", () => {
  it("lists every Foundry module in the workspace, and nothing else", async () => {
    const ids = (await listModulePackages()).map((m) => m.id).toSorted();
    expect(MODULES.map((m) => m.id).toSorted()).toEqual(ids);
  });

  it("names each module as its module.json title does", async () => {
    const modules = await listModulePackages();
    const titles = await Promise.all(
      modules.map(async (m) => {
        const text = await readFile(join(m.dir, "module.json"), "utf8");
        const { title } = JSON.parse(text) as { title: string };
        return [m.id, title] as const;
      }),
    );
    for (const [id, title] of titles) {
      const entry = MODULES.find((m) => m.id === id);
      const expected =
        id === "modular-av" ? "Core" : title.replace(/^Modular A\/V: /, "");
      expect(entry?.name, id).toBe(expected);
    }
  });

  it("puts every module in a known group", () => {
    const groups = new Set(GROUPS.map((g) => g.id));
    for (const m of MODULES) expect(groups.has(m.group), m.id).toBe(true);
  });
});

describe("GROUPS", () => {
  it("gives the card's groups distinct colour slots", () => {
    const slots = CARD_GROUPS.map(
      (id) => GROUPS.find((g) => g.id === id)?.slot,
    );
    expect(slots.every((s) => typeof s === "number")).toBe(true);
    expect(new Set(slots).size).toBe(CARD_GROUPS.length);
  });
});

describe("classify", () => {
  it("counts a module's zip under that module", () => {
    const file = classify("modular-av-dock-v0.13.2", "modular-av-dock.zip");
    expect(file).toEqual({
      kind: "zip",
      module: MODULES.find((m) => m.id === "modular-av-dock"),
    });
  });

  it("tells the core's tag from the other modules' tags", () => {
    const file = classify("modular-av-v0.13.2", "modular-av.zip");
    expect(file.kind === "zip" && file.module.id).toBe("modular-av");
  });

  it("calls module.json a manifest lookup of its release's module", () => {
    const file = classify("modular-av-livekit-v0.13.1", "module.json");
    expect(file.kind === "manifest" && file.module.id).toBe(
      "modular-av-livekit",
    );
  });

  it("leaves the rolling dev prerelease out", () => {
    expect(classify("dev", "modular-av.zip")).toEqual({ kind: "dev" });
  });

  it("does not know a module that isn't in the list", () => {
    expect(classify("other-v1.0.0", "other.zip")).toEqual({
      kind: "unknown",
    });
  });

  it("does not know a file that doesn't match its release", () => {
    expect(classify("modular-av-dock-v0.13.2", "modular-av-p2p.zip")).toEqual({
      kind: "unknown",
    });
    expect(classify("not-a-version", "module.json")).toEqual({
      kind: "unknown",
    });
  });
});

describe("versionOf", () => {
  it("reads the version from a module's tag", () => {
    expect(versionOf("modular-av-audio-eq-v0.13.2")).toBe("0.13.2");
    expect(versionOf("modular-av-v1.0.0-rc.1")).toBe("1.0.0-rc.1");
  });

  it("gives undefined for a tag without one", () => {
    expect(versionOf("dev")).toBeUndefined();
  });
});
