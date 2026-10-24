import { afterEach, describe, expect, it, vi } from "vitest";
import { redact, reportError } from "../src/log.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the dock's console reports", () => {
  it("hide tokens, wherever they appear", () => {
    expect(
      redact("wss://x/rtc?access_token=abc.def&x=1 eyJhbGci.eyJzdWIi.sig"),
    ).toBe("wss://x/rtc?access_token=[token]&x=1 [token]");
  });

  it("print errors redacted, with the module's name", () => {
    const printed = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    reportError("failed with token=secret");

    expect(printed).toHaveBeenCalledWith(
      "Modular A/V: Dock | failed with token=[token]",
    );
  });
});
