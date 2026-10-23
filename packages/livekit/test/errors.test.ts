import { ConnectionError, DisconnectReason } from "livekit-client";
import { describe, expect, it } from "vitest";
import { fromConnectError, fromDisconnectReason } from "../src/errors.ts";
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
