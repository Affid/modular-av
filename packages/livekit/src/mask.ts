import { MODULE_ID } from "./settings.ts";

/** Enough of a DOM element for the settings form. */
export interface FormRoot {
  querySelector(selector: string): { type: string } | null;
}

/**
 * Foundry has no password setting type: hides the API secret in its
 * settings form (`renderSettingsConfig`), so it doesn't show on a GM's
 * screen or screen share.
 */
export function maskSecretField(root: FormRoot): void {
  const input = root.querySelector(`input[name="${MODULE_ID}.apiSecret"]`);
  if (input) input.type = "password";
}
