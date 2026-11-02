import { el } from "@modular-av/kit";
import { MODULE_ID } from "../constants.ts";
import type { Rendered } from "./context.ts";

type ApplicationBase = abstract new (...args: never[]) => object;

/** The parts of Foundry's ApplicationV2 the window overrides or calls. */
interface ApplicationLike {
  readonly element: HTMLElement | null;
  render(options?: object): Promise<unknown>;
  _renderHTML(context: object, options: object): Promise<unknown>;
  _replaceHTML(result: unknown, content: HTMLElement, options: object): void;
  _onClose(options: object): void;
}

const STYLESHEET_ID = `${MODULE_ID}-styles`;

function loadStyles(doc: Document, href: string): void {
  if (doc.getElementById(STYLESHEET_ID)) return;
  doc.head.append(
    el("link", { doc, attrs: { id: STYLESHEET_ID, rel: "stylesheet", href } }),
  );
}

export interface MixerWindowDeps {
  readonly title: string;
  readonly stylesheet: string;
  fill(doc: Document): Rendered;
}

/** A Foundry window of its own: moved, minimized and closed like any other. */
export function createMixerWindow(
  base: ApplicationBase,
  deps: MixerWindowDeps,
): { render(options?: object): unknown } {
  const Base = base as unknown as new (...args: unknown[]) => ApplicationLike;
  // Not private members: Foundry's constructor may call overridden methods.
  let view: Rendered | null = null;

  class ModularAVMixer extends Base {
    static DEFAULT_OPTIONS = {
      id: MODULE_ID,
      tag: "section",
      classes: [MODULE_ID],
      window: {
        title: deps.title,
        icon: "fa-solid fa-sliders",
        resizable: true,
      },
      position: { width: 620, height: 640 },
    };

    override _renderHTML(): Promise<unknown> {
      return Promise.resolve({});
    }

    override _replaceHTML(_result: unknown, content: HTMLElement): void {
      if (view) return;
      content.style.overflowY = "auto";
      loadStyles(content.ownerDocument, deps.stylesheet);
      view = deps.fill(content.ownerDocument);
      content.replaceChildren(view.element);
    }

    override _onClose(options: object): void {
      super._onClose(options);
      view?.dispose();
      view = null;
    }
  }

  return new ModularAVMixer();
}
