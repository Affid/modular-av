import { describe, expect, it } from "vitest";
import {
  LISTING_API,
  listingRelease,
  listingTokenKey,
  submitListing,
} from "./listing.ts";

const TOKEN = "fvttp_not-a-real-token";

const manifest = {
  id: "modular-av",
  version: "0.11.0",
  compatibility: { minimum: "14", verified: "14.369" },
};

/** A fetch that answers once with `status` and `body`, and records the call. */
function answering(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): { fetch: typeof fetch; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake: typeof fetch = (url, init) => {
    const address = url instanceof Request ? url.url : url.toString();
    calls.push({ url: address, init: init ?? {} });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return Promise.resolve(new Response(text, { status, headers }));
  };
  return { fetch: fake, calls };
}

describe("a version for foundryvtt.com", () => {
  it("points at the release's own manifest and changelog, with the manifest's compatibility", () => {
    // Act
    const request = listingRelease(manifest, "packages/core", false);

    // Assert
    expect(request).toEqual({
      id: "modular-av",
      "dry-run": false,
      release: {
        version: "0.11.0",
        manifest:
          "https://github.com/Affid/modular-av/releases/download/modular-av-v0.11.0/module.json",
        notes:
          "https://github.com/Affid/modular-av/blob/modular-av-v0.11.0/packages/core/CHANGELOG.md",
        compatibility: { minimum: "14", verified: "14.369" },
      },
    });
  });

  it("keeps a maximum the manifest sets, and asks for a dry run when told", () => {
    // Arrange
    const capped = {
      ...manifest,
      compatibility: { minimum: "14", verified: "14.369", maximum: "14" },
    };

    // Act
    const request = listingRelease(capped, "packages/core", true);

    // Assert
    expect(request["dry-run"]).toBe(true);
    expect(request.release.compatibility).toEqual({
      minimum: "14",
      verified: "14.369",
      maximum: "14",
    });
  });

  it("refuses a manifest without a verified Foundry version", () => {
    // Arrange
    const unverified = { ...manifest, compatibility: { minimum: "14" } };

    // Act and assert
    expect(() => listingRelease(unverified, "packages/core", false)).toThrow(
      /compatibility\.verified/,
    );
  });

  it("refuses a manifest that isn't one of the family's", () => {
    // Act and assert
    expect(() =>
      listingRelease({ ...manifest, id: "dice-so-nice" }, "packages/x", false),
    ).toThrow(/not a Modular A\/V module id/);
  });

  it("reads each package's token from its own variable", () => {
    // Act and assert
    expect(listingTokenKey("modular-av")).toBe(
      "FOUNDRY_RELEASE_TOKEN_MODULAR_AV",
    );
    expect(listingTokenKey("modular-av-audio-radio")).toBe(
      "FOUNDRY_RELEASE_TOKEN_MODULAR_AV_AUDIO_RADIO",
    );
  });
});

describe("sending a version to foundryvtt.com", () => {
  const request = listingRelease(manifest, "packages/core", false);

  it("posts the request with the token and reports the package page", async () => {
    // Arrange
    const page = "https://foundryvtt.com/packages/modular-av/edit/";
    const { fetch, calls } = answering(200, { status: "success", page });

    // Act
    const outcome = await submitListing(request, TOKEN, fetch);

    // Assert
    expect(outcome).toEqual({ kind: "saved", page });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(LISTING_API);
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: TOKEN,
    });
    const sent = calls[0]?.init.body;
    expect(typeof sent).toBe("string");
    expect(JSON.parse(sent as string)).toEqual(request);
  });

  it("says a dry run saved nothing", async () => {
    // Arrange
    const { fetch } = answering(200, {
      status: "success",
      page: "https://foundryvtt.com/packages/modular-av/edit/",
      message: "Dry run completed.",
    });

    // Act
    const outcome = await submitListing(
      { ...request, "dry-run": true },
      TOKEN,
      fetch,
    );

    // Assert
    expect(outcome.kind).toBe("checked");
  });

  it("takes a version Foundry already has as done, so a publish can be re-run", async () => {
    // Arrange
    const { fetch } = answering(400, {
      status: "error",
      errors: {
        __all__: [{ message: "Already exists.", code: "unique_together" }],
      },
    });

    // Act
    const outcome = await submitListing(request, TOKEN, fetch);

    // Assert
    expect(outcome.kind).toBe("exists");
  });

  it("names each field Foundry refused, and never the token", async () => {
    // Arrange
    const { fetch } = answering(400, {
      status: "error",
      errors: {
        "release.manifest": [
          { message: "Enter a valid URL.", code: "invalid" },
        ],
      },
    });

    // Act
    const sent = submitListing(request, TOKEN, fetch);

    // Assert
    await expect(sent).rejects.toThrow(
      /release\.manifest: Enter a valid URL\./,
    );
    await expect(sent).rejects.not.toThrow(new RegExp(TOKEN));
  });

  it("says how long to wait when Foundry limits the rate", async () => {
    // Arrange
    const { fetch } = answering(429, "", { "Retry-After": "42" });

    // Act and assert
    await expect(submitListing(request, TOKEN, fetch)).rejects.toThrow(
      /42 seconds/,
    );
  });

  it("reports any other answer by its status", async () => {
    // Arrange
    const { fetch } = answering(403, "<html>Forbidden</html>");

    // Act and assert
    await expect(submitListing(request, TOKEN, fetch)).rejects.toThrow(/403/);
  });
});
