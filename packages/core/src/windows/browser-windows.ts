import type { FoundryGame } from "../foundry/globals.ts";
import type { DocumentPipLike, WindowsEnv } from "./page-windows.ts";

/** Chrome and Edge, on secure pages only. */
function documentPip(): DocumentPipLike | null {
  if (!window.isSecureContext) return null;
  const pip = (window as { documentPictureInPicture?: DocumentPipLike })
    .documentPictureInPicture;
  return pip ?? null;
}

/** The key codes bound to Foundry's push to talk. */
function pushToTalkKeys(game: FoundryGame): readonly string[] {
  const bindings = game.keybindings?.get("core", "pushToTalk") ?? [];
  return bindings.map((b) => b.key);
}

export function createBrowserWindows(game: () => FoundryGame): WindowsEnv {
  return {
    documentPip,
    // A name of its own each time: never an earlier window, never navigated.
    openPopup: (features) => window.open("", "_blank", features),
    onPageHide(listener) {
      window.addEventListener("pagehide", listener);
      return () => {
        window.removeEventListener("pagehide", listener);
      };
    },
    // Only needed once a window opens: kept out of the entry.
    async prepareWindow(win) {
      const { preparePipWindow } = await import("./pip-window.ts");
      return preparePipWindow(win, document, () => pushToTalkKeys(game()));
    },
  };
}
