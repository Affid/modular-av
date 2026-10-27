import type { Catalog } from "../catalog/catalog.ts";
import { fetchCatalog } from "../catalog/fetch.ts";
import { MODULE_ID } from "../constants.ts";
import { createTexts } from "./board/texts.ts";
import {
  type BoardFoundry,
  bundledCatalog,
  worldModules,
} from "./foundry-host.ts";
import { boardFoundry } from "./globals.ts";
import { LAST_CHECK_SETTING, LAST_NEWS_SETTING } from "./menu.ts";
import { piecesOf } from "./pieces.ts";
import { updatesFor, type WorldModules } from "./steps.ts";

export interface News {
  /** Installed modules with a newer version. */
  readonly updates: readonly string[];
  /** Modules this core's catalog didn't know, not installed. */
  readonly fresh: readonly string[];
  /** The same news gives the same key: told once. */
  readonly key: string;
}

export function newsOf(
  world: WorldModules,
  bundled: Catalog,
  remote: Catalog,
): News {
  const known = new Set(bundled.modules.map((m) => m.id));
  const updates = updatesFor(world, remote);
  const fresh = remote.modules
    .filter((m) => !known.has(m.id) && !world.has(m.id))
    .map((m) => m.id);
  const version = (id: string) =>
    remote.modules.find((m) => m.id === id)?.version ?? "";
  const key = [
    ...updates.map((id) => `${id}@${version(id)}`),
    ...fresh.map((id) => `+${id}`),
  ].join(";");
  return { updates, fresh, key };
}

/**
 * Once a day for a GM: asks GitHub, and tells of updates and new modules
 * with a quiet notice, only when the news changed since last told.
 */
export async function checkForNews(
  foundry: BoardFoundry,
  notify: (message: string) => void,
  now: number,
): Promise<void> {
  const { game } = foundry;
  await game.settings.set(MODULE_ID, LAST_CHECK_SETTING, now);
  const remote = await fetchCatalog(foundry.fetch);
  if (!remote) return;
  const news = newsOf(
    worldModules(game),
    await bundledCatalog(foundry),
    remote,
  );
  if (!news.key || news.key === game.settings.get(MODULE_ID, LAST_NEWS_SETTING))
    return;
  await game.settings.set(MODULE_ID, LAST_NEWS_SETTING, news.key);
  const host = {
    doc: foundry.doc,
    t: (key: string, data?: Readonly<Record<string, string>>) =>
      data ? game.i18n.format(key, data) : game.i18n.localize(key),
  };
  const text = createTexts(host, piecesOf(remote), remote.soon);
  const parts = [
    news.updates.length
      ? text.t("news.updates", { names: text.names(news.updates) })
      : "",
    news.fresh.length
      ? text.t("news.fresh", { names: text.names(news.fresh) })
      : "",
  ].filter(Boolean);
  // Foundry shows notices as HTML: catalog titles go in as text.
  const message = foundry.doc.createElement("span");
  message.textContent = text.t("news.message", { news: parts.join("; ") });
  notify(message.innerHTML);
}

/** The check as the core runs it at `ready`: Foundry's notice, now. */
export function runNewsCheck(onError: (error: unknown) => void): void {
  checkForNews(
    boardFoundry(onError),
    (message) => ui.notifications.info(message),
    Date.now(),
  ).catch(onError);
}
