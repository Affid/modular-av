import { describe, expect, it } from "vitest";
import { pendingReleases } from "./pending.ts";

const mod = (id: string, version: string, requires: string[] = []) => ({
  id,
  version,
  requires,
});

describe("the modules a release publishes", () => {
  it("lists those whose version has no tag, each after what it requires", () => {
    // Arrange
    const modules = [
      mod("modular-av-starter-set", "1.0.1", ["modular-av", "modular-av-dock"]),
      mod("modular-av-dock-vines", "1.0.2", ["modular-av-dock"]),
      mod("modular-av-dock", "1.1.0", ["modular-av"]),
      mod("modular-av-livekit", "1.0.0", ["modular-av"]),
      mod("modular-av", "1.2.0"),
    ];
    const tags = new Set([
      "modular-av-livekit-v1.0.0",
      "modular-av-dock-vines-v1.0.2",
      "modular-av-v1.1.0",
    ]);

    // Act
    const pending = pendingReleases(modules, tags);

    // Assert
    expect(pending.map((m) => `${m.id} ${m.version}`)).toEqual([
      "modular-av 1.2.0",
      "modular-av-dock 1.1.0",
      "modular-av-starter-set 1.0.1",
    ]);
  });

  it("is empty when every version is tagged", () => {
    expect(
      pendingReleases(
        [mod("modular-av", "1.0.0")],
        new Set(["modular-av-v1.0.0"]),
      ),
    ).toEqual([]);
  });

  it("refuses requirements that go round in a circle", () => {
    expect(() =>
      pendingReleases(
        [
          mod("modular-av-a", "1.0.0", ["modular-av-b"]),
          mod("modular-av-b", "1.0.0", ["modular-av-a"]),
        ],
        new Set(),
      ),
    ).toThrow(/circle: modular-av-a, modular-av-b/);
  });
});
