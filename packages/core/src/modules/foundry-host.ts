import type {
  Contribution,
  SettingsSectionContribution,
} from "@modular-av/api";
import { type Catalog, parseCatalog } from "../catalog/catalog.ts";
import {
  type CatalogFetch,
  fetchCatalog,
  loadCatalogs,
} from "../catalog/fetch.ts";
import { MODULE_ID, SERVICE_SETTING } from "../constants.ts";
import type { FoundryGame } from "../foundry/globals.ts";
import { assetUrl } from "../socket.ts";
import {
  CAMERAS_SETTING,
  SETTINGS_WINDOW_SETTING,
} from "../surfaces/choice.ts";
import type { SectionInfo } from "./board/objectives.ts";
import type { BoardHost, LoadedCatalog, SavedPlan } from "./host.ts";
import { CHECK_SETTING, PLAN_SETTING } from "./menu.ts";
import type { WorldModules } from "./steps.ts";

/** Foundry's own setting of which modules a world runs. */
const MODULE_CONFIGURATION = "moduleConfiguration";

/** The parts of Foundry the board uses beyond the core's own. */
export interface BoardFoundry {
  readonly game: FoundryGame & { shutDown(): Promise<unknown> };
  readonly doc: Document;
  /** `ChatMessage.implementation`. */
  readonly chat: { create(data: object): Promise<unknown> };
  readonly utils: {
    getRoute(path: string): string;
    saveDataToFile(data: string, type: string, filename: string): void;
    debouncedReload(): void;
  };
  readonly clipboard: { writeText(text: string): Promise<void> } | undefined;
  readonly fetch: CatalogFetch;
  readonly onError: (error: unknown) => void;
  /** The Voice & Video Settings window (`game.webrtc.config`), if any. */
  readonly settingsWindow: { render(options?: object): unknown } | null;
  /** Foundry's settings window, on a module's category. */
  openFoundrySettings(category: string): void;
  /** What modules contributed to the core's API. */
  contributions(): readonly Contribution[];
  /** Every setting and menu registered, by namespace. */
  configured(): Iterable<{
    readonly namespace: string;
    readonly config?: boolean;
  }>;
}

const isFamily = (id: string): boolean =>
  id === MODULE_ID || id.startsWith(`${MODULE_ID}-`);

const strings = (value: unknown): readonly string[] | null =>
  Array.isArray(value) && value.every((v) => typeof v === "string")
    ? value
    : null;

/** The saved plan, if the setting holds one: anything else counts as none. */
export function readSavedPlan(value: unknown): SavedPlan | null {
  if (typeof value !== "object" || value === null) return null;
  const { plan, trip } = value as Record<string, unknown>;
  const ids = strings(plan);
  if (!ids) return null;
  return { plan: ids, trip: trip === null ? null : strings(trip) };
}

export function worldModules(game: FoundryGame): WorldModules {
  return new Map(
    [...game.modules.values()]
      .filter((m) => isFamily(m.id))
      .map((m) => [m.id, { active: m.active ?? false, version: m.version }]),
  );
}

/** The catalog that came with this core, checked like any other. */
export async function bundledCatalog(foundry: BoardFoundry): Promise<Catalog> {
  const url = assetUrl(
    (path) => foundry.utils.getRoute(path),
    MODULE_ID,
    "catalog.json",
  );
  const response = await foundry.fetch(url, {});
  const catalog = response.ok
    ? parseCatalog(JSON.parse(await response.text()))
    : null;
  if (!catalog)
    throw new Error("The catalog shipped with Modular A/V is unreadable");
  return catalog;
}

/** GitHub's catalog if the world allows asking, else the core's own. */
export function loadCatalog(foundry: BoardFoundry): Promise<LoadedCatalog> {
  return loadCatalogs({
    bundled: () => bundledCatalog(foundry),
    remote: () => fetchCatalog(foundry.fetch),
    checkGitHub: foundry.game.settings.get(MODULE_ID, CHECK_SETTING) !== false,
  });
}

/** Turns modules on and off as Foundry's module manager does, then reloads everyone. */
async function applyChange(
  foundry: BoardFoundry,
  change: Parameters<BoardHost["apply"]>[0],
): Promise<void> {
  const { game } = foundry;
  const current = game.settings.get("core", MODULE_CONFIGURATION);
  const config = {
    ...(typeof current === "object" && current !== null ? current : {}),
    ...Object.fromEntries(change.on.map((id) => [id, true])),
    ...Object.fromEntries(change.off.map((id) => [id, false])),
  };
  // Surfaces are `<module>.cameras` and `<module>.settings` by convention.
  if (change.ui) {
    await game.settings.set(MODULE_ID, CAMERAS_SETTING, `${change.ui}.cameras`);
    await game.settings.set(
      MODULE_ID,
      SETTINGS_WINDOW_SETTING,
      `${change.ui}.settings`,
    );
  }
  await game.settings.set("core", MODULE_CONFIGURATION, config);
  game.socket.emit("reload", null);
  foundry.utils.debouncedReload();
}

const isSection = (c: Contribution): c is SettingsSectionContribution =>
  c.kind === "settings-section";

/** The family's sections, each by the module whose settings it holds. */
function sectionsOf(foundry: BoardFoundry): readonly SectionInfo[] {
  return foundry.contributions().flatMap((c) => {
    if (!isSection(c)) return [];
    const moduleId = c.settings[0]?.split(".")[0];
    return moduleId && isFamily(moduleId)
      ? [{ id: c.id, moduleId, label: c.label, tab: c.tab ?? null }]
      : [];
  });
}

/** Family modules that show settings in Foundry's own window. */
function configuredOf(foundry: BoardFoundry): readonly string[] {
  const ids = [...foundry.configured()]
    .filter((s) => s.config === true && isFamily(s.namespace))
    .map((s) => s.namespace);
  return [...new Set(ids)];
}

/** What Soundcheck lists, and where each item is set. */
function soundcheck(
  foundry: BoardFoundry,
): Pick<BoardHost, "settingsSections" | "configuredModules" | "openCheck"> {
  return {
    settingsSections: () => sectionsOf(foundry),
    configuredModules: () => configuredOf(foundry),
    openCheck: (target) => {
      // Without the core's window (A/V off), the core's own settings.
      if ("foundry" in target || !foundry.settingsWindow)
        foundry.openFoundrySettings(
          "foundry" in target ? target.foundry : MODULE_ID,
        );
      else
        void foundry.settingsWindow.render({
          force: true,
          modularAV: { tab: target.tab },
        });
    },
  };
}

export function createFoundryBoardHost(foundry: BoardFoundry): BoardHost {
  const { game, doc } = foundry;
  return {
    doc,
    t: (key, data) =>
      data ? game.i18n.format(key, data) : game.i18n.localize(key),
    world: () => worldModules(game),
    othersOnline: () =>
      game.users.contents.filter((u) => u.active && u.id !== game.userId)
        .length,
    serviceInUse: () => {
      const id = game.settings.get(MODULE_ID, SERVICE_SETTING);
      return typeof id === "string" && id !== "" ? id : null;
    },
    loadCatalog: () => loadCatalog(foundry),
    savedPlan: () => readSavedPlan(game.settings.get(MODULE_ID, PLAN_SETTING)),
    savePlan: async (saved) => {
      await game.settings.set(MODULE_ID, PLAN_SETTING, saved);
    },
    apply: (change) => applyChange(foundry, change),
    returnToSetup: async () => {
      await game.shutDown();
    },
    whisper: async (text) => {
      // Text only: the chat renders HTML.
      const pre = doc.createElement("pre");
      pre.textContent = text;
      await foundry.chat.create({
        content: pre.outerHTML,
        whisper: [game.userId],
      });
    },
    saveFile: (text) => {
      foundry.utils.saveDataToFile(
        text,
        "text/plain",
        "modular-av-install.txt",
      );
    },
    copy: (text) =>
      foundry.clipboard
        ? foundry.clipboard.writeText(text)
        : Promise.reject(new Error("No clipboard on this page")),
    ...soundcheck(foundry),
    onError: foundry.onError,
  };
}
