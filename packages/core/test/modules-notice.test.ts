// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { noServiceIsDue } from "../src/modules/menu.ts";
import { noServiceContent } from "../src/modules/notice.ts";
import en from "../lang/en.json" with { type: "json" };

function localize(key: string): string {
  const found = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      en,
    );
  return typeof found === "string" ? found : key;
}

const game = (isGM: boolean, dismissed: boolean) =>
  ({
    user: { isGM },
    settings: { get: () => dismissed },
  }) as never;

describe("the notice when no service is enabled", () => {
  it("is for a GM, until they say not to remind them", () => {
    expect(noServiceIsDue(game(true, false), 0)).toBe(true);
    expect(noServiceIsDue(game(true, false), 1)).toBe(false);
    expect(noServiceIsDue(game(false, false), 0)).toBe(false);
    expect(noServiceIsDue(game(true, true), 0)).toBe(false);
  });

  it("names the services and what each needs", () => {
    const content = noServiceContent(document, localize);

    expect(content.textContent).toContain("Nobody can join a call");
    expect(
      [...content.querySelectorAll("li")].map((li) => li.textContent),
    ).toEqual([
      "LiveKit: Calls over LiveKit Cloud or your own LiveKit server. Most tables.",
      "Peer to peer: No server: players' browsers link to each other. Best up to 6 players.",
      "Jitsi Meet: Your own Jitsi Meet server, with token sign-in.",
    ]);
  });
});
