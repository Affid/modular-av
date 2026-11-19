import { describe, expect, it } from "vitest";
import {
  normalizeAddress,
  parseOpenAddress,
  randomRoom,
} from "../src/open-link.ts";

const parsed = (address: string): unknown => {
  const result = parseOpenAddress(address);
  return result.ok
    ? { socket: result.socket.href, room: result.room }
    : result.problem;
};

describe("an open server's address or room link", () => {
  it.each([
    [
      "https://meet.example.com/OurTable",
      { socket: "wss://meet.example.com/xmpp-websocket", room: "ourtable" },
    ],
    [
      "https://meet.example.com/our_table-2/",
      { socket: "wss://meet.example.com/xmpp-websocket", room: "our_table-2" },
    ],
    [
      "https://meet.example.com",
      { socket: "wss://meet.example.com/xmpp-websocket", room: null },
    ],
    [
      "wss://meet.example.com/xmpp-websocket",
      { socket: "wss://meet.example.com/xmpp-websocket", room: null },
    ],
    [
      "https://example.com/jitsi/table",
      { socket: "wss://example.com/jitsi/xmpp-websocket", room: "table" },
    ],
    [
      "https://meet.example.com/Table?lang=de#config.prejoinConfig.enabled=false",
      { socket: "wss://meet.example.com/xmpp-websocket", room: "table" },
    ],
    [
      "http://127.0.0.1:8001/table",
      { socket: "ws://127.0.0.1:8001/xmpp-websocket", room: "table" },
    ],
  ])("reads %s", (address, expected) => {
    expect(parsed(address)).toEqual(expected);
  });

  it.each([
    ["http://meet.example.com/table", "address"],
    ["https://user:pass@meet.example.com/table", "address"],
    ["ftp://meet.example.com/table", "address"],
    ["not a url", "address"],
    ["", "address"],
    ["https://meet.example.com/Our%20Table", "room"],
    ["https://meet.example.com/%E2%82%AC", "room"],
    ["https://meet.example.com/%E0%A4%A", "room"],
    [`https://meet.example.com/${"a".repeat(129)}`, "room"],
  ])("refuses %j (%s)", (address, problem) => {
    expect(parsed(address)).toBe(problem);
  });
});

describe("the address a GM saves", () => {
  const room = (): string => "generatedroom";

  it("gets a random room on an open server when it has none", () => {
    expect(normalizeAddress("https://meet.example.com", true, room)).toEqual({
      value: "https://meet.example.com/generatedroom",
      removedToken: false,
    });
    expect(
      normalizeAddress("https://example.com/jitsi/xmpp-websocket", true, room),
    ).toEqual({
      value: "https://example.com/jitsi/generatedroom",
      removedToken: false,
    });
  });

  it("is left as it is when nothing is missing or wrong", () => {
    for (const [value, open] of [
      ["https://meet.example.com/table", true],
      ["https://meet.example.com", false],
      ["not a url", true],
      ["", true],
      ["https://meet.example.com/Our%20Table", true],
    ] as const)
      expect(normalizeAddress(value, open, room)).toEqual({
        value,
        removedToken: false,
      });
  });

  it("loses a token in its link, with or without an open server", () => {
    expect(
      normalizeAddress(
        "https://meet.example.com/table?jwt=eyJx.eyJy.sig&lang=de",
        true,
        room,
      ),
    ).toEqual({
      value: "https://meet.example.com/table?lang=de",
      removedToken: true,
    });
    expect(
      normalizeAddress("https://meet.example.com/?token=abc", false, room),
    ).toEqual({ value: "https://meet.example.com/", removedToken: true });
  });

  it.each([
    [
      "https://meet.example.com/table?JWT=eyJx",
      "https://meet.example.com/table",
    ],
    [
      "https://meet.example.com/table?access_token=abc&lang=de",
      "https://meet.example.com/table?lang=de",
    ],
    [
      "https://meet.example.com/table#jwt=eyJx&config.startWithAudioMuted=true",
      "https://meet.example.com/table",
    ],
    [
      "https://meet.example.com/table?lang=de#Token=abc",
      "https://meet.example.com/table?lang=de",
    ],
  ])("loses a token however it is written: %s", (value, safe) => {
    expect(normalizeAddress(value, true, room)).toEqual({
      value: safe,
      removedToken: true,
    });
  });

  it("keeps a hash that holds no token", () => {
    const value =
      "https://meet.example.com/table#config.prejoinConfig.enabled=false";

    expect(normalizeAddress(value, true, room)).toEqual({
      value,
      removedToken: false,
    });
  });

  it("does both at once, and a second pass changes nothing", () => {
    const first = normalizeAddress(
      "https://meet.example.com/?jwt=x",
      true,
      room,
    );

    expect(first).toEqual({
      value: "https://meet.example.com/generatedroom",
      removedToken: true,
    });
    expect(normalizeAddress(first.value, true, room)).toEqual({
      value: first.value,
      removedToken: false,
    });
  });
});

describe("a random room", () => {
  it("is long, plain and different each time", () => {
    const rooms = new Set(Array.from({ length: 50 }, randomRoom));

    expect(rooms.size).toBe(50);
    for (const room of rooms) expect(room).toMatch(/^[a-z2-7]{20}$/);
  });
});
