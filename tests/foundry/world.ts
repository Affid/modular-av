// Helpers for the end-to-end tests in the local Foundry world: players are
// browser contexts with fake devices, read and drive the core through its
// public API on `game.modules.get("modular-av").api`.
import type { AVState, ModularAV } from "@modular-av/api";
import { type Browser, expect, type Page } from "@playwright/test";
import { loadFoundryEnv } from "../../scripts/foundry/env.ts";
import { joinAs } from "../../scripts/foundry/session.ts";
import { livekitTarget } from "../../scripts/services/livekit.ts";

export const FOUNDRY_URL = loadFoundryEnv().url;

/** `core.rtcWorldSettings.mode`: audio and video. */
const AUDIO_VIDEO = 3;

export interface Player {
  readonly name: string;
  readonly page: Page;
  /** Console errors: none are expected. */
  readonly notices: string[];
  /** Every console message, where Foundry also logs its notifications. */
  readonly messages: string[];
  state(): Promise<AVState>;
  /** Runs `fn(api, game)` in the page; `fn` must not capture variables. */
  run<A, T>(
    fn: (api: ModularAV, game: FoundryGameish, arg: A) => T | Promise<T>,
    arg: A,
  ): Promise<T>;
  close(): Promise<void>;
}

/** The parts of Foundry's `game` the tests touch. */
export interface FoundryGameish {
  readonly userId: string;
  readonly users: { getName(name: string): { id: string } | undefined };
  readonly settings: {
    get(ns: string, key: string): unknown;
    set(ns: string, key: string, value: unknown): Promise<unknown>;
  };
  readonly webrtc: {
    readonly settings: {
      set(scope: "client" | "world", path: string, value: unknown): void;
    };
    readonly client: Record<string, unknown>;
    _initializeUserVoiceDetection(mode: string): void;
  };
}

export async function openPlayer(
  browser: Browser,
  name: string,
): Promise<Player> {
  const page = await joinAs(browser, FOUNDRY_URL, name, {
    permissions: ["camera", "microphone"],
  });
  return wrap(page, name);
}

/** Another tab of the same browser session: the same user, logged in. */
export async function openSecondTab(player: Player): Promise<Player> {
  const page = await player.page.context().newPage();
  await page.goto(`${FOUNDRY_URL}/game`);
  await page.waitForFunction(
    () => (globalThis as { game?: { ready?: boolean } }).game?.ready === true,
    null,
    { timeout: 60_000 },
  );
  const tab = wrap(page, player.name);
  return { ...tab, close: () => page.close() };
}

function wrap(page: Page, name: string): Player {
  const notices: string[] = [];
  const messages: string[] = [];
  page.on("requestfailed", (request) => {
    messages.push(
      `request failed: ${new URL(request.url()).pathname} ${request.failure()?.errorText ?? ""}`,
    );
  });
  page.on("console", (message) => {
    messages.push(message.text().trim());
    if (message.type() === "error") notices.push(`console: ${message.text()}`);
  });
  const run: Player["run"] = (fn, arg) =>
    page.evaluate(
      ({ source, value }) => {
        const g = globalThis as unknown as {
          game: { modules: { get(id: string): { api: unknown } | undefined } };
        };
        const api = g.game.modules.get("modular-av")?.api;
        // eslint-disable-next-line @typescript-eslint/no-implied-eval -- Playwright ships the function as text
        const call = new Function(
          "api",
          "game",
          "arg",
          `return (${source})(api, game, arg);`,
        ) as (a: unknown, b: unknown, c: unknown) => unknown;
        return call(api, g.game, value) as never;
      },
      { source: fn.toString(), value: arg },
    );
  return {
    name,
    page,
    notices,
    messages,
    state: () => run((api) => api.state.get(), null),
    run,
    close: () => page.context().close(),
  };
}

/** Joins as a GM whose browser holds the LiveKit dev key and secret. */
export async function openGm(
  browser: Browser,
  name = "Gamemaster",
): Promise<Player> {
  const gm = await openPlayer(browser, name);
  await gm.run(
    async (_api, game, dev) => {
      await game.settings.set("modular-av-livekit", "apiKey", dev.apiKey);
      await game.settings.set("modular-av-livekit", "apiSecret", dev.apiSecret);
    },
    { apiKey: livekitTarget().apiKey, apiSecret: livekitTarget().apiSecret },
  );
  return gm;
}

/**
 * Turns A/V on for the world with the LiveKit service. Changing the mode
 * takes effect for clients that load afterwards (Foundry asks for a reload).
 */
export async function configureWorld(browser: Browser): Promise<void> {
  const gm = await openPlayer(browser, "Gamemaster");
  await gm.run(
    async (_api, game, config) => {
      const world = game.settings.get("core", "rtcWorldSettings") as object;
      await game.settings.set("core", "rtcWorldSettings", {
        ...world,
        mode: config.mode,
      });
      await game.settings.set("modular-av-livekit", "serverUrl", config.url);
      await game.settings.set("modular-av", "service", "livekit");
    },
    { mode: AUDIO_VIDEO, url: livekitTarget().url },
  );
  await gm.close();
}

export async function idOf(player: Player, name: string): Promise<string> {
  const id = await player.run(
    (_api, game, n) => game.users.getName(n)?.id,
    name,
  );
  if (!id) throw new Error(`No user ${name}`);
  return id;
}

export async function setVoiceMode(
  player: Player,
  mode: "always" | "activity" | "ptt",
): Promise<void> {
  await player.run((_api, game, m) => {
    game.webrtc.settings.set("client", "voice.mode", m);
    game.webrtc._initializeUserVoiceDetection(m);
  }, mode);
}

export async function expectStatus(
  player: Player,
  status: string,
  timeout = 45_000,
): Promise<void> {
  try {
    await expect
      .poll(async () => (await player.state()).session.status, {
        timeout,
        message: `${player.name}'s session`,
      })
      .toBe(status);
  } catch (error: unknown) {
    // What the page said last explains most stuck sessions.
    const tail = player.messages
      .filter((m) => !m.startsWith("Foundry VTT | "))
      .slice(-25);
    throw new Error(
      `${String(error)}\n--- ${player.name}'s console ---\n${tail.join("\n")}`,
      {
        cause: error,
      },
    );
  }
}

/**
 * Foundry's notifications so far, from the console: the visible list holds
 * only a few (one is Foundry's permanent hardware-acceleration warning).
 */
export function notifications(player: Player): Promise<string[]> {
  return Promise.resolve([...player.messages]);
}
