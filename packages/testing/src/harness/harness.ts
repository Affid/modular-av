/// <reference types="vite/client" />
// Browser test harness: installs a fake Foundry as page globals, loads the
// modules named in ?module=<package dir>[,<package dir>…] from source (the
// core first) and runs Foundry's startup hooks. With
// ?players=p1,p2 the other players run as cores in the same page; with
// ?sample=1 a sample plugin contributes one item of each kind; with
// ?theme=<id> the dock shows that theme; with ?trial=<id>:<reach> a theme of
// that id is registered here, its stylesheet served by whoever opened the
// page (trial-theme.ts); with ?colours=1 the players have colours of
// their own, as a table's do. Tests read window.harness.
// Foundry brings Font Awesome (Pro 7.2.0 in 14.369); the harness the Free
// edition of the same version, so screenshots show the icons.
import "@fortawesome/fontawesome-free/css/all.min.css";
import type { Translations } from "../foundry/i18n.ts";
import { createFakeWorld } from "../foundry/world.ts";
import { createMockServiceHub } from "../service/hub.ts";
import { installPipeline } from "./pipeline.ts";
import { installSamplePlugin } from "./sample-plugin.ts";
import {
  parseTrialTheme,
  TRIAL_STYLESHEET,
  type TrialTheme,
} from "./trial-theme.ts";
import type { Harness } from "./types.ts";
import { startPlayers } from "./ui.ts";

const entries = import.meta.glob("../../../*/src/index.ts");
/** Every module's language file, as Foundry loads them. */
const languages = import.meta.glob<{ default: Translations }>(
  "../../../*/lang/en.json",
  { eager: true },
);
/** Every module's manifest, for its id. */
const manifests = import.meta.glob<{ default: { id: string } }>(
  "../../../*/module.json",
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

/** Colours a table's players might have chosen, in turn. */
const COLOURS = [
  "#b3262e",
  "#2f6fd0",
  "#1f8a5a",
  "#8a3fc0",
  "#c9861a",
  "#1a9aa8",
] as const;

/** The slice of the dock's API a trial theme is registered through. */
interface ThemeRegistrar {
  readonly themes: { register(theme: object): void };
}

/** The hook the dock fires for themes to register in (its DOCK_REGISTER_HOOK). */
const DOCK_REGISTER_HOOK = "modularAVDock.register";

const registered = (trial: TrialTheme): object => ({
  id: trial.id,
  label: "Trial",
  stylesheet: TRIAL_STYLESHEET,
  frames: { reach: trial.reach },
});

async function start(): Promise<Harness> {
  const params = new URLSearchParams(location.search);
  const dir = params.get("module") ?? "core";
  const players = (params.get("players") ?? "").split(",").filter(Boolean);
  const coloured = params.get("colours") === "1";
  const colour = (turn: number): { color?: string } =>
    coloured ? { color: COLOURS[turn % COLOURS.length] ?? COLOURS[0] } : {};
  const trialText = params.get("trial");
  const trial = trialText ? parseTrialTheme(trialText) : null;
  const dirs = [
    "core",
    ...dir.split(",").filter((d) => d !== "" && d !== "core"),
  ];
  // The core's id may be changed (?id=), to test a misnamed install.
  const modules = [
    { id: params.get("id") ?? "modular-av", version: "0.0.0-harness" },
    ...dirs.slice(1).flatMap((d) => {
      const id = manifests[`../../../${d}/module.json`]?.default.id;
      return id ? [{ id, version: "0.0.0-harness" }] : [];
    }),
  ];
  const world = createFakeWorld({
    users: [
      { id: "gm1", name: "Gamemaster", role: 4, ...colour(0) },
      ...players.map((id, i) => ({
        id,
        name: `Player ${id}`,
        role: 2,
        ...colour(i + 1),
      })),
    ],
    modules,
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
  for (const d of dirs) {
    const load = entries[`../../../${d}/src/index.ts`];
    if (!load) return { client, ready: false, error: `No package "${d}"` };
    await load();
  }
  if (trial)
    client.Hooks.once(DOCK_REGISTER_HOOK, (dock: unknown) => {
      (dock as ThemeRegistrar).themes.register(registered(trial));
    });
  const theme = params.get("theme") ?? trial?.id;
  if (theme)
    // A user setting can be set once Foundry is ready; the dock follows it.
    client.Hooks.once("ready", () => {
      void client.game.settings.set("modular-av-dock", "theme", theme);
    });
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
