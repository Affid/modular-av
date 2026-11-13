import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCatalog } from "../../packages/core/src/catalog/catalog.ts";
import { listModulePackages } from "../workspace.ts";
import { buildCatalog, publishedCatalog, workspaceCatalog } from "./catalog.ts";
import { releaseHold } from "./hold.ts";
import { distManifest, releaseUrls } from "./manifest.ts";

/** A workspace of its own: a core, and an effect held back from releases. */
async function workspaceWithHeldModule(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mav-workspace-"));
  const write = async (
    name: string,
    manifest: Record<string, unknown>,
    pkg: Record<string, unknown>,
  ) => {
    const dir = join(root, "packages", name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "module.json"), JSON.stringify(manifest));
    await writeFile(join(dir, "package.json"), JSON.stringify(pkg));
  };
  await write(
    "core",
    {
      id: "modular-av",
      title: "Modular A/V",
      description: "The core.",
    },
    { version: "0.4.0" },
  );
  await write(
    "held",
    {
      id: "modular-av-held",
      title: "Modular A/V: held",
      description: "Waits for someone's permission.",
      flags: { "modular-av": { kind: "effect" } },
      relationships: { requires: [{ id: "modular-av", type: "module" }] },
    },
    { version: "0.4.0", modularAV: { releaseHold: "Waiting for a reply." } },
  );
  return root;
}

const family = {
  "modular-av": "0.4.0",
  "modular-av-livekit": "0.4.0",
  "modular-av-p2p": "0.4.0",
};

const released = (id: string, source: Record<string, unknown>) =>
  distManifest({ id, ...source }, "0.4.0", family, releaseUrls(id, "0.4.0"));

const core = released("modular-av", {
  title: "Modular A/V — voice & video",
  description: "Voice and video for Foundry VTT, built from modules.",
});
const p2p = released("modular-av-p2p", {
  title: "Modular A/V — P2P",
  description: "Calls straight between browsers.",
  flags: { "modular-av": { kind: "service" } },
  relationships: { requires: [{ id: "modular-av", type: "module" }] },
});
const krisp = distManifest(
  {
    id: "modular-av-livekit-krisp",
    title: "Modular A/V — Krisp",
    description: "Krisp noise cancellation on LiveKit Cloud.",
    flags: { "modular-av": { kind: "effect" } },
    relationships: {
      requires: [
        { id: "modular-av", type: "module" },
        { id: "modular-av-livekit", type: "module" },
        { id: "lib-wrapper", type: "module" },
      ],
    },
  },
  "0.4.0",
  family,
);

describe("the catalog of the family", () => {
  it("lists released modules with their manifests, and held ones as coming soon", () => {
    // Act
    const catalog = buildCatalog([p2p, core], [krisp]);

    // Assert
    expect(catalog.modules.map((m) => [m.id, m.kind, m.version])).toEqual([
      ["modular-av", "core", "0.4.0"],
      ["modular-av-p2p", "service", "0.4.0"],
    ]);
    expect(catalog.modules[1]).toMatchObject({
      manifest: releaseUrls("modular-av-p2p", "0.4.0").manifest,
      requires: [{ id: "modular-av", minimum: "0.4.0" }],
    });
    // Only family modules count as requirements; no version or manifest yet.
    expect(catalog.soon).toEqual([
      {
        id: "modular-av-livekit-krisp",
        title: "Modular A/V — Krisp",
        description: "Krisp noise cancellation on LiveKit Cloud.",
        kind: "effect",
        requires: [
          { id: "modular-av", minimum: "0.4.0" },
          { id: "modular-av-livekit", minimum: "0.4.0" },
        ],
      },
    ]);
    expect(parseCatalog(catalog)).toEqual(catalog);
  });

  it("leaves out a module that keeps itself out (a starter set of others)", () => {
    const starter = released("modular-av-starter-set", {
      title: "Modular A/V: Starter set",
      description: "Installs a ready set of modules.",
      flags: { "modular-av": { catalog: false } },
      relationships: { requires: [{ id: "modular-av-p2p", type: "module" }] },
    });

    const catalog = buildCatalog([p2p, core, starter], []);

    expect(catalog.modules.map((m) => m.id)).toEqual([
      "modular-av",
      "modular-av-p2p",
    ]);
  });

  it("carries each module's card facts and icon from its flags", () => {
    const facts = [{ label: "Server", value: "None" }];
    const withFacts = released("modular-av-p2p", {
      title: "Modular A/V — P2P",
      description: "Calls straight between browsers.",
      flags: {
        "modular-av": { kind: "service", facts, icon: "fa-solid fa-users" },
      },
      relationships: { requires: [{ id: "modular-av", type: "module" }] },
    });

    const catalog = buildCatalog([withFacts, core], []);

    expect(catalog.modules[1]).toMatchObject({
      facts,
      icon: "fa-solid fa-users",
    });
    expect(catalog.modules[0]).not.toHaveProperty("facts");
  });

  it("refuses card facts or an icon the core would drop", () => {
    const bad = released("modular-av-p2p", {
      title: "Modular A/V — P2P",
      description: "Calls straight between browsers.",
      flags: { "modular-av": { kind: "service", icon: "fa-users" } },
      relationships: { requires: [{ id: "modular-av", type: "module" }] },
    });

    expect(() => buildCatalog([bad, core], [])).toThrow(/modular-av-p2p/);
  });

  it("refuses a module the core couldn't read", () => {
    const untitled = released("modular-av-x", {
      description: "No title.",
      flags: { "modular-av": { kind: "effect" } },
    });

    expect(() => buildCatalog([untitled], [])).toThrow(/modular-av-x/);
  });

  it("of this workspace lists every module, the held ones as coming soon", async () => {
    const modules = await listModulePackages();
    const holds = await Promise.all(modules.map((m) => releaseHold(m.dir)));
    const heldIds = modules
      .filter((_, i) => holds[i] !== null)
      .map((m) => m.id);

    const catalog = await workspaceCatalog();

    const ids = [...catalog.modules, ...catalog.soon].map((m) => m.id).sort();
    // The starter set keeps itself out: it only installs others.
    expect(ids).toEqual(
      modules
        .map((m) => m.id)
        .filter((id) => id !== "modular-av-starter-set")
        .sort(),
    );
    expect(catalog.soon.map((m) => m.id).sort()).toEqual(heldIds.sort());
    expect(parseCatalog(catalog)).toEqual(catalog);
  });

  it("of a workspace with a held module offers it as coming soon", async () => {
    const root = await workspaceWithHeldModule();

    try {
      const catalog = await workspaceCatalog(root);

      expect(catalog.modules.map((m) => m.id)).toEqual(["modular-av"]);
      expect(catalog.soon.map((m) => m.id)).toEqual(["modular-av-held"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("on the manifests branch lists what is published there, and the held ones", async () => {
    // Arrange: the branch as the release leaves it, mid-release.
    const root = await workspaceWithHeldModule();
    const branch = await mkdtemp(join(tmpdir(), "mav-catalog-"));
    for (const manifest of [core, p2p]) {
      await mkdir(join(branch, String(manifest.id)));
      await writeFile(
        join(branch, String(manifest.id), "module.json"),
        JSON.stringify(manifest),
      );
    }
    await writeFile(join(branch, "catalog.json"), "{}");

    try {
      // Act
      const catalog = await publishedCatalog(branch, root);

      // Assert
      expect(catalog.modules.map((m) => m.id)).toEqual([
        "modular-av",
        "modular-av-p2p",
      ]);
      expect(catalog.soon.map((m) => m.id)).toEqual(["modular-av-held"]);
    } finally {
      await rm(branch, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  });
});
