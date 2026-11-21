import { describe, expect, it } from "vitest";
import {
  DEFAULT_HARNESS_PORT,
  harnessPort,
  harnessUrl,
} from "../src/harness/port.ts";

describe("the harness's port", () => {
  it("is 5174 unless another is named", () => {
    expect(DEFAULT_HARNESS_PORT).toBe(5174);
    expect(harnessPort({})).toBe(5174);
    expect(harnessPort({ MAV_HARNESS_PORT: "" })).toBe(5174);
  });

  it("is the one MAV_HARNESS_PORT names, so two checkouts can run their browser tests at once", () => {
    expect(harnessPort({ MAV_HARNESS_PORT: "5175" })).toBe(5175);
  });

  it.each(["harness", "80", "70000", "5175.5", "-1", " "])(
    "refuses %j: a port anyone may listen on, in whole numbers",
    (given) => {
      expect(() => harnessPort({ MAV_HARNESS_PORT: given })).toThrow(
        /MAV_HARNESS_PORT/,
      );
    },
  );

  it("is reached on the IPv6 loopback, where an unused port is refused at once", () => {
    expect(harnessUrl({})).toBe("http://[::1]:5174");
    expect(harnessUrl({ MAV_HARNESS_PORT: "5180" })).toBe("http://[::1]:5180");
  });
});
