import type { CameraPreviewOptions, Preview } from "@modular-av/api";
import { el } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import type { Draft } from "./draft.ts";

/** The background (or other video effect) chosen in the draft, if any. */
export function draftVideoEffect(
  ctx: DockContext,
  draft: Draft,
): string | null {
  const video = new Set(
    ctx.api.effects
      .list()
      .filter((d) => d.kind === "video")
      .map((d) => d.id),
  );
  return (
    Object.values(draft.get("effects")).find((id) => video.has(id)) ?? null
  );
}

/** Why a preview can't show, in words: the browser's refusal or a failure. */
const reasonKey = (error: unknown): string =>
  error instanceof Error && error.name === "NotAllowedError"
    ? "settings.previewBlocked"
    : error instanceof Error && error.name === "NotFoundError"
      ? "settings.previewNone"
      : "settings.previewFailed";

/** The muted video, the note for failures and "only you see this". */
function previewParts(ctx: DockContext, doc: Document) {
  const video = el("video", {
    doc,
    attrs: { autoplay: "", playsinline: "", muted: "" },
  });
  video.muted = true;
  const note = el("p", { doc, className: "mav-preview-note" });
  const only = el("span", {
    doc,
    className: "mav-preview-only",
    text: ctx.t("settings.previewOnly"),
  });
  const element = el("div", {
    doc,
    className: "mav-settings-preview",
    children: [video, note, only],
  });
  return { video, note, element };
}

/** What the preview shows now; null while it must let the camera go. */
function wantedPreview(
  ctx: DockContext,
  draft: Draft,
): CameraPreviewOptions | null {
  // The call's camera opens again at a new size, which a capture of the
  // preview's own would hold at its size (a browser opens a camera once).
  if (draft.applying("videoResolution")) return null;
  return {
    device: draft.get("videoInput"),
    effect: draftVideoEffect(ctx, draft),
    resolution: draft.get("videoResolution"),
  };
}

/**
 * The camera as it would go out, with the chosen background, before
 * saving and outside the call: only this player sees it. It follows the
 * draft's camera and effect, and stops when the tab or window closes.
 */
export function cameraPreview(
  ctx: DockContext,
  doc: Document,
  draft: Draft,
): Rendered {
  const { video, note, element } = previewParts(ctx, doc);
  let running: Preview | null = null;
  let shown = "";
  let request = 0;
  let disposed = false;
  const fail = (error: unknown): void => {
    note.textContent = ctx.t(reasonKey(error));
    note.hidden = false;
  };
  const start = (): void => {
    const wanted = wantedPreview(ctx, draft);
    const key = wanted
      ? `${wanted.device}|${wanted.effect ?? ""}|${wanted.resolution ?? ""}`
      : "";
    if (key === shown) return;
    shown = key;
    request += 1;
    const mine = request;
    running?.stop();
    running = null;
    note.hidden = true;
    if (!wanted) return;
    ctx.api.preview
      .camera(video, { ...wanted, onFailed: fail })
      .then((preview) => {
        if (disposed || request !== mine) preview.stop();
        else running = preview;
      })
      .catch((error: unknown) => {
        if (!disposed && request === mine) fail(error);
      });
  };
  start();
  const off = draft.subscribe(start);
  return {
    element,
    dispose() {
      disposed = true;
      off();
      running?.stop();
    },
  };
}
