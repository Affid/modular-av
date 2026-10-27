import { describe, expect, it } from "vitest";
import {
  fromConferenceError,
  fromConnectionError,
  isExpired,
} from "../src/errors.ts";

const NOW = 1_800_000_000_000;
const jwt = (exp: number): string =>
  `x.${btoa(JSON.stringify({ exp })).replace(/=+$/, "")}.y`;
const valid = { token: jwt(NOW / 1000 + 60), now: NOW };
const expired = { token: jwt(NOW / 1000 - 60), now: NOW };

describe("why Jitsi refused or dropped a connection", () => {
  it("tells an expired token from a forged one", () => {
    expect(
      fromConnectionError("connection.passwordRequired", valid),
    ).toMatchObject({
      code: "auth",
      final: true,
    });
    expect(
      fromConnectionError("connection.passwordRequired", expired),
    ).toMatchObject({
      code: "token-expired",
      final: false,
    });
  });

  it("takes other connection failures for the network", () => {
    expect(fromConnectionError("connection.droppedError", valid)).toEqual({
      code: "network",
      final: false,
    });
  });

  it.each([
    ["conference.max_users", "full", true],
    ["conference.destroyed", "room-closed", true],
    ["conference.incompatible_server_versions", "unsupported", true],
    ["conference.connectionError.notAllowed", "auth", true],
    ["conference.authenticationRequired", "auth", true],
    ["conference.iceFailed", "network", false],
    ["conference.focusLeft", "network", false],
  ])("reads %s as %s", (error, code, final) => {
    expect(fromConferenceError(error, valid)).toMatchObject({ code, final });
  });

  it("reads a token's expiry, and nothing from what isn't a JWT", () => {
    expect(isExpired(expired.token, NOW)).toBe(true);
    expect(isExpired(valid.token, NOW)).toBe(false);
    expect(isExpired("garbage", NOW)).toBe(false);
    expect(isExpired("a.!!!.c", NOW)).toBe(false);
  });
});
