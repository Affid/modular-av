/// <reference types="vite/client" />
// Browser test harness: installs a fake Foundry as page globals, loads the
// modules named in ?module=<package dir>[,<package dir>…] from source (the
// core first) and runs Foundry's startup hooks. With
// ?players=p1,p2 the other players run as cores in the same page; with
// ?sample=1 a sample plugin contributes one item of each kind. Tests read
// window.harness.
import type { Translations } from "../foundry/i18n.ts";
import { createFakeWorld } from "../foundry/world.ts";
import { createMockServiceHub } from "../service/hub.ts";
import { installPipeline } from "./pipeline.ts";
import { installSamplePlugin } from "./sample-plugin.ts";
import type { Harness } from "./types.ts";
import { startPlayers } from "./ui.ts";

const entries = import.meta.glob("../../../*/src/index.ts");
/** Every module's language file, as Foundry loads them. */
const languages = import.meta.glob<{ default: Translations }>(
  "../../../*/lang/en.json",
  { eager: true },
);
const translations = Object.assign(
  {},
  ...Object.values(languages).map((m) => m.default),
) as Translations;

const ALWAYS = {
  voice: {
    mode: "always",
    pttName: "`",
    pttDelay: 100,
    activityThreshold: -45,
  },
} as const;

async function start(): Promise<Harness> {
  const params = new URLSearchParams(location.search);
  const dir = params.get("module") ?? "core";
  const players = (params.get("players") ?? "").split(",").filter(Boolean);
  const world = createFakeWorld({
    users: [
      { id: "gm1", name: "Gamemaster", role: 4 },
      ...players.map((id) => ({ id, name: `Player ${id}`, role: 2 })),
    ],
    modules: [
      { id: params.get("id") ?? "modular-av", version: "0.0.0-harness" },
    ],
    translations,
  });
  const client = world.connect("gm1", players.length > 0 ? { av: ALWAYS } : {});
  client.install(window);
  const hub = createMockServiceHub();
  const pipeline = installPipeline(client.Hooks, params, hub);
  const sample =
    params.get("sample") === "1"
      ? installSamplePlugin(client.Hooks, client.game.settings)
      : undefined;
  const dirs = [
    "core",
    ...dir.split(",").filter((d) => d !== "" && d !== "core"),
  ];
  for (const d of dirs) {
    const load = entries[`../../../${d}/src/index.ts`];
    if (!load) return { client, ready: false, error: `No package "${d}"` };
    await load();
  }
  client.runLifecycle();
  const ui = players.length > 0 ? startPlayers(world, players, hub) : undefined;
  return {
    client,
    ready: true,
    pipeline,
    ...(ui ? { ui } : {}),
    ...(sample ? { sample } : {}),
  };
}

window.harness = await start();
