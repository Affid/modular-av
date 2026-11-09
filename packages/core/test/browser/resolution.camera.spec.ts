import { expect, test } from "@playwright/test";
import { capturedSize } from "./captured-size.ts";

// This project's camera plays a 640x480 file and can't give anything else.
test("a camera that can't give the chosen size still opens, at its own", async ({
  page,
}) => {
  expect(await capturedSize(page, "1080p")).toBe("640x480");
});
