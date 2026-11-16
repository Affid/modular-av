import { describe, expect, it, vi } from "vitest";
import { allReleases, apiGetter, trafficAnswers } from "./github.ts";

const answer = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

describe("apiGetter", () => {
  it("asks this repository's API, with the token when there is one", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(answer([])));
    await apiGetter("secret", fetchFn)("/releases");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.github.com/repos/Affid/modular-av/releases",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret",
        }) as unknown,
      }),
    );
  });

  it("sends no Authorization header without a token", async () => {
    const fetchFn = vi.fn((_url: string, init?: RequestInit) => {
      expect(init?.headers).not.toHaveProperty("Authorization");
      return Promise.resolve(answer([]));
    });
    await apiGetter("", fetchFn)("/releases");
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("fails loudly on an error answer, without the token in the message", async () => {
    const get = apiGetter("secret", () => Promise.resolve(answer({}, 403)));
    await expect(get("/traffic/views")).rejects.toThrow(
      "GitHub answered 403 for /traffic/views",
    );
    await expect(get("/traffic/views")).rejects.not.toThrow(/secret/);
  });
});

describe("allReleases", () => {
  it("pages through 100 releases at a time until a short page", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const asked: string[] = [];
    const releases = await allReleases((path) => {
      asked.push(path);
      return Promise.resolve(path.endsWith("page=1") ? full : [{ id: 100 }]);
    });
    expect(releases).toHaveLength(101);
    expect(asked).toEqual([
      "/releases?per_page=100&page=1",
      "/releases?per_page=100&page=2",
    ]);
  });

  it("throws on a page that isn't a list", async () => {
    await expect(
      allReleases(() => Promise.resolve({ message: "x" })),
    ).rejects.toThrow(/list of releases/);
  });
});

describe("trafficAnswers", () => {
  it("asks for views and clones", async () => {
    const result = await trafficAnswers((path) => Promise.resolve({ path }));
    expect(result).toEqual({
      views: { path: "/traffic/views" },
      clones: { path: "/traffic/clones" },
    });
  });
});
