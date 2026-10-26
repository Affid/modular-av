import { MODULE_ID } from "./settings.ts";

/** The parts of Foundry's UI the picker uses. */
export interface FoundryUi {
  canBrowseFiles(): boolean;
  localize(key: string): string;
  readonly FilePicker: new (config: {
    type: "image";
    current: string;
    callback: (path: string) => void;
  }) => { render(options: { force: boolean }): Promise<unknown> };
  readonly DialogV2: {
    prompt(config: {
      window: { title: string };
      content: string;
      ok: {
        label: string;
        callback: (event: Event, button: HTMLButtonElement) => unknown;
      };
      rejectClose: boolean;
    }): Promise<unknown>;
  };
}

/** The address dialog: built as elements, so the current value stays text. */
function addressForm(current: string, t: (key: string) => string): string {
  const wrapper = document.createElement("div");
  const hint = document.createElement("p");
  hint.textContent = t(`${MODULE_ID}.controls.addressHint`);
  const input = document.createElement("input");
  input.type = "text";
  input.name = "url";
  input.placeholder = "https://…";
  input.setAttribute("value", current);
  input.setAttribute("aria-label", t(`${MODULE_ID}.controls.address`));
  wrapper.append(hint, input);
  return wrapper.innerHTML;
}

/**
 * Asks for an image: Foundry's file browser for players who may browse
 * files, otherwise its address. Null when the player picks none.
 */
export async function pickImage(
  current: string,
  ui: FoundryUi,
): Promise<string | null> {
  if (ui.canBrowseFiles())
    return new Promise((resolve) => {
      const picker = new ui.FilePicker({
        type: "image",
        current,
        callback: resolve,
      });
      picker.render({ force: true }).catch(() => {
        resolve(null);
      });
    });
  const t = (key: string): string => ui.localize(key);
  const answer = await ui.DialogV2.prompt({
    window: { title: t(`${MODULE_ID}.controls.pick`) },
    content: addressForm(current, t),
    ok: {
      label: t(`${MODULE_ID}.controls.use`),
      callback: (_event, button) =>
        (button.form?.elements.namedItem("url") as HTMLInputElement | null)
          ?.value,
    },
    rejectClose: false,
  });
  return typeof answer === "string" && answer.trim() ? answer.trim() : null;
}
