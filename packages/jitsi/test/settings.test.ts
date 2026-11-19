import { describe, expect, it } from "vitest";
import { serverOf, webSocketOf } from "../src/server-address.ts";
import {
  readSettings,
  registerSecretSettings,
  registerWorldSettings,
} from "../src/settings.ts";

/** The deployment the settings name, read as the service reads it. */
const serverFrom = (values: Readonly<Record<string, unknown>>) =>
  serverOf(readSettings(fakeSettings(values)).serverSettings());

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
    const plain = serverFrom({ serverUrl: "https://meet.example.com" });
    const docker = serverFrom({
      serverUrl: " http://127.0.0.1:8000 ",
      xmppDomain: "meet.jitsi",
      mucDomain: "muc.meet.jitsi",
    });

    expect(plain).toEqual({
      serviceUrl: "wss://meet.example.com/xmpp-websocket",
      domain: "meet.example.com",
      muc: "conference.meet.example.com",
    });
    expect(docker).toEqual({
      serviceUrl: "ws://127.0.0.1:8000/xmpp-websocket",
      domain: "meet.jitsi",
      muc: "muc.meet.jitsi",
    });
  });

  it("has no server for a bad address or a bad domain", () => {
    expect(serverFrom({})).toBeNull();
    expect(
      serverFrom({ serverUrl: "https://meet.example.com", xmppDomain: "a b" }),
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
      ["modular-av-jitsi.access", "world", true],
      ["modular-av-jitsi.serverUrl", "world", true],
      ["modular-av-jitsi.xmppDomain", "world", true],
      ["modular-av-jitsi.mucDomain", "world", true],
      ["modular-av-jitsi.appId", "client", false],
      ["modular-av-jitsi.appSecret", "client", false],
    ]);
  });
});

describe("a GM changing where the call is", () => {
  it("has everyone reload, so nobody stays behind in the old call", () => {
    // Arrange
    const settings = fakeSettings();

    // Act
    registerWorldSettings(settings);
    registerSecretSettings(settings, true);

    // Assert: the GM's own key is read again for each token.
    expect(
      settings.registered.map(([key, config]) => [
        key,
        config.requiresReload === true,
      ]),
    ).toEqual([
      ["modular-av-jitsi.access", true],
      ["modular-av-jitsi.serverUrl", true],
      ["modular-av-jitsi.xmppDomain", true],
      ["modular-av-jitsi.mucDomain", true],
      ["modular-av-jitsi.appId", false],
      ["modular-av-jitsi.appSecret", false],
    ]);
  });
});

describe("how players get into the Jitsi server", () => {
  it("is with tokens unless a GM chose an open server", () => {
    expect(readSettings(fakeSettings({})).access()).toBe("token");
    expect(readSettings(fakeSettings({ access: "other" })).access()).toBe(
      "token",
    );
    expect(readSettings(fakeSettings({ access: "open" })).access()).toBe(
      "open",
    );
  });

  it("offers the two choices, tokens first", () => {
    const settings = fakeSettings();

    registerWorldSettings(settings);

    const access = settings.registered.find(
      ([key]) => key === "modular-av-jitsi.access",
    )?.[1];
    expect(access?.default).toBe("token");
    expect(Object.keys(access?.choices ?? {})).toEqual(["token", "open"]);
  });

  it("tells the caller when the access or the address changes", () => {
    const settings = fakeSettings();
    let changes = 0;

    registerWorldSettings(settings, () => {
      changes += 1;
    });
    for (const [key, config] of settings.registered)
      if (typeof config.onChange === "function")
        (config.onChange as (value: unknown) => void)(key);

    expect(changes).toBe(2);
  });
});

describe("an open server", () => {
  const open = (values: Readonly<Record<string, unknown>>) =>
    serverFrom({ access: "open", ...values });

  it("joins the link's room, pinned to its shard, trying Docker's names next", () => {
    expect(open({ serverUrl: "https://meet.example.com/OurTable" })).toEqual({
      serviceUrl: "wss://meet.example.com/xmpp-websocket?room=ourtable",
      domain: "meet.example.com",
      muc: "conference.meet.example.com",
      open: {
        room: "ourtable",
        fallback: { domain: "meet.jitsi", muc: "muc.meet.jitsi" },
      },
    });
  });

  it("tries nothing else when the domains are given", () => {
    expect(
      open({
        serverUrl: "http://127.0.0.1:8001/table",
        xmppDomain: "meet.jitsi",
        mucDomain: "muc.meet.jitsi",
      }),
    ).toEqual({
      serviceUrl: "ws://127.0.0.1:8001/xmpp-websocket?room=table",
      domain: "meet.jitsi",
      muc: "muc.meet.jitsi",
      open: { room: "table" },
    });
  });

  it("has no server without a room or with a room it can't name", () => {
    expect(open({ serverUrl: "https://meet.example.com" })).toBeNull();
    expect(open({ serverUrl: "https://meet.example.com/a%20b" })).toBeNull();
    expect(open({})).toBeNull();
  });

  it("needs no app id and secret", () => {
    expect(
      readSettings(
        fakeSettings({ access: "open", appId: "a", appSecret: "s" }),
      ).credentials(),
    ).toBeNull();
  });
});
