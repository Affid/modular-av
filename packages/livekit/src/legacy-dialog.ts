// The GM's prompt for LiveKit AVClient's server, with Foundry's dialogs;
// loaded only when that module's setting is in the world.
import { LEGACY_SETTING } from "./legacy.ts";
import { offerLegacyImport } from "./legacy-prompt.ts";
import { MODULE_ID } from "./settings.ts";

/** The parts of Foundry this prompt uses. */
export interface FoundryForPrompt {
  readonly isGM: boolean;
  readonly worldSettings: {
    getItem(key: string): unknown;
    filter(
      predicate: (setting: { readonly key: string }) => boolean,
    ): { delete(): Promise<unknown> }[];
  };
  readonly settings: {
    get(namespace: string, key: string): unknown;
    set(namespace: string, key: string, value: unknown): Promise<unknown>;
  };
  readonly dialogs: {
    wait(config: Readonly<Record<string, unknown>>): Promise<unknown>;
    confirm(config: Readonly<Record<string, unknown>>): Promise<unknown>;
  };
  readonly notify: (kind: "info" | "warn", message: string) => void;
  readonly localize: (key: string) => string;
}

/** A paragraph of text, as HTML Foundry's dialog takes. */
function paragraph(text: string): string {
  const p = document.createElement("p");
  p.textContent = text;
  return p.outerHTML;
}

const split = (full: string): [string, string] => {
  const dot = full.indexOf(".");
  return [full.slice(0, dot), full.slice(dot + 1)];
};

export function promptGm(foundry: FoundryForPrompt): Promise<void> {
  const t = foundry.localize;
  const title = t(`${MODULE_ID}.legacy.title`);
  return offerLegacyImport({
    isGM: foundry.isGM,
    getItem: (key) => foundry.worldSettings.getItem(key),
    get: (key) => foundry.settings.get(...split(key)),
    set: async (key, value) => {
      await foundry.settings.set(...split(key), value);
    },
    // Every document of that key: a world may hold more than one.
    removeLegacy: async () => {
      const stored = foundry.worldSettings.filter(
        (s) => s.key === LEGACY_SETTING,
      );
      await Promise.all(stored.map((s) => s.delete()));
    },
    choose: async (question) => {
      const answer = await foundry.dialogs.wait({
        window: { title },
        content: paragraph(question),
        buttons: (["import", "later", "never"] as const).map((action) => ({
          action,
          label: t(`${MODULE_ID}.legacy.${action}`),
          default: action === "import",
        })),
        rejectClose: false,
      });
      return typeof answer === "string" ? answer : "later";
    },
    confirm: async (question) =>
      (await foundry.dialogs.confirm({
        window: { title },
        content: paragraph(question),
        rejectClose: false,
      })) === true,
    notify: foundry.notify,
    t,
  });
}
