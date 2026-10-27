import { describe, expect, it } from "vitest";
import type { Catalog } from "../src/catalog/catalog.ts";
import { checkIsDue } from "../src/modules/menu.ts";
import { newsOf } from "../src/modules/news.ts";

const DAY = 24 * 60 * 60 * 1000;

const module = (id: string, version: string) => ({
  id,
  title: `Modular A/V — ${id}`,
  description: `${id}.`,
  kind: "effect" as const,
  version,
  manifest: `https://raw.githubusercontent.com/Affid/modular-av/manifests/${id}/module.json`,
  requires: [],
});
const catalog = (...modules: ReturnType<typeof module>[]): Catalog => ({
  schema: 1,
  modules,
  soon: [],
});

describe("news from GitHub's catalog", () => {
  const world = new Map([
    ["modular-av", { active: true, version: "0.3.1" }],
    ["modular-av-dock", { active: false, version: "0.4.0" }],
  ]);
  const bundled = catalog(
    module("modular-av", "0.3.1"),
    module("modular-av-dock", "0.3.1"),
    module("modular-av-p2p", "0.3.1"),
  );

  it("names updates of what is installed, and modules the core didn't know", () => {
    const remote = catalog(
      module("modular-av", "0.4.0"),
      module("modular-av-dock", "0.4.0"),
      module("modular-av-p2p", "0.4.0"),
      module("modular-av-mumble", "0.4.0"),
    );

    const news = newsOf(world, bundled, remote);

    expect(news.updates).toEqual(["modular-av"]);
    expect(news.fresh).toEqual(["modular-av-mumble"]);
    // Another release is news again; the same one is not.
    expect(news.key).toBe("modular-av@0.4.0;+modular-av-mumble");
  });

  it("is nothing when GitHub has nothing newer", () => {
    expect(newsOf(world, bundled, bundled)).toMatchObject({
      updates: [],
      fresh: [],
    });
  });
});

describe("the daily check", () => {
  const game = (isGM: boolean, check: boolean, last: number) =>
    ({
      user: { isGM },
      settings: {
        get: (_ns: string, key: string) =>
          key === "checkGitHub" ? check : last,
      },
    }) as never;

  it("is due for a GM once a day, while the world allows it", () => {
    const now = 10 * DAY;

    expect(checkIsDue(game(true, true, now - DAY), now)).toBe(true);
    expect(checkIsDue(game(true, true, now - DAY + 1), now)).toBe(false);
    expect(checkIsDue(game(false, true, 0), now)).toBe(false);
    expect(checkIsDue(game(true, false, 0), now)).toBe(false);
  });
});
