import type { ThemeDefinition } from "./types.ts";

const CLASS_PREFIX = "mav-theme-";
const SHEET = "link[data-mav-theme]";

/** The class on `<html>` while a theme is chosen; its rules start with it. */
export const themeClass = (id: string): string => `${CLASS_PREFIX}${id}`;

/**
 * Shows `theme` (null: the dock's own look): only its stylesheet is
 * loaded, and `<html>` carries its class. The core mirrors both into the
 * Picture-in-Picture window.
 */
export function applyTheme(
  doc: Document,
  theme: ThemeDefinition | null,
  route: (path: string) => string,
): void {
  const root = doc.documentElement;
  for (const name of [...root.classList])
    if (name.startsWith(CLASS_PREFIX)) root.classList.remove(name);
  const current = doc.head.querySelector<HTMLLinkElement>(SHEET);
  if (current && current.dataset.mavTheme !== theme?.id) current.remove();
  if (!theme) return;
  root.classList.add(themeClass(theme.id));
  if (current?.dataset.mavTheme === theme.id) return;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = route(theme.stylesheet);
  link.dataset.mavTheme = theme.id;
  doc.head.append(link);
}
