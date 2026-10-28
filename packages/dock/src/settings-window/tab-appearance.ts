import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { DEFAULT_THEME } from "../themes/registry.ts";
import { contributedSections } from "./contributed.ts";
import type { Draft } from "./draft.ts";
import { draftSelect, settingChoices } from "./draft-inputs.ts";
import { type Option, row, section } from "./fields.ts";

/** The dock's own look first, then every registered theme. */
function themeOptions(ctx: DockContext): Option[] {
  return [
    { value: DEFAULT_THEME, label: ctx.t("settings.themeDefault") },
    ...ctx.themes
      .list()
      .map((t) => ({ value: t.id, label: ctx.text(t.label) })),
  ];
}

/**
 * One theme select: a GM's is everyone's (and theirs); a player's is
 * their own, "As the GM chose" first. Only where a theme is registered.
 */
function theme(ctx: DockContext, doc: Document, draft: Draft): Rendered[] {
  if (ctx.themes.list().length === 0) return [];
  const options = (): Option[] => {
    if (ctx.isGM) return themeOptions(ctx);
    const gm = themeOptions(ctx).find(
      (o) => o.value === ctx.themes.worldDefault(),
    );
    return [
      {
        value: "",
        label: ctx.t("settings.themeAsGm", { theme: gm?.label ?? "" }),
      },
      ...themeOptions(ctx),
    ];
  };
  const select = draftSelect(doc, draft, "theme", options);
  return [
    {
      element: section(doc, ctx.t("settings.theme"), [
        row(
          doc,
          ctx.t(ctx.isGM ? "settings.themeEveryone" : "settings.theme"),
          select.element,
          ctx.isGM ? ctx.t("settings.themeEveryoneHint") : undefined,
        ),
      ]),
      dispose: () => {
        select.dispose();
      },
    },
  ];
}

/** Which modules show the cameras and the settings: a player's own, a GM's for everyone. */
function shownBy(ctx: DockContext, doc: Document, draft: Draft): Rendered {
  const choices = (key: string) => () =>
    settingChoices(ctx.foundrySetting(`modular-av.${key}`)?.choices, ctx.text);
  const own = draftSelect(doc, draft, "camerasOwn", choices("camerasPlayer"));
  const world = ctx.isGM
    ? draftSelect(doc, draft, "camerasWorld", choices("cameras"))
    : null;
  const windowChoice = ctx.isGM
    ? draftSelect(doc, draft, "settingsWindow", choices("settingsWindow"))
    : null;
  const parts = [own, world, windowChoice].filter((p) => p !== null);
  return {
    element: section(doc, ctx.t("settings.shownBy"), [
      row(doc, ctx.t("settings.camerasOwn"), own.element),
      ...(world
        ? [row(doc, ctx.t("settings.camerasWorld"), world.element)]
        : []),
      ...(windowChoice
        ? [row(doc, ctx.t("settings.windowWorld"), windowChoice.element)]
        : []),
    ]),
    dispose() {
      for (const part of parts) part.dispose();
    },
  };
}

/** The Appearance tab: the theme, and which modules show what. */
export function appearanceTab(
  ctx: DockContext,
  doc: Document,
  draft: Draft,
  alerts: HTMLElement,
): readonly Rendered[] {
  return [
    ...theme(ctx, doc, draft),
    shownBy(ctx, doc, draft),
    ...contributedSections(ctx, doc, alerts, "appearance"),
  ];
}
