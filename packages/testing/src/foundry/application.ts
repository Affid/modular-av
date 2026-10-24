/**
 * A stand-in for Foundry v14's ApplicationV2 (client/applications/api/
 * application.mjs): its render steps, which subclasses override, a framed
 * or frameless element in the page, and closing. Without a document it
 * only records renders.
 */

export interface ApplicationOptions {
  readonly id?: string;
  readonly tag?: string;
  readonly window?: {
    readonly title?: string;
    readonly frame?: boolean;
    readonly icon?: string;
  };
  readonly [key: string]: unknown;
}

export interface RenderOptions {
  readonly force?: boolean;
  readonly parts?: readonly string[];
}

/** The page's document, if the test runs with one (happy-dom, a browser). */
export const pageDocument = (): Document | undefined =>
  (globalThis as { document?: Document }).document;

function mergeOptions(
  defaults: ApplicationOptions,
  given: ApplicationOptions,
): ApplicationOptions {
  return {
    ...defaults,
    ...given,
    window: { ...defaults.window, ...given.window },
  };
}

/** The window's element; content goes in `.window-content` when framed. */
function createElement(
  doc: Document,
  options: ApplicationOptions,
): { element: HTMLElement; content: HTMLElement } {
  const element = doc.createElement(options.tag ?? "div");
  if (options.id) element.id = options.id;
  if (options.window?.frame === false) return { element, content: element };
  const header = doc.createElement("header");
  header.className = "window-header";
  const title = doc.createElement("h1");
  title.className = "window-title";
  title.textContent = options.window?.title ?? "";
  header.append(title);
  const content = doc.createElement("section");
  content.className = "window-content";
  element.append(header, content);
  return { element, content };
}

export class FakeApplicationV2 {
  static DEFAULT_OPTIONS: ApplicationOptions = {};

  readonly options: ApplicationOptions;
  renders: readonly RenderOptions[] = [];
  element: HTMLElement | null = null;
  rendered = false;
  #content: HTMLElement | null = null;

  constructor(options: ApplicationOptions = {}) {
    const defaults = (this.constructor as typeof FakeApplicationV2)
      .DEFAULT_OPTIONS;
    this.options = mergeOptions(defaults, options);
  }

  async render(options: RenderOptions = {}): Promise<this> {
    this.renders = [...this.renders, options];
    const doc = pageDocument();
    if (!doc) return this;
    const renderOptions = { ...options };
    this._configureRenderOptions(renderOptions);
    const parts = this._configureRenderParts(renderOptions);
    const result = await this._renderHTML({ parts }, renderOptions);
    const first = this.element === null;
    if (first) {
      const created = createElement(doc, this.options);
      this.element = created.element;
      this.#content = created.content;
      this._insertElement(created.element);
    }
    this._replaceHTML(result, this.#content ?? doc.body, renderOptions);
    if (first) await this._onFirstRender({}, renderOptions);
    await this._onRender({}, renderOptions);
    this.rendered = true;
    return this;
  }

  close(): Promise<this> {
    this.element?.remove();
    this.element = null;
    this.#content = null;
    this.rendered = false;
    this._onClose({});
    return Promise.resolve(this);
  }

  _insertElement(element: HTMLElement): void {
    pageDocument()?.body.append(element);
  }

  _configureRenderOptions(_options: { parts?: readonly string[] }): void {
    // Foundry's default fills in which parts to render.
  }

  _configureRenderParts(_options: object): Record<string, object> {
    return {};
  }

  _renderHTML(_context: object, _options: object): Promise<unknown> {
    return Promise.resolve({});
  }

  _replaceHTML(
    _result: unknown,
    _content: HTMLElement,
    _options: object,
  ): void {
    // Abstract in Foundry.
  }

  _onFirstRender(_context: object, _options: object): Promise<void> {
    return Promise.resolve();
  }

  _onRender(_context: object, _options: object): Promise<void> {
    return Promise.resolve();
  }

  _onClose(_options: object): void {
    // Nothing by default.
  }
}

/** client/applications/settings/menus/av-config.mjs, as a plain window. */
export class FakeAVConfig extends FakeApplicationV2 {
  static override DEFAULT_OPTIONS: ApplicationOptions = {
    tag: "form",
    id: "av-config",
    window: { title: "WEBRTC.Title", icon: "fa-solid fa-headset" },
  };
}
