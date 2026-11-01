import {
  checkTail,
  directPeak,
  DRY_LEAK,
  IDLE_BUDGET,
  idleShare,
  openEffects,
  TAIL_END,
  tailEffectContract,
  wetOnly,
} from "@modular-av/testing/contract/tail-effects";
import { expect, test } from "@playwright/test";

const QUERY = "module=core&service=mock&effects=test";

tailEffectContract({
  modules: "core",
  query: "&effects=test",
  effects: ["test-echo", "test-hosted"],
});

test("the contract wants wet only of what a player would put on a send", () => {
  const declared = { tail: 0, latency: 0 };

  expect(wetOnly({ ...declared, place: "send" })).toBe(true);
  expect(wetOnly({ ...declared, place: "post-gate", tail: 2 })).toBe(true);
  expect(wetOnly({ ...declared, place: "post-gate" })).toBe(false);
});

test("the contract fails an effect that works on silence", async ({ page }) => {
  await openEffects(page, QUERY);

  expect(await idleShare(page, "test-bad-busy")).toBeGreaterThan(IDLE_BUDGET);
});

test("the contract fails a tail longer than the effect says", async ({
  page,
}) => {
  await openEffects(page, QUERY);

  const { peak, afterTail } = await checkTail(page, "test-bad-liar");

  expect(afterTail).toBeGreaterThan(peak * TAIL_END);
});

test("the contract fails a send effect that passes the voice on", async ({
  page,
}) => {
  await openEffects(page, QUERY);

  expect(await directPeak(page, "test-bad-leaky")).toBeGreaterThan(DRY_LEAK);
});
