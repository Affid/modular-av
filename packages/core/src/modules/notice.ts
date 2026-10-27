import { el } from "@modular-av/kit";
import { MODULE_ID } from "../constants.ts";
import { MODULES_MENU, NO_SERVICE_SETTING } from "./menu.ts";

const KEY = `${MODULE_ID}.modules`;

/** The services a GM can pick from, in the helper's order. */
const SERVICES = [
  "modular-av-livekit",
  "modular-av-p2p",
  "modular-av-jitsi",
] as const;

/** What the notice says: the services, each with what it needs. */
export function noServiceContent(
  doc: Document,
  t: (key: string) => string,
): HTMLElement {
  const item = (id: string) =>
    el("li", {
      doc,
      text: t(`${KEY}.noService.item`)
        .replace("{name}", t(`${KEY}.names.${id}.title`))
        .replace("{what}", t(`${KEY}.names.${id}.what`)),
    });
  return el("div", {
    doc,
    children: [
      el("p", { doc, text: t(`${KEY}.noService.lead`) }),
      el("ul", { doc, children: SERVICES.map(item) }),
      el("p", { doc, text: t(`${KEY}.noService.then`) }),
    ],
  });
}

interface DialogGlobals {
  readonly foundry: {
    readonly applications: {
      readonly api: {
        readonly DialogV2: {
          wait(options: object): Promise<unknown>;
        };
      };
    };
  };
}

/**
 * A GM's notice that no service module is enabled (libWrapper's way): the
 * modules window, or don't remind again.
 */
export async function showNoServiceNotice(): Promise<void> {
  const t = (key: string) => game.i18n.localize(key);
  const { DialogV2 } = (globalThis as unknown as DialogGlobals).foundry
    .applications.api;
  const choice = await DialogV2.wait({
    window: { title: t(`${KEY}.noService.title`) },
    content: noServiceContent(document, t).outerHTML,
    buttons: [
      { action: "plan", label: t(`${KEY}.noService.plan`), default: true },
      { action: "dismiss", label: t(`${KEY}.noService.dismiss`) },
      { action: "close", label: t(`${KEY}.noService.close`) },
    ],
    rejectClose: false,
  });
  if (choice === "dismiss")
    await game.settings.set(MODULE_ID, NO_SERVICE_SETTING, true);
  if (choice === "plan") {
    const menu = game.settings.menus.get(`${MODULE_ID}.${MODULES_MENU}`);
    if (menu) void new menu.type().render();
  }
}
