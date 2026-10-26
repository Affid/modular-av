import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fetchDownloads, readDownloads } from "./downloads.ts";

const MODEL = "a tflite model";
const SHA = createHash("sha256").update(MODEL).digest("hex");
const URL_ = "https://storage.example.com/models/1/model.tflite";

async function modulePackage(downloads: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "downloads-"));
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "m", modularAV: { downloads } }),
  );
  return dir;
}

const respond = (body: string, status = 200): typeof fetch =>
  vi.fn(() => Promise.resolve(new Response(body, { status })));

describe("downloads at build time", () => {
  it("reads each published path's pinned URL and hash", async () => {
    const dir = await modulePackage({
      "models/model.tflite": { url: URL_, sha256: SHA },
    });

    expect([...readDownloads(dir)]).toEqual([
      ["models/model.tflite", { url: URL_, sha256: SHA }],
    ]);
  });

  it("has none for a package that declares none", async () => {
    const dir = await mkdtemp(join(tmpdir(), "downloads-"));
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "m" }));

    expect(readDownloads(dir).size).toBe(0);
  });

  it.each([
    [{ "../x": { url: URL_, sha256: SHA } }, /published path/],
    [{ "m/x": { url: "http://insecure.example/x", sha256: SHA } }, /https/],
    [{ "m/x": { url: URL_, sha256: "abc" } }, /sha256/],
    [{ "m/x": URL_ }, /url and sha256/],
  ])("refuses %j", async (downloads, error) => {
    const dir = await modulePackage(downloads);

    expect(() => readDownloads(dir)).toThrow(error);
  });

  it("fetches a file once into the cache, checked against its hash", async () => {
    // Arrange
    const dir = await modulePackage({
      "models/model.tflite": { url: URL_, sha256: SHA },
    });
    const cacheDir = await mkdtemp(join(tmpdir(), "cache-"));
    const fetcher = respond(MODEL);

    // Act
    const first = await fetchDownloads(dir, { cacheDir, fetcher });
    const second = await fetchDownloads(dir, { cacheDir, fetcher });

    // Assert
    const file = join(cacheDir, SHA);
    expect([...first]).toEqual([["models/model.tflite", file]]);
    expect([...second]).toEqual([...first]);
    expect(await readFile(file, "utf8")).toBe(MODEL);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refuses a file whose hash doesn't match, and keeps nothing of it", async () => {
    const dir = await modulePackage({
      "models/model.tflite": { url: URL_, sha256: SHA },
    });
    const cacheDir = await mkdtemp(join(tmpdir(), "cache-"));

    await expect(
      fetchDownloads(dir, { cacheDir, fetcher: respond("something else") }),
    ).rejects.toThrow(/sha256/);
    await expect(readFile(join(cacheDir, SHA))).rejects.toThrow();
  });

  it("fetches again a cached file that was changed", async () => {
    const dir = await modulePackage({
      "models/model.tflite": { url: URL_, sha256: SHA },
    });
    const cacheDir = await mkdtemp(join(tmpdir(), "cache-"));
    await writeFile(join(cacheDir, SHA), "tampered");
    const fetcher = respond(MODEL);

    await fetchDownloads(dir, { cacheDir, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await readFile(join(cacheDir, SHA), "utf8")).toBe(MODEL);
  });

  it("says which file failed to download", async () => {
    const dir = await modulePackage({
      "models/model.tflite": { url: URL_, sha256: SHA },
    });
    const cacheDir = await mkdtemp(join(tmpdir(), "cache-"));

    await expect(
      fetchDownloads(dir, { cacheDir, fetcher: respond("", 404) }),
    ).rejects.toThrow(/models\/model\.tflite.*404/);
  });
});
