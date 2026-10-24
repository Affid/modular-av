import type { ParticipantId } from "@modular-av/api";
import {
  createMeter,
  el,
  icon,
  iconOf,
  setLabel,
  uniqueId,
} from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import { syncIndicators } from "../ui/indicators.ts";
import type { TileFlags, TileView } from "../view/tile-view.ts";

export interface TileHandlers {
  /** The player asked for this participant's menu. */
  menu(participant: ParticipantId, anchor: HTMLElement): void;
  /** The player picked this tile to show large. */
  focus(participant: ParticipantId): void;
}

/** Another module's badge (an indicator contribution), shown as text. */
export interface Badge {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

export interface Tile {
  readonly element: HTMLElement;
  update(view: TileView): void;
  /** Other modules' badges active for this participant. */
  setBadges(badges: readonly Badge[]): void;
  dispose(): void;
}

/** `data-*` boolean attributes, part of the dock's documented hooks. */
const FLAG_ATTRIBUTES: Readonly<Record<keyof TileFlags, string>> = {
  speaking: "data-speaking",
  muted: "data-muted",
  deafened: "data-deafened",
  blockedAudio: "data-blocked-audio",
  blockedVideo: "data-blocked-video",
  connected: "data-connected",
  hiddenByMe: "data-hidden-by-me",
};

/** A user's colour from Foundry, used only if it is a plain hex colour. */
const HEX = /^#[0-9a-f]{3,8}$/i;

function avatarOf(doc: Document, view: TileView): HTMLElement {
  const box = el("div", { doc, className: "mav-dock-tile-avatar" });
  if (view.avatar) {
    // Another player's avatar may be anywhere: don't tell that host who looks.
    const image = el("img", {
      doc,
      attrs: {
        alt: "",
        src: view.avatar,
        referrerpolicy: "no-referrer",
        decoding: "async",
      },
    });
    box.append(image);
  } else box.append(icon("fa-user", doc));
  return box;
}

interface Parts {
  readonly name: HTMLElement;
  readonly indicators: HTMLElement;
  readonly badges: HTMLElement;
  readonly menu: HTMLButtonElement;
  readonly media: HTMLElement;
}

function build(
  doc: Document,
  id: ParticipantId,
  handlers: TileHandlers,
): { element: HTMLElement; video: HTMLVideoElement; parts: Parts } {
  const video = el("video", {
    doc,
    className: "mav-dock-tile-video",
    attrs: { autoplay: "", playsinline: "", muted: "" },
  });
  video.muted = true;
  const indicators = el("span", {
    doc,
    className: "mav-dock-tile-indicators",
    attrs: { id: uniqueId(doc, "mav-tile-states") },
  });
  const name = el("span", { doc, className: "mav-dock-tile-name" });
  const badges = el("span", { doc, className: "mav-dock-tile-badges" });
  const menu = el("button", {
    doc,
    className: "mav-dock-tile-menu",
    attrs: {
      type: "button",
      "aria-haspopup": "dialog",
      "aria-describedby": indicators.id,
    },
    children: [icon("fa-ellipsis", doc)],
  });
  const media = el("div", {
    doc,
    className: "mav-dock-tile-media",
    children: [video],
  });
  const element = el("li", {
    doc,
    className: "mav-dock-tile",
    attrs: { "data-participant-id": id },
    children: [
      media,
      el("div", {
        doc,
        className: "mav-dock-tile-frame",
        attrs: { "aria-hidden": "true" },
      }),
      el("div", {
        doc,
        className: "mav-dock-tile-bar",
        children: [name, indicators, badges],
      }),
      menu,
    ],
  });
  menu.addEventListener("click", () => {
    handlers.menu(id, menu);
  });
  media.addEventListener("dblclick", () => {
    handlers.focus(id);
  });
  return { element, video, parts: { name, indicators, badges, menu, media } };
}

/**
 * One participant's tile. Its video is attached once and kept by the core
 * (shown or not as the state says); the tile only writes what changed.
 * The local player's tile has a level meter, fed only while it is shown.
 */
export function createTile(
  ctx: DockContext,
  doc: Document,
  id: ParticipantId,
  handlers: TileHandlers,
): Tile {
  const { element, video, parts } = build(doc, id, handlers);
  const detach = ctx.api.media.attach(id, "camera", video);
  let last: TileView | null = null;
  let unmeter: (() => void) | null = null;

  const updateIdentity = (view: TileView): void => {
    const name = view.isLocal
      ? ctx.t("tile.you", { name: view.name })
      : view.name;
    parts.name.textContent = name;
    setLabel(parts.name, view.name, { trusted: false });
    setLabel(parts.menu, ctx.t("tile.options", { name: view.name }), {
      trusted: false,
    });
    parts.media.querySelector(".mav-dock-tile-avatar")?.remove();
    parts.media.append(avatarOf(doc, view));
    if (view.color && HEX.test(view.color))
      element.style.setProperty("--mav-dock-tile-color", view.color);
    else element.style.removeProperty("--mav-dock-tile-color");
  };

  const addMeter = (): void => {
    const meter = createMeter(doc, { label: ctx.t("menu.level") });
    element.append(meter.element);
    unmeter = ctx.api.meters.subscribe(id, meter.element, (reading) => {
      meter.set({ ...reading, threshold: null });
    });
  };

  return {
    element,
    update(view) {
      if (
        last?.name !== view.name ||
        last.avatar !== view.avatar ||
        last.color !== view.color
      )
        updateIdentity(view);
      if (view.isLocal && !unmeter) addMeter();
      for (const [flag, attribute] of Object.entries(FLAG_ATTRIBUTES))
        element.toggleAttribute(attribute, view.flags[flag as keyof TileFlags]);
      element.dataset.video = view.video;
      if (view.quality) element.dataset.quality = view.quality;
      else delete element.dataset.quality;
      syncIndicators(ctx, parts.indicators, view.indicators);
      last = view;
    },
    setBadges(badges) {
      const ids = badges.map((b) => b.id).join(" ");
      if (parts.badges.dataset.ids === ids) return;
      parts.badges.dataset.ids = ids;
      parts.badges.replaceChildren(
        ...badges.map((b) => {
          const badge = el("span", {
            doc,
            className: "mav-indicator",
            attrs: { role: "img", "data-contribution": b.id },
            children: [iconOf(b.icon, doc)],
          });
          setLabel(badge, b.label, { trusted: false });
          return badge;
        }),
      );
    },
    dispose() {
      detach();
      unmeter?.();
      element.remove();
    },
  };
}
