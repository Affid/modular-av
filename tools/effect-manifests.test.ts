import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listModulePackages } from "./workspace.ts";

const MIXER = "modular-av-audio-mixer";
const AUDIO_EFFECT = "modular-av-audio-";

interface Relation {
  readonly id: string;
  readonly reason?: string;
}

interface Manifest {
  readonly id: string;
  readonly relationships?: {
    readonly requires?: readonly Relation[];
    readonly recommends?: readonly Relation[];
  };
}

/** The workspace's audio effects: every `modular-av-audio-*` but the mixer. */
async function audioEffects(): Promise<readonly Manifest[]> {
  const modules = await listModulePackages();
  const manifests = await Promise.all(
    modules.map(
      async (m) =>
        JSON.parse(
          await readFile(join(m.dir, "module.json"), "utf8"),
        ) as Manifest,
    ),
  );
  return manifests.filter(
    (m) => m.id.startsWith(AUDIO_EFFECT) && m.id !== MIXER,
  );
}

describe("an audio effect's module.json", () => {
  it("is found for every audio effect in the workspace", async () => {
    const ids = (await audioEffects()).map((m) => m.id);

    expect(ids).toContain("modular-av-audio-reverb");
  });

  it("recommends the mixer, which turns it on, with a reason Foundry shows", async () => {
    const effects = await audioEffects();

    for (const effect of effects) {
      const mixer = effect.relationships?.recommends?.find(
        (r) => r.id === MIXER,
      );
      expect(mixer, effect.id).toBeDefined();
      expect(mixer?.reason?.trim(), effect.id).toBeTruthy();
    }
  });

  it("doesn't require the mixer, so another module can turn it on", async () => {
    const effects = await audioEffects();

    for (const effect of effects) {
      const required = (effect.relationships?.requires ?? []).map((r) => r.id);
      expect(required, effect.id).not.toContain(MIXER);
    }
  });
});
