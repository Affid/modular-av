import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { DEFAULT_THEME } from "../themes/registry.ts";
import { type Option, row, section, selectField } from "./fields.ts";

/** The dock's own look first, then every registered theme. */
function themeOptions(ctx: DockContext): Option[] {
  return [
    { value: DEFAULT_THEME, label: ctx.t("settings.themeDefault") },
    ...ctx.themes
      .list()
      .map((t) => ({ value: t.id, label: ctx.text(t.label) })),
  ];
}

const labelOf = (ctx: DockContext, id: string): string =>
  themeOptions(ctx).find((o) => o.value === id)?.label ??
  ctx.t("settings.themeDefault");

/**
 * The theme: the player's own, or the world's default (which a GM sets).
 * Shown only where a theme module registered one.
 */
export function appearanceSection(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement,
): readonly Rendered[] {
  const { themes } = ctx;
  if (themes.list().length === 0) return [];
  const own = selectField(
    ctx,
    doc,
    {
      read: () => ({
        options: [
          {
            value: "",
            label: ctx.t("settings.themeWorld", {
              theme: labelOf(ctx, themes.worldDefault()),
            }),
          },
          ...themeOptions(ctx),
        ],
        value: themes.own(),
      }),
      write: (id) => themes.choose(id),
      subscribe: (render) => themes.onChange(render),
    },
    alerts,
  );
  const world = ctx.isGM
    ? selectField(
        ctx,
        doc,
        {
          read: () => ({
            options: themeOptions(ctx),
            value: themes.worldDefault(),
          }),
          write: (id) => themes.chooseWorldDefault(id),
          subscribe: (render) => themes.onChange(render),
        },
        alerts,
      )
    : null;
  const rows = [
    row(doc, ctx.t("settings.theme"), own.element),
    ...(world
      ? [row(doc, ctx.t("settings.themeWorldDefault"), world.element)]
      : []),
  ];
  return [
    own,
    ...(world ? [world] : []),
    {
      element: section(doc, ctx.t("settings.appearance"), rows),
      dispose: () => undefined,
    },
  ];
}
