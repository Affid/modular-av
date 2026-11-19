import { openPeers, type Peer } from "@modular-av/testing/contract";
import { expect, test } from "@playwright/test";
import { JITSI_OPEN_DOCKER } from "../../../../scripts/services/jitsi.ts";
import { OUTSIDER_LINE } from "./definition.ts";

/** A short outsider grace, so the notice comes within a test. */
const GRACE_MS = 3000;
/** Long enough for someone's media to have arrived, had it been shown. */
const SETTLE_MS = 4000;

/** Pages in one room: `room` in the params beats the one openPeers picks. */
const options = (
  room: string,
  extra: Readonly<Record<string, string>> = {},
) => ({
  service: "jitsi",
  params: {
    url: JITSI_OPEN_DOCKER.serviceUrl,
    domain: JITSI_OPEN_DOCKER.domain,
    muc: JITSI_OPEN_DOCKER.muc,
    access: "open",
    grace: String(GRACE_MS),
    room,
    ...extra,
  },
  secrets: {},
});

let opened: readonly Peer[] = [];

test.afterEach(async () => {
  const closing = opened;
  opened = [];
  await Promise.all(closing.map((peer) => peer.context.close()));
});

async function room(
  browser: Parameters<typeof openPeers>[0],
  stranger: Readonly<Record<string, string>>,
): Promise<[Peer, Peer, Peer]> {
  const name = `identity-${crypto.randomUUID()}`;
  const [alice, bob] = await openPeers(browser, options(name), "alice", "bob");
  const [other] = await openPeers(browser, options(name, stranger), "mallory");
  if (!alice || !bob || !other) throw new Error("no peers");
  opened = [alice, bob, other];
  return [alice, bob, other];
}

const outsiderNotice = (peer: Peer): Promise<unknown> =>
  peer.page.waitForEvent("console", {
    predicate: (message) => message.text() === OUTSIDER_LINE,
    timeout: GRACE_MS + 10_000,
  });

const shown = async (peer: Peer): Promise<string[]> =>
  (await peer.events()).flatMap((e) =>
    e.type === "participantJoined" || e.type === "trackAdded"
      ? [`${e.type}:${e.participant}`]
      : [],
  );

test("gives no place to someone whose presence names another player", async ({
  browser,
}) => {
  // Arrange: Mallory's client names Alice in its Jitsi presence; Foundry
  // (the relay) still says Mallory sent her claim.
  const [alice, bob, mallory] = await room(browser, { impersonate: "alice" });
  const notice = outsiderNotice(bob);

  // Act
  await bob.join();
  await alice.join();
  await mallory.join();
  await alice.run((h) => h.publish(["microphone"]));
  await mallory.run((h) => h.publish(["microphone", "camera"]));
  await notice;
  await bob.page.waitForTimeout(SETTLE_MS);

  // Assert
  expect(await shown(bob)).toEqual([
    "participantJoined:alice",
    "trackAdded:alice",
  ]);
});

test("keeps someone outside the world out of the call, and says so", async ({
  browser,
}) => {
  // Arrange: Eve joins the room but has no Foundry claim to make.
  const [alice, bob, eve] = await room(browser, { silent: "1" });
  const notice = outsiderNotice(bob);

  // Act
  await bob.join();
  await alice.join();
  await eve.join();
  await eve.run((h) => h.publish(["microphone", "camera"]));
  await notice;
  await bob.page.waitForTimeout(SETTLE_MS);

  // Assert
  expect(await shown(bob)).toEqual(["participantJoined:alice"]);
});
