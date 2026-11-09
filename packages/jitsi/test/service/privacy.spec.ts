import { openPeers, type Peer } from "@modular-av/testing/contract";
import { expect, test } from "@playwright/test";
import { JITSI_DOCKER } from "../../../../scripts/services/jitsi.ts";

const OPTIONS = {
  service: "jitsi",
  params: {
    url: JITSI_DOCKER.serviceUrl,
    domain: JITSI_DOCKER.domain,
    muc: JITSI_DOCKER.muc,
  },
  secrets: { appId: JITSI_DOCKER.appId, appSecret: JITSI_DOCKER.appSecret },
};

let opened: readonly Peer[] = [];

// A page left open keeps its camera, and Chrome gives every later capture
// in this browser that camera's size.
test.afterEach(async () => {
  const closing = opened;
  opened = [];
  await Promise.all(closing.map((peer) => peer.context.close()));
});

test("talks only to the Jitsi server and the page's own origin", async ({
  browser,
}) => {
  // Arrange
  const peers = await openPeers(browser, OPTIONS, "alice", "bob");
  opened = peers;
  const [alice, bob] = peers;
  if (!alice || !bob) throw new Error("no peers");
  const own = new URL(alice.page.url()).host;
  const hosts = new Set<string>();
  for (const peer of [alice, bob]) {
    peer.page.on("request", (request) =>
      hosts.add(new URL(request.url()).host),
    );
    peer.page.on("websocket", (socket) =>
      hosts.add(new URL(socket.url()).host),
    );
  }

  // Act
  await alice.join();
  await bob.join();
  await alice.run((h) => h.publish(["microphone", "camera"]));
  await expect
    .poll(() => bob.run((h) => h.audioLevel("alice", 1000)))
    .toBeGreaterThan(0.01);

  // Assert
  expect([...hosts].filter((h) => h !== own)).toEqual([
    new URL(JITSI_DOCKER.web).host,
  ]);
});
