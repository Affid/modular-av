/**
 * The parts of Foundry's globals the core uses. Kept narrow on purpose: it
 * grows with the core, and the fake Foundry in @modular-av/testing satisfies
 * it structurally. Shapes follow Foundry v14.
 */
export interface FoundryModule {
  readonly id: string;
  readonly version: string;
  api?: unknown;
}

export interface FoundryUser {
  readonly id: string;
  readonly name: string;
  /** A `Color` in Foundry (its `toString()` is the hex), a string in fakes. */
  readonly color?: { toString(): string } | string | null;
  readonly avatar?: string | null;
  readonly isGM: boolean;
  readonly active: boolean;
  can(permission: string): boolean;
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
  update(changes: Readonly<Record<string, unknown>>): Promise<unknown>;
  /** Tells the other clients (Foundry's `userActivity`). */
  broadcastActivity(activity: Readonly<Record<string, unknown>>): void;
}

export interface FoundryUsers {
  get(id: string): FoundryUser | undefined;
  readonly contents: readonly FoundryUser[];
}

export interface FoundrySocket {
  emit(
    event: string,
    data: unknown,
    options?: { readonly recipients?: readonly string[] },
  ): void;
  on(event: string, handler: (data: unknown, senderId: string) => void): void;
}

export type SettingScope = "world" | "user" | "client";

export interface FoundrySettingConfig {
  readonly scope: SettingScope;
  readonly default: unknown;
  readonly name?: string;
  readonly hint?: string;
  readonly config?: boolean;
  readonly type?: unknown;
  readonly choices?: Readonly<Record<string, string>>;
  readonly requiresReload?: boolean;
  readonly onChange?: (value: unknown) => void;
}

/** A `game.settings.registerMenu` entry: Foundry opens `new type()`. */
export interface FoundrySettingMenu {
  readonly type: new () => { render(options?: object): unknown };
}

export interface FoundrySettings {
  /** Foundry's own "core.webrtc" is its A/V settings window. */
  readonly menus: Map<string, FoundrySettingMenu>;
  register(namespace: string, key: string, config: FoundrySettingConfig): void;
  get(namespace: string, key: string): unknown;
  set(namespace: string, key: string, value: unknown): Promise<unknown>;
}

export interface FoundryI18n {
  localize(key: string): string;
  format(key: string, data: Readonly<Record<string, string>>): string;
}

/** `core.rtcClientSettings` entries for one user. */
export interface AVUserEntry {
  readonly muted?: boolean;
  readonly hidden?: boolean;
  readonly blocked?: boolean;
  readonly volume?: number;
}

export interface AVSettingsLike {
  readonly world: { readonly mode: number };
  readonly client: {
    readonly audioSrc: string;
    readonly videoSrc: string;
    readonly audioSink: string;
    readonly muteAll: boolean;
    readonly disableVideo: boolean;
    readonly dockPosition?: string;
    readonly voice: { readonly mode: string };
    readonly users: Readonly<Record<string, AVUserEntry | undefined>>;
  };
  readonly activity: Readonly<
    Record<
      string,
      | {
          readonly muted?: boolean;
          readonly hidden?: boolean;
          readonly speaking?: boolean;
        }
      | undefined
    >
  >;
  set(scope: "client", path: string, value: unknown): void;
}

export interface AVMasterLike {
  readonly settings: AVSettingsLike;
  readonly client: object;
  /** Foundry's A/V settings window, which its camera dock's gear opens. */
  config: { render(options?: object): unknown };
  /**
   * Sets the local player's broadcast intent: Foundry's speaking flag, the
   * activity it tells the others and the dock's indicator.
   */
  broadcast(intent: boolean): void;
}

export interface FoundryGame {
  readonly modules: ReadonlyMap<string, FoundryModule>;
  readonly user: FoundryUser;
  readonly userId: string;
  readonly users: FoundryUsers;
  readonly settings: FoundrySettings;
  readonly socket: FoundrySocket;
  readonly i18n: FoundryI18n;
  readonly world: { readonly id: string };
  readonly ready: boolean;
  readonly webrtc: AVMasterLike | null;
  /** Bindings by namespace and action, e.g. ("core", "pushToTalk"). */
  readonly keybindings?: {
    get(namespace: string, action: string): readonly { readonly key: string }[];
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- hooks pass any arguments, as in Foundry
type HookHandler = (...args: any[]) => unknown;

export interface FoundryHooks {
  on(hook: string, fn: HookHandler): number;
  once(hook: string, fn: HookHandler): number;
  off(hook: string, fnOrId: HookHandler | number): void;
  callAll(hook: string, ...args: unknown[]): boolean;
}

export interface FoundryNotifications {
  info(message: string): unknown;
  warn(message: string): unknown;
  error(message: string): unknown;
}

export interface FoundryUi {
  readonly notifications: FoundryNotifications;
  readonly webrtc: { render(options?: object): unknown } | null;
  readonly players?: { render(options?: object): unknown } | null;
  /** Foundry makes room for a vertical camera dock in it. */
  readonly hotbar?: {
    /** Null until the hotbar first renders. */
    readonly element?: Element | null;
    _onResize?(): unknown;
  } | null;
}

/** The core replaces both classes at `init`. */
export interface FoundryConfig {
  readonly WebRTC: { clientClass: unknown };
  readonly ui: { webrtc: unknown };
}

/** The base classes the core subclasses. */
export interface FoundryNamespace {
  readonly av: { readonly AVClient: abstract new (...args: never[]) => object };
  readonly applications: {
    readonly api: {
      readonly ApplicationV2: abstract new (...args: never[]) => object;
    };
    readonly apps: {
      readonly av: {
        readonly CameraViews: abstract new (...args: never[]) => object;
      };
    };
  };
  readonly utils: { getRoute(path: string): string };
}

declare global {
  var game: FoundryGame;
  var Hooks: FoundryHooks;
  var ui: FoundryUi;
  var CONFIG: FoundryConfig;
  var foundry: FoundryNamespace;
}
