import { describe, expect, it } from "vitest";
import {
  devInstallUrl,
  devManifest,
  devManifestUrl,
  devModules,
  devNotes,
  devVersion,
} from "./dev.ts";

const AT = new Date("2026-11-12T15:30:45.123Z");

describe("devVersion", () => {
  it("adds a dev prerelease stamped with the UTC time", () => {
    expect(devVersion("0.12.0", AT)).toBe("0.12.0-dev.20261112153045");
  });

  it("extends a version that is already a prerelease", () => {
    expect(devVersion("1.0.0-rc.1", AT)).toBe("1.0.0-rc.1.dev.20261112153045");
  });
});

describe("devManifestUrl", () => {
  it("points at the dev release's asset for the module", () => {
    expect(devManifestUrl("modular-av-dock")).toBe(
      "https://github.com/Affid/modular-av/releases/download/dev/modular-av-dock.json",
    );
  });

  it("refuses an id that isn't a Modular A/V module", () => {
    expect(() => devManifestUrl("../evil")).toThrow(/not a Modular A\/V/);
  });
});

describe("devInstallUrl", () => {
  it("is the manifest URL made unique to the build, which no cache has seen", () => {
    expect(devInstallUrl("modular-av-dock", "0.12.0-dev.1")).toBe(
      "https://github.com/Affid/modular-av/releases/download/dev/modular-av-dock.json?v=0.12.0-dev.1",
    );
  });
});

describe("devManifest", () => {
  const built = {
    id: "modular-av-dock",
    title: "Modular A/V: Dock",
    version: "0.12.0",
    manifest: "https://example.invalid/stable.json",
    relationships: {
      requires: [
        {
          id: "modular-av",
          type: "module",
          manifest: "https://example.invalid/core.json",
          compatibility: { minimum: "0.12.0" },
        },
      ],
      recommends: [
        {
          id: "modular-av-livekit",
          type: "module",
          manifest: "https://example.invalid/livekit.json",
        },
      ],
      systems: [{ id: "dnd5e", type: "system" }],
    },
  };

  it("gives the dev version, the dev URLs and a title that says dev, its zip's unique to the build", () => {
    // Act
    const manifest = devManifest(
      built,
      "0.12.0-dev.1",
      new Set(["modular-av-dock"]),
    );

    // Assert
    expect(manifest).toMatchObject({
      id: "modular-av-dock",
      title: "Modular A/V: Dock (dev)",
      version: "0.12.0-dev.1",
      manifest:
        "https://github.com/Affid/modular-av/releases/download/dev/modular-av-dock.json",
      // GitHub may answer an address it has seen with the last build's
      // file for up to an hour: a new address gets this build's zip.
      download:
        "https://github.com/Affid/modular-av/releases/download/dev/modular-av-dock.zip?v=0.12.0-dev.1",
    });
  });

  it("points family modules in the same build at their dev manifests, and leaves the rest", () => {
    // Act
    const manifest = devManifest(
      built,
      "0.12.0-dev.1",
      new Set(["modular-av-dock", "modular-av"]),
    );

    // Assert
    expect(manifest.relationships).toEqual({
      requires: [
        {
          id: "modular-av",
          type: "module",
          manifest:
            "https://github.com/Affid/modular-av/releases/download/dev/modular-av.json?v=0.12.0-dev.1",
          compatibility: { minimum: "0.12.0" },
        },
      ],
      recommends: [
        {
          id: "modular-av-livekit",
          type: "module",
          manifest: "https://example.invalid/livekit.json",
        },
      ],
      systems: [{ id: "dnd5e", type: "system" }],
    });
  });

  it("doesn't change the built manifest", () => {
    const before = structuredClone(built);

    devManifest(built, "0.12.0-dev.1", new Set(["modular-av-dock"]));

    expect(built).toEqual(before);
  });

  it("refuses a manifest without a module id", () => {
    expect(() => devManifest({ title: "x" }, "0.1.0-dev.1", new Set())).toThrow(
      /no module id/,
    );
  });
});

describe("devModules", () => {
  const requires = new Map<string, readonly string[]>([
    ["modular-av", []],
    ["modular-av-dock", ["modular-av"]],
    ["modular-av-dock-vines", ["modular-av-dock"]],
    ["modular-av-livekit", ["modular-av"]],
  ]);

  it("adds every family module the wanted ones require, however deep", () => {
    expect(devModules(["modular-av-dock-vines"], requires)).toEqual(
      new Set(["modular-av-dock-vines", "modular-av-dock", "modular-av"]),
    );
  });

  it("lists each module once", () => {
    expect(
      devModules(["modular-av-dock", "modular-av-livekit"], requires),
    ).toEqual(new Set(["modular-av-dock", "modular-av-livekit", "modular-av"]));
  });

  it("refuses a module that isn't in the workspace", () => {
    expect(() => devModules(["modular-av-nope"], requires)).toThrow(
      /No module "modular-av-nope"/,
    );
  });
});

describe("devNotes", () => {
  it("names the commit and each module's install URL for this build", () => {
    // Act
    const notes = devNotes("feat/screen-share", "1e7ae0f0123", [
      { id: "modular-av", version: "0.12.0-dev.1" },
    ]);

    // Assert
    expect(notes).toContain("`feat/screen-share` at 1e7ae0f0123");
    expect(notes).toContain(
      "- modular-av 0.12.0-dev.1: https://github.com/Affid/modular-av/releases/download/dev/modular-av.json?v=0.12.0-dev.1",
    );
  });
});
