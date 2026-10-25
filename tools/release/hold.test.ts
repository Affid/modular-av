import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { releaseHold } from "./hold.ts";

async function packageWith(modularAV: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hold-"));
  await writeFile(join(dir, "package.json"), JSON.stringify({ modularAV }));
  return dir;
}

describe("releaseHold", () => {
  it("gives the reason a module is held back", async () => {
    const dir = await packageWith({ releaseHold: "Waiting for LiveKit" });

    expect(await releaseHold(dir)).toBe("Waiting for LiveKit");
  });

  it.each([{}, { releaseHold: "" }, { releaseHold: 3 }, undefined])(
    "is null without a reason (%j)",
    async (modularAV) => {
      expect(await releaseHold(await packageWith(modularAV))).toBeNull();
    },
  );
});
