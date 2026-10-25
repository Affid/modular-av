import { describe, expect, it, vi } from "vitest";
import {
  createKrispLoader,
  KRISP_INTEGRITY,
  KRISP_URL,
  loadKrisp,
  type LoaderDeps,
} from "../src/loader.ts";
import { fakeKrisp } from "./fakes.ts";

function deps(
  options: { status?: number; module?: unknown } = {},
): LoaderDeps & { revoked: string[]; imported: string[] } {
  const revoked: string[] = [];
  const imported: string[] = [];
  return {
    revoked,
    imported,
    fetch: vi.fn(() =>
      Promise.resolve(
        new Response("export const krisp = 1;", {
          status: options.status ?? 200,
        }),
      ),
    ),
    importUrl: (url) => {
      imported.push(url);
      return Promise.resolve(
        "module" in options ? options.module : fakeKrisp().module,
      );
    },
    createObjectURL: () => "blob:krisp",
    revokeObjectURL: (url) => revoked.push(url),
  };
}

describe("loading Krisp from npm", () => {
  it("downloads the pinned version only if it matches the hash, without cookies", async () => {
    const d = deps();

    await loadKrisp(d);

    expect(KRISP_URL).toBe(
      "https://cdn.jsdelivr.net/npm/@livekit/krisp-noise-filter@0.4.5/dist/index.js",
    );
    expect(d.fetch).toHaveBeenCalledWith(KRISP_URL, {
      integrity: KRISP_INTEGRITY,
      credentials: "omit",
      mode: "cors",
    });
    expect(KRISP_INTEGRITY).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
  });

  it("imports the checked copy, then forgets its URL", async () => {
    const d = deps();

    const module = await loadKrisp(d);

    expect(d.imported).toEqual(["blob:krisp"]);
    expect(d.revoked).toEqual(["blob:krisp"]);
    expect(typeof module.KrispNoiseFilter).toBe("function");
  });

  it("says when the download failed", async () => {
    await expect(loadKrisp(deps({ status: 404 }))).rejects.toMatchObject({
      name: "NetworkError",
    });
  });

  it("refuses a module that isn't Krisp, and still forgets its URL", async () => {
    const d = deps({ module: { something: "else" } });

    await expect(loadKrisp(d)).rejects.toThrow(TypeError);
    expect(d.revoked).toEqual(["blob:krisp"]);
  });
});

describe("the page's Krisp loader", () => {
  it("downloads once, and again only after a failure", async () => {
    const krisp = fakeKrisp().module;
    const load = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(krisp);
    const loader = createKrispLoader(load);

    await expect(loader()).rejects.toThrow("Failed to fetch");
    const first = await loader();
    const second = await loader();

    expect(first).toBe(krisp);
    expect(second).toBe(krisp);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
