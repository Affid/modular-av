import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, redact } from "../src/log.ts";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwMSJ9.c2lnbmF0dXJlLXNpZ25hdHVyZQ";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logging", () => {
  it("never prints a token, in the message or the stack", () => {
    // Arrange
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error(
      `bad token ${JWT} for ws://host/?access_token=${JWT}`,
    );

    // Act
    logError(error);

    // Assert
    const printed = spy.mock.calls.flat().map(String).join(" ");
    expect(printed).not.toContain(JWT);
    expect(printed).toContain("bad token [token]");
  });

  it("keeps the cause chain and prints non-errors as text", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logError(new Error("outer", { cause: new Error(`inner ${JWT}`) }));
    logError("plain");

    const printed = spy.mock.calls.flat().map(String).join(" ");
    expect(printed).toContain("inner [token]");
    expect(printed).toContain("plain");
  });

  it("redacts query tokens and JWTs", () => {
    expect(redact(`x?token=abc.def&y=1 ${JWT}`)).toBe(
      "x?token=[token]&y=1 [token]",
    );
  });
});
