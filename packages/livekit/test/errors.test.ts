import { ConnectionError, DisconnectReason } from "livekit-client";
import { describe, expect, it } from "vitest";
import {
  fromConnectError,
  fromDisconnectReason,
  isExpired,
} from "../src/errors.ts";
import { signLiveKitToken } from "../src/token.ts";
import { LiveKitServiceError } from "../src/failure.ts";

describe("LiveKit disconnect reasons", () => {
  it.each([
    [DisconnectReason.DUPLICATE_IDENTITY, "duplicate"],
    [DisconnectReason.PARTICIPANT_REMOVED, "kicked"],
    [DisconnectReason.ROOM_DELETED, "room-closed"],
    [DisconnectReason.ROOM_CLOSED, "room-closed"],
  ])("ends the session for reason %s", (reason, code) => {
    expect(fromDisconnectReason(reason)).toMatchObject({ code, final: true });
  });

  it.each([
    DisconnectReason.SIGNAL_CLOSE,
    DisconnectReason.CONNECTION_TIMEOUT,
    DisconnectReason.SERVER_SHUTDOWN,
    DisconnectReason.STATE_MISMATCH,
    undefined,
  ])("treats reason %s as a lost connection", (reason) => {
    expect(fromDisconnectReason(reason)).toEqual({
      code: "network",
      final: false,
    });
  });

  it("ignores leaving on purpose", () => {
    expect(fromDisconnectReason(DisconnectReason.CLIENT_INITIATED)).toBeNull();
  });
});

describe("LiveKit connect errors", () => {
  it("ends on a refused token or a wrong URL, retries otherwise", () => {
    expect(
      fromConnectError(ConnectionError.notAllowed("no", 401)),
    ).toMatchObject({ code: "auth", final: true });
    expect(
      fromConnectError(ConnectionError.serviceNotFound("x", "v0-rtc")),
    ).toMatchObject({ code: "unsupported", final: true });
    expect(fromConnectError(ConnectionError.serverUnreachable("x"))).toEqual({
      code: "network",
      final: false,
    });
    expect(
      fromConnectError(
        ConnectionError.notAllowed("invalid token: token is expired", 401),
      ),
    ).toMatchObject({ code: "token-expired", final: false });
    expect(fromConnectError(new Error("other"))).toEqual({
      code: "network",
      final: false,
    });
  });

  it("carries the reason for the core", () => {
    const cause = new Error("401");
    const error = new LiveKitServiceError(
      { code: "auth", final: true },
      { cause },
    );

    expect(error.serviceError.code).toBe("auth");
    expect(error.message).toBe("auth");
    expect(error.cause).toBe(cause);
  });
});

describe("expired tokens, whatever the server says", () => {
  const sign = (ttlSeconds: number) =>
    signLiveKitToken(
      {
        participant: "p1",
        room: "r",
        canPublish: { audio: true, video: true },
        ttlSeconds,
      },
      { apiKey: "k", apiSecret: "s" },
      Date.now(),
    );

  it("reads the token's own expiry", async () => {
    expect(isExpired(await sign(-60), Date.now())).toBe(true);
    expect(isExpired(await sign(60), Date.now())).toBe(false);
    expect(isExpired("not.a.jwt", Date.now())).toBe(false);
    expect(isExpired("garbage", Date.now())).toBe(false);
  });

  it("asks for a retry when LiveKit Cloud refuses an expired token", async () => {
    const refused = ConnectionError.notAllowed("invalid token", 401);

    expect(
      fromConnectError(refused, { token: await sign(-60), now: Date.now() }),
    ).toMatchObject({ code: "token-expired", final: false });
    expect(
      fromConnectError(refused, { token: await sign(60), now: Date.now() }),
    ).toMatchObject({ code: "auth", final: true });
  });
});
