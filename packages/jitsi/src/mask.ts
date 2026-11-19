import { MODULE_ID } from "./service.ts";

/** Enough of a DOM element for the settings form. */
export interface FormRoot {
  querySelector(selector: string): { type: string } | null;
}

/**
 * Foundry has no password setting type: hides the app secret in its
 * settings form (`renderSettingsConfig`), so it doesn't show on a GM's
 * screen or screen share.
 */
export function maskSecretField(root: FormRoot): void {
  const input = root.querySelector(`input[name="${MODULE_ID}.appSecret"]`);
  if (input) input.type = "password";
}

/** Enough of a form control: its value, its row, its changes. */
export interface FormControl {
  readonly value?: string;
  closest(selector: string): { hidden: boolean } | null;
  addEventListener(type: "change", listener: () => void): void;
}

export interface AccessFormRoot {
  querySelector(selector: string): FormControl | null;
}

const TOKEN_FIELDS = ["appId", "appSecret"] as const;

/**
 * An open server needs no app id and secret: their rows hide while it is
 * chosen in the settings form, before the form is even saved.
 */
export function followAccessChoice(root: AccessFormRoot): void {
  const select = root.querySelector(`select[name="${MODULE_ID}.access"]`);
  if (!select) return;
  const rows = TOKEN_FIELDS.map((key) =>
    root
      .querySelector(`input[name="${MODULE_ID}.${key}"]`)
      ?.closest(".form-group"),
  );
  const show = (): void => {
    const open = select.value === "open";
    for (const row of rows) if (row) row.hidden = open;
  };
  show();
  select.addEventListener("change", show);
}
