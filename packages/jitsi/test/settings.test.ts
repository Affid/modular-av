import { describe, expect, it } from "vitest";
import {
  readSettings,
  registerSecretSettings,
  registerWorldSettings,
  webSocketOf,
} from "../src/settings.ts";

function fakeSettings(values: Readonly<Record<string, unknown>> = {}) {
  const registered: [string, Readonly<Record<string, unknown>>][] = [];
  return {
    registered,
    register(
      namespace: string,
      key: string,
      config: Readonly<Record<string, unknown>>,
    ) {
      registered.push([`${namespace}.${key}`, config]);
    },
    get: (_namespace: string, key: string): unknown => values[key],
  };
}

describe("where the Jitsi server is", () => {
  it.each([
    ["https://meet.example.com", "wss://meet.example.com/xmpp-websocket"],
    ["https://meet.example.com/", "wss://meet.example.com/xmpp-websocket"],
    [
      "wss://meet.example.com/xmpp-websocket",
      "wss://meet.example.com/xmpp-websocket",
    ],
    ["https://example.com/jitsi", "wss://example.com/jitsi/xmpp-websocket"],
    ["http://127.0.0.1:8000", "ws://127.0.0.1:8000/xmpp-websocket"],
    ["http://192.168.1.5", "ws://192.168.1.5/xmpp-websocket"],
  ])("reads %s as %s", (address, socket) => {
    expect(webSocketOf(address)?.href).toBe(socket);
  });

  it.each([
    ["http://meet.example.com"],
    ["ws://meet.example.com/xmpp-websocket"],
    ["https://user:pass@meet.example.com"],
    ["https://meet.example.com/?token=x"],
    ["ftp://meet.example.com"],
    ["not a url"],
    [""],
  ])("refuses %j", (address) => {
    expect(webSocketOf(address)).toBeNull();
  });

  it("takes the domains from the address unless set", () => {
    const plain = readSettings(
      fakeSettings({ serverUrl: "https://meet.example.com" }),
    );
    const docker = readSettings(
      fakeSettings({
        serverUrl: " http://127.0.0.1:8000 ",
        xmppDomain: "meet.jitsi",
        mucDomain: "muc.meet.jitsi",
      }),
    );

    expect(plain.server()).toEqual({
      serviceUrl: "wss://meet.example.com/xmpp-websocket",
      domain: "meet.example.com",
      muc: "conference.meet.example.com",
    });
    expect(docker.server()).toEqual({
      serviceUrl: "ws://127.0.0.1:8000/xmpp-websocket",
      domain: "meet.jitsi",
      muc: "muc.meet.jitsi",
    });
  });

  it("has no server for a bad address or a bad domain", () => {
    expect(readSettings(fakeSettings({})).server()).toBeNull();
    expect(
      readSettings(
        fakeSettings({
          serverUrl: "https://meet.example.com",
          xmppDomain: "a b",
        }),
      ).server(),
    ).toBeNull();
  });
});

describe("the GM's app id and secret", () => {
  it("are read only when both are there", () => {
    expect(
      readSettings(fakeSettings({ appId: "a", appSecret: "s" })).credentials(),
    ).toEqual({
      appId: "a",
      appSecret: "s",
    });
    expect(readSettings(fakeSettings({ appId: "a" })).credentials()).toBeNull();
  });

  it("live in this browser only, shown to GMs; the server in the world", () => {
    const settings = fakeSettings();

    registerWorldSettings(settings);
    registerSecretSettings(settings, false);

    expect(
      settings.registered.map(([key, config]) => [
        key,
        config.scope,
        config.config,
      ]),
    ).toEqual([
      ["modular-av-jitsi.serverUrl", "world", true],
      ["modular-av-jitsi.xmppDomain", "world", true],
      ["modular-av-jitsi.mucDomain", "world", true],
      ["modular-av-jitsi.appId", "client", false],
      ["modular-av-jitsi.appSecret", "client", false],
    ]);
  });
});
