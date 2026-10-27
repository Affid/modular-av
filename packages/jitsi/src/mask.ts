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
