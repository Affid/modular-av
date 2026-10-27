import { describe, expect, it } from "vitest";
import {
  type Catalog,
  CATALOG_URL,
  MANIFESTS_URL,
} from "../src/catalog/catalog.ts";
import {
  type CatalogFetch,
  fetchCatalog,
  loadCatalogs,
  MAX_CATALOG_BYTES,
} from "../src/catalog/fetch.ts";

const module = (id: string, version: string) => ({
  id,
  title: `Modular A/V — ${id}`,
  description: `${id}.`,
  kind: "service" as const,
  version,
  manifest: `${MANIFESTS_URL}${id}/module.json`,
  requires: [],
});
const bundled: Catalog = {
  schema: 1,
  modules: [module("modular-av-livekit", "0.3.1")],
  soon: [],
};
const remote: Catalog = {
  schema: 1,
  modules: [
    module("modular-av-livekit", "0.4.0"),
    module("modular-av-mumble", "0.4.0"),
  ],
  soon: [],
};

function answering(
  body: string,
  ok = true,
): CatalogFetch & {
  readonly asked: { url: string; init: RequestInit }[];
} {
  const asked: { url: string; init: RequestInit }[] = [];
  const fetch: CatalogFetch = (url, init) => {
    asked.push({ url, init });
    return Promise.resolve({ ok, text: () => Promise.resolve(body) });
  };
  return Object.assign(fetch, { asked });
}

describe("fetching the family's catalog from GitHub", () => {
  it("asks the manifests branch without credentials or a referrer", async () => {
    const fetch = answering(JSON.stringify(remote));

    const catalog = await fetchCatalog(fetch);

    expect(catalog).toEqual(remote);
    expect(fetch.asked[0]?.url).toBe(CATALOG_URL);
    expect(fetch.asked[0]?.init).toMatchObject({
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-cache",
    });
    expect(fetch.asked[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["an error status", answering(JSON.stringify(remote), false)],
    ["no JSON", answering("<html>")],
    [
      "a hostile catalog",
      answering(JSON.stringify({ schema: 1, modules: [{ id: "x" }] })),
    ],
    ["too much", answering(" ".repeat(MAX_CATALOG_BYTES + 1))],
    [
      "a network failure",
      Object.assign(() => Promise.reject(new TypeError("offline")), {
        asked: [],
      }) as unknown as CatalogFetch,
    ],
  ])("gives nothing back for %s", async (_case, fetch) => {
    expect(await fetchCatalog(fetch)).toBeNull();
  });
});

describe("the catalog the board shows", () => {
  it("is GitHub's when it answers, what the core knows marking the rest new", async () => {
    const loaded = await loadCatalogs({
      bundled: () => Promise.resolve(bundled),
      remote: () => Promise.resolve(remote),
      checkGitHub: true,
    });

    expect(loaded.source).toBe("github");
    expect(loaded.catalog).toEqual(remote);
    expect([...loaded.known]).toEqual(["modular-av-livekit"]);
  });

  it("is the core's own when GitHub can't be reached, or checking it is off", async () => {
    let asked = 0;
    const remoteNever = () => {
      asked += 1;
      return Promise.resolve(null);
    };

    const offline = await loadCatalogs({
      bundled: () => Promise.resolve(bundled),
      remote: remoteNever,
      checkGitHub: true,
    });
    const off = await loadCatalogs({
      bundled: () => Promise.resolve(bundled),
      remote: remoteNever,
      checkGitHub: false,
    });

    expect([offline.source, off.source]).toEqual(["offline", "off"]);
    expect(off.catalog).toEqual(bundled);
    expect(asked).toBe(1);
  });
});
