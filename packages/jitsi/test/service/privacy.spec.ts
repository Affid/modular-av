import { openPeers } from "@modular-av/testing/contract";
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

test("talks only to the Jitsi server and the page's own origin", async ({
  browser,
}) => {
  // Arrange
  const [alice, bob] = await openPeers(browser, OPTIONS, "alice", "bob");
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
