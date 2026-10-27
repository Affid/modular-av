import { describe, expect, it } from "vitest";
import { distManifest, parseTag, releaseUrls, tagFor } from "./manifest.ts";

describe("release tags", () => {
  it("formats and parses <module-id>-v<semver>", () => {
    // Arrange
    const tag = tagFor("modular-av-livekit", "1.2.0");

    // Act
    const parsed = parseTag(tag);

    // Assert
    expect(tag).toBe("modular-av-livekit-v1.2.0");
    expect(parsed).toEqual({ id: "modular-av-livekit", version: "1.2.0" });
  });

  it("parses the bare core id and prerelease versions", () => {
    expect(parseTag("modular-av-v0.1.0-beta.2")).toEqual({
      id: "modular-av",
      version: "0.1.0-beta.2",
    });
  });

  it("rejects tags outside the family or without a semver", () => {
    expect(parseTag("avclient-livekit-v1.0.0")).toBeUndefined();
    expect(parseTag("modular-av-v1.0")).toBeUndefined();
    expect(parseTag("@modular-av/core@1.0.0")).toBeUndefined();
  });

  it("refuses to build a tag for an id outside the family", () => {
    expect(() => tagFor("--force", "1.0.0")).toThrow(/module id/);
    expect(() => tagFor("avclient-livekit", "1.0.0")).toThrow(/module id/);
  });

  it("refuses to build a tag from an invalid version", () => {
    expect(() => tagFor("modular-av", "latest")).toThrow(/semver/);
  });
});

describe("releaseUrls", () => {
  it("points the manifest at the manifests branch and the zip at the release", () => {
    expect(releaseUrls("modular-av", "0.1.0")).toEqual({
      manifest:
        "https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av/module.json",
      download:
        "https://github.com/Affid/modular-av/releases/download/modular-av-v0.1.0/modular-av.zip",
    });
  });
});

describe("distManifest", () => {
  const source = { id: "modular-av", title: "Modular A/V — voice & video" };

  it("adds the version, and the URLs for a release", () => {
    const urls = releaseUrls("modular-av", "0.1.0");

    expect(distManifest(source, "0.1.0")).toEqual({
      ...source,
      version: "0.1.0",
    });
    expect(distManifest(source, "0.1.0", urls)).toEqual({
      ...source,
      version: "0.1.0",
      ...urls,
    });
  });

  it("refuses a source manifest that sets generated fields", () => {
    expect(() =>
      distManifest({ ...source, version: "9.9.9" }, "0.1.0"),
    ).toThrow(/"version" is generated/);
  });

  it("requires family modules at this version, and says where to get them", () => {
    const livekit = {
      id: "modular-av-livekit",
      relationships: {
        requires: [
          { id: "modular-av", type: "module" },
          { id: "other", type: "module" },
        ],
        recommends: [{ id: "modular-av-dock", type: "module" }],
      },
    };

    // Releases are lockstep, and nothing is on Foundry's package list:
    // the stable manifest lets Foundry install a dependency by itself.
    expect(distManifest(livekit, "0.2.0").relationships).toEqual({
      requires: [
        {
          id: "modular-av",
          type: "module",
          manifest: releaseUrls("modular-av", "0.2.0").manifest,
          compatibility: { minimum: "0.2.0" },
        },
        { id: "other", type: "module" },
      ],
      recommends: [
        {
          id: "modular-av-dock",
          type: "module",
          manifest: releaseUrls("modular-av-dock", "0.2.0").manifest,
        },
      ],
    });
  });

  it("refuses a family relationship with its own manifest URL", () => {
    expect(() =>
      distManifest(
        {
          id: "modular-av",
          relationships: {
            recommends: [
              { id: "modular-av-dock", manifest: "https://example.com/m.json" },
            ],
          },
        },
        "0.2.0",
      ),
    ).toThrow(/manifest of "modular-av-dock" is generated/);
  });

  it("refuses a family requirement with its own compatibility", () => {
    expect(() =>
      distManifest(
        {
          id: "modular-av-livekit",
          relationships: {
            requires: [
              { id: "modular-av", compatibility: { minimum: "0.1.0" } },
            ],
          },
        },
        "0.2.0",
      ),
    ).toThrow(/compatibility with "modular-av" is generated/);
  });
});
