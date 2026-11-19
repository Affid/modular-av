import { describe, expect, it } from "vitest";
import { redact } from "../src/redact.ts";

describe("what the module's log lines leave out", () => {
  it.each([
    [
      "a token in a URL",
      "wss://x/xmpp-websocket?token=eyJhbGci.eyJzdWIi.c2ln&x=1",
      "wss://x/xmpp-websocket?token=[token]&x=1",
    ],
    [
      "a token on its own",
      "bad eyJhbGci.eyJzdWIi.c2ln here",
      "bad [token] here",
    ],
    ["a jwt parameter", "https://m/room?jwt=abc", "https://m/room?jwt=[token]"],
    [
      "an open server's room in its WebSocket address",
      "wss://m/xmpp-websocket?room=ourtable-secret",
      "wss://m/xmpp-websocket?room=[room]",
    ],
    [
      "the room in an XMPP address, as lib-jitsi-meet logs it",
      "Joining ourtable-secret@muc.meet.jitsi/ab12cd34",
      "Joining [name]@muc.meet.jitsi/ab12cd34",
    ],
    [
      "the room in a quoted XMPP address",
      'focus said "ourtable-secret@conference.meet.example.com"',
      'focus said "[name]@conference.meet.example.com"',
    ],
  ])("leaves out %s", (_, line, expected) => {
    expect(redact(line)).toBe(expected);
  });

  it("keeps a line with nothing to leave out", () => {
    const line = "Strophe: connection failed (network) after 3 tries";

    expect(redact(line)).toBe(line);
  });
});
