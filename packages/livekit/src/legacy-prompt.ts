import { importLegacyServer, readLegacyServer } from "./legacy.ts";
import { MODULE_ID } from "./settings.ts";

/** What the prompt needs from Foundry, so it runs in tests. */
export interface PromptDeps {
  readonly isGM: boolean;
  /** A stored world setting's raw value. */
  getItem(key: string): unknown;
  get(key: string): unknown;
  set(key: string, value: unknown): Promise<void>;
  removeLegacy(): Promise<void>;
  /** Asks a question; resolves with "import", "later" or "never". */
  choose(question: string): Promise<string>;
  confirm(question: string): Promise<boolean>;
  notify(kind: "info" | "warn", message: string): void;
  t(key: string): string;
}

export const DECLINED_SETTING = "legacyDeclined";

const key = (name: string): string => `${MODULE_ID}.legacy.${name}`;

/**
 * Once a GM opens a world that LiveKit AVClient set up, and this module's
 * server isn't set yet: offers to bring the old server over.
 */
export async function offerLegacyImport(deps: PromptDeps): Promise<void> {
  if (!deps.isGM) return;
  if (deps.get(`${MODULE_ID}.serverUrl`)) return;
  if (deps.get(`${MODULE_ID}.${DECLINED_SETTING}`) === true) return;
  const legacy = readLegacyServer((k) => deps.getItem(k));
  if (!legacy) return;
  if (legacy.kind === "tavern") {
    deps.notify("warn", deps.t(key("tavern")));
    return;
  }
  const choice = await deps.choose(deps.t(key("question")));
  if (choice === "never")
    await deps.set(`${MODULE_ID}.${DECLINED_SETTING}`, true);
  if (choice !== "import") return;
  const removeOld = await deps.confirm(deps.t(key("remove")));
  const result = await importLegacyServer(legacy, { removeOld }, deps);
  if (!result.imported) {
    deps.notify("warn", deps.t(key("badAddress")));
    return;
  }
  deps.notify("info", deps.t(key("imported")));
  deps.notify("warn", deps.t(key("rotate")));
}
