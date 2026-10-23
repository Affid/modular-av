import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import type {
  JoinOptions,
  JoinResult,
  RecordedEvent,
  ServiceHarness,
} from "../harness/service-types.ts";

/**
 * The service contract (handoff §3 "Testing per module"), run against a
 * real server: one browser context per player, each driving a connection
 * through the service harness page the way the core does.
 */
export interface ServiceContractOptions {
  /** The service's package directory, e.g. "livekit". */
  readonly service: string;
  /** Passed to its `test/service/definition.ts` (URL, dev keys…). */
  readonly params: Readonly<Record<string, string>>;
  /**
   * Cuts every client off the server, then restores it (e.g. by pausing
   * its container): the browser's offline mode keeps open localhost sockets.
   */
  readonly outage: {
    readonly start: () => Promise<void>;
    readonly end: () => Promise<void>;
  };
}

const BOTH = { audio: true, video: true } as const;
const AUDIBLE = 0.01;
const SILENT = 0.002;

export interface Peer {
  readonly id: string;
  readonly page: Page;
  readonly context: BrowserContext;
  run<T>(fn: (h: ServiceHarness) => T | Promise<T>): Promise<T>;
  join(options?: Partial<JoinOptions>): Promise<JoinResult>;
  events(): Promise<RecordedEvent[]>;
}

async function openPeer(
  browser: Browser,
  options: ServiceContractOptions,
  id: string,
  room: string,
): Promise<Peer> {
  const context = await browser.newContext({
    permissions: ["camera", "microphone"],
  });
  const page = await context.newPage();
  const query = new URLSearchParams({
    service: options.service,
    ...options.params,
  });
  await page.goto(`/service.html?${query.toString()}`);
  await page.waitForFunction(() => window.serviceHarness !== undefined);
  const run = <T>(fn: (h: ServiceHarness) => T | Promise<T>): Promise<T> =>
    page.evaluate(async (source) => {
      const h = window.serviceHarness;
      if (!h) throw new Error("No service harness");
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- Playwright ships the function as text
      const call = new Function("h", `return (${source})(h);`) as (
        harness: ServiceHarness,
      ) => Promise<T>;
      return call(h);
    }, fn.toString());
  return {
    id,
    page,
    context,
    run,
    join: (join = {}) =>
      page.evaluate(
        (o) => {
          const h = window.serviceHarness;
          if (!h) throw new Error("No service harness");
          return h.join(o);
        },
        {
          participant: id,
          room,
          canPublish: BOTH,
          ttlSeconds: 600,
          ...join,
        },
      ),
    events: () => run((h) => h.events()),
  };
}

const states = (events: readonly RecordedEvent[]): string[] =>
  events.flatMap((e) => (e.type === "state" ? [e.state] : []));

export function serviceContract(options: ServiceContractOptions): void {
  let rooms = 0;
  const peers = async (browser: Browser, ...ids: string[]): Promise<Peer[]> => {
    const room = `contract-${String(Date.now())}-${String(rooms++)}`;
    return Promise.all(ids.map((id) => openPeer(browser, options, id, room)));
  };

  test.describe(`service contract: ${options.service}`, () => {
    test.describe.configure({ mode: "parallel" });

    test("joins with a relayed token and sees the others", async ({
      browser,
    }) => {
      const [alice, bob] = await peers(browser, "alice", "bob");
      if (!alice || !bob) throw new Error("no peers");

      expect(await alice.join()).toEqual({ ok: true });
      expect(await bob.join()).toEqual({ ok: true });

      await expect
        .poll(() => alice.events())
        .toContainEqual({ type: "participantJoined", participant: "bob" });
      await expect
        .poll(() => bob.events())
        .toContainEqual({ type: "participantJoined", participant: "alice" });
    });

    test("carries microphone and camera to the others", async ({ browser }) => {
      const [alice, bob] = await peers(browser, "alice", "bob");
      if (!alice || !bob) throw new Error("no peers");
      await alice.join();
      await bob.join();

      expect(
        await alice.run((h) => h.publish(["microphone", "camera"])),
      ).toEqual([]);

      await expect
        .poll(() =>
          bob.run((h) =>
            h
              .remoteTracks()
              .map((t) => `${t.participant}:${t.source}:${t.readyState}`)
              .sort(),
          ),
        )
        .toEqual(["alice:camera:live", "alice:microphone:live"]);
      await expect
        .poll(() => bob.run((h) => h.audioLevel("alice", 1500)))
        .toBeGreaterThan(AUDIBLE);
      await expect
        .poll(() => bob.run((h) => h.videoBrightness("alice")))
        .toBeGreaterThan(20);
    });

    test("keeps the core's mute: silence and black, then back", async ({
      browser,
    }) => {
      const [alice, bob] = await peers(browser, "alice", "bob");
      if (!alice || !bob) throw new Error("no peers");
      await alice.join();
      await bob.join();
      await alice.run((h) => h.publish(["microphone", "camera"]));
      await expect
        .poll(() => bob.run((h) => h.audioLevel("alice", 1500)))
        .toBeGreaterThan(AUDIBLE);

      await alice.run(async (h) => {
        h.setEnabled("microphone", false);
        h.setEnabled("camera", false);
        await h.setMuted("microphone", true);
        await h.setMuted("camera", true);
      });

      expect(
        await alice.run((h) => h.localTracks().map((t) => t.enabled)),
      ).toEqual([false, false]);
      await expect
        .poll(() => bob.run((h) => h.audioLevel("alice", 1500)))
        .toBeLessThan(SILENT);
      await alice.run(async (h) => {
        h.setEnabled("microphone", true);
        await h.setMuted("microphone", false);
      });
      await expect
        .poll(() => bob.run((h) => h.audioLevel("alice", 1500)))
        .toBeGreaterThan(AUDIBLE);
    });

    test("pauses and resumes a refused track without losing it", async ({
      browser,
    }) => {
      const [alice, bob] = await peers(browser, "alice", "bob");
      if (!alice || !bob) throw new Error("no peers");
      await alice.join();
      await bob.join();
      await alice.run((h) => h.publish(["microphone"]));
      await expect
        .poll(() => bob.run((h) => h.audioLevel("alice", 1500)))
        .toBeGreaterThan(AUDIBLE);

      await bob.run((h) => {
        h.setSubscription("alice", "microphone", false);
      });
      await expect
        .poll(() => bob.run((h) => h.audioLevel("alice", 1500)))
        .toBeLessThan(SILENT);
      expect(
        await bob.run((h) => h.remoteTracks().map((t) => t.source)),
      ).toEqual(["microphone"]);
      await bob.run((h) => {
        h.setSubscription("alice", "microphone", true);
      });

      await expect
        .poll(() => bob.run((h) => h.audioLevel("alice", 1500)))
        .toBeGreaterThan(AUDIBLE);
    });

    test("refuses publishing outside the token's rights", async ({
      browser,
    }) => {
      const [alice, bob] = await peers(browser, "alice", "bob");
      if (!alice || !bob) throw new Error("no peers");
      await alice.join({ canPublish: { audio: true, video: false } });
      await bob.join();

      const failures = await alice.run((h) =>
        h.publish(["microphone", "camera"]),
      );

      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatch(/^camera:/);
      await expect
        .poll(() => bob.run((h) => h.remoteTracks().map((t) => t.source)))
        .toEqual(["microphone"]);
    });

    test("ends the older connection of a duplicate identity for good", async ({
      browser,
    }) => {
      const [older, newer] = await peers(browser, "alice", "alice");
      if (!older || !newer) throw new Error("no peers");
      await older.join();

      expect(await newer.join()).toEqual({ ok: true });

      await expect
        .poll(async () =>
          (await older.events()).filter((e) => e.type === "state").at(-1),
        )
        .toEqual({
          type: "state",
          state: "failed",
          code: "duplicate",
          final: true,
        });
    });

    test("refuses a forged token for good, an expired one for a retry", async ({
      browser,
    }) => {
      const [alice] = await peers(browser, "alice");
      if (!alice) throw new Error("no peers");

      const forged = await alice.join({ token: "e30.e30.c2ln" });
      const expired = await alice.run((h) =>
        h.sign({
          participant: "alice",
          room: "x",
          canPublish: { audio: true, video: true },
          ttlSeconds: -60,
        }),
      );
      const late = await alice.join({ token: expired });

      expect(forged).toMatchObject({ ok: false, code: "auth", final: true });
      expect(late).toMatchObject({
        ok: false,
        code: "token-expired",
        final: false,
      });
    });

    test("leaves on purpose: no error, the others see it", async ({
      browser,
    }) => {
      const [alice, bob] = await peers(browser, "alice", "bob");
      if (!alice || !bob) throw new Error("no peers");
      await alice.join();
      await bob.join();
      await alice.run((h) => h.publish(["microphone", "camera"]));

      await alice.run((h) => h.leave());

      expect(states(await alice.events()).at(-1)).toBe("disconnected");
      expect(
        await alice.run((h) => h.localTracks().map((t) => t.readyState)),
      ).toEqual(["live", "live"]);
      await expect
        .poll(() => bob.events())
        .toContainEqual({ type: "participantLeft", participant: "alice" });
    });

    // Cuts off every client of the shared server: runs alone, last
    // (the "outage" project in playwright.services.config.ts).
    test("recovers from a 20 s outage by itself, reporting resuming @outage", async ({
      browser,
    }) => {
      test.setTimeout(150_000);
      const [alice, bob] = await peers(browser, "alice", "bob");
      if (!alice || !bob) throw new Error("no peers");
      await alice.join();
      await bob.join();
      await alice.run((h) => h.publish(["microphone"]));

      await options.outage.start();
      try {
        await expect
          .poll(async () => states(await alice.events()), { timeout: 30_000 })
          .toContain("resuming");
        await alice.page.waitForTimeout(20_000);
      } finally {
        await options.outage.end();
      }

      // Either the transport came back by itself, or the service gave up
      // once ("lost") and leaves the retry to the core: never both.
      await expect
        .poll(async () => states(await alice.events()).at(-1), {
          timeout: 60_000,
        })
        .toMatch(/^(connected|lost)$/);
      const seen = states(await alice.events());
      expect(seen.filter((s) => s === "lost").length).toBeLessThanOrEqual(1);
      expect(seen.slice(seen.indexOf("resuming"))).not.toContain("failed");
    });
  });
}
