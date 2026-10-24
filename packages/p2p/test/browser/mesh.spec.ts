// P2P in a real browser beyond the contract: offers that cross (glare)
// and a camera that goes and comes back, over direct links.
import { expect, test } from "@playwright/test";
import { openPeers } from "@modular-av/testing/contract";

const OPTIONS = {
  service: "p2p",
  params: {},
  secrets: {},
  auth: "none",
} as const;

test("two players who join at the same moment link once and hear each other", async ({
  browser,
}) => {
  // Arrange
  const [alice, bob] = await openPeers(browser, OPTIONS, "alice", "bob");
  if (!alice || !bob) throw new Error("no peers");

  // Act
  const joined = await Promise.all([alice.join(), bob.join()]);
  await Promise.all([
    alice.run((h) => h.publish(["microphone"])),
    bob.run((h) => h.publish(["microphone"])),
  ]);

  // Assert
  expect(joined).toEqual([{ ok: true }, { ok: true }]);
  // Each reading listens for 1.5 s: allow a few while the offers settle.
  await expect
    .poll(() => alice.level("bob"), { timeout: 15_000 })
    .toBeGreaterThan(0.01);
  await expect
    .poll(() => bob.level("alice"), { timeout: 15_000 })
    .toBeGreaterThan(0.01);
  const joins = (await alice.events()).filter(
    (e) => e.type === "participantJoined",
  );
  expect(joins).toEqual([{ type: "participantJoined", participant: "bob" }]);
});

test("a camera that stops and comes back arrives on the same live track", async ({
  browser,
}) => {
  const [alice, bob] = await openPeers(browser, OPTIONS, "alice", "bob");
  if (!alice || !bob) throw new Error("no peers");
  await alice.join();
  await bob.join();
  await alice.run((h) => h.publish(["camera"]));
  const camera = () =>
    bob.run((h) => h.remoteTracks().map((t) => `${t.source}:${t.readyState}`));
  await expect.poll(camera).toEqual(["camera:live"]);

  await alice.run((h) => h.unpublish("camera"));
  await expect.poll(camera).toEqual([]);
  await alice.run((h) => h.republish("camera"));

  await expect.poll(camera).toEqual(["camera:live"]);
  await expect
    .poll(() => bob.run((h) => h.videoBrightness("alice")))
    .toBeGreaterThan(20);
});
