import { describe, expect, it } from "vitest";
import { serverProblemOf } from "../src/server-address.ts";
import type { ServerSettings } from "../src/settings.ts";

const settings = (
  access: ServerSettings["access"],
  serverUrl: string,
  domains: Partial<Pick<ServerSettings, "xmppDomain" | "mucDomain">> = {},
): ServerSettings => ({
  access,
  serverUrl,
  xmppDomain: domains.xmppDomain ?? "",
  mucDomain: domains.mucDomain ?? "",
});

describe("why the settings name no Jitsi server, as the log says", () => {
  it.each([
    ["no address", settings("token", ""), /^Set the Jitsi server/],
    [
      "plain http to a public host",
      settings("token", "http://meet.example.com"),
      /server address .* https:\/\//,
    ],
    [
      "page settings after the address",
      settings("token", "https://meet.example.com/?x=1"),
      /nothing after \? or #/,
    ],
    [
      "a domain it can't use",
      settings("token", "https://meet.example.com", { xmppDomain: "a b" }),
      /XMPP and conference domains/,
    ],
  ])("with tokens: %s", (_, given, why) => {
    expect(serverProblemOf(given)).toMatch(why);
  });

  it.each([
    ["no link", settings("open", ""), /^Set the Jitsi room link/],
    [
      "plain http to a public host",
      settings("open", "http://meet.example.com/table"),
      /room link .* https:\/\//,
    ],
    [
      "a room it can't name",
      settings("open", "https://meet.example.com/a%20b"),
      /room in the Jitsi room link .* letters, digits/,
    ],
    [
      "no room yet",
      settings("open", "https://meet.example.com"),
      /names no room/,
    ],
    [
      "a domain it can't use",
      settings("open", "https://meet.example.com/table", { mucDomain: "x y" }),
      /XMPP and conference domains/,
    ],
  ])("on an open server: %s", (_, given, why) => {
    expect(serverProblemOf(given)).toMatch(why);
  });

  it("is nothing when the settings name a server", () => {
    expect(
      serverProblemOf(settings("token", "https://meet.example.com")),
    ).toBeNull();
    expect(
      serverProblemOf(settings("open", "https://meet.example.com/table")),
    ).toBeNull();
  });
});
