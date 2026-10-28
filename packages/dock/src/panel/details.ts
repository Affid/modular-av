import type { ParticipantId } from "@modular-av/api";
import type { Popover } from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import type { ConnectionLine } from "./connection-line.ts";

export interface DetailsOpener {
  /**
   * Opens the details, on a player or this client, by `near` (what was
   * clicked: a tile's menu, which may be far from the panel when the
   * tiles are scattered), else at the panel's connection line.
   */
  show(focus: ParticipantId | null, near?: HTMLElement): void;
  /** Closes them if open: the dock is going, or moving windows. */
  close(): void;
}

/** One connection details at a time, their code loaded on first use. */
export function detailsOpener(
  ctx: DockContext,
  line: ConnectionLine,
): DetailsOpener {
  let open: Popover | null = null;
  const close = (): void => {
    open?.close();
    open = null;
  };
  return {
    show(focus, near) {
      import("../menus/connection.ts")
        .then(({ openConnectionDetails }) => {
          const anchor = near?.isConnected
            ? near
            : line.element.hidden
              ? undefined
              : line.element;
          // The dock (its line and tiles) may be gone once the code loaded.
          if (!anchor?.isConnected) return;
          close();
          open = openConnectionDetails(ctx, anchor, focus, () =>
            line.history(),
          );
        })
        .catch(ctx.onError);
    },
    close,
  };
}
