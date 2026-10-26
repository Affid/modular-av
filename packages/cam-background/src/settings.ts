import type { Observable } from "@modular-av/api";

export const MODULE_ID = "modular-av-cam-background";

/** The slice of Foundry's settings this module uses. */
export interface SettingsApi {
  register(
    namespace: string,
    key: string,
    config: Readonly<Record<string, unknown>>,
  ): void;
  get(namespace: string, key: string): unknown;
  set(namespace: string, key: string, value: unknown): Promise<unknown>;
}

export type Quality = "standard" | "high";
const QUALITIES: readonly Quality[] = ["standard", "high"];
const DEFAULT_STRENGTH = 0.5;
const STRENGTH = { min: 0.1, max: 1, step: 0.05 } as const;

export const SETTINGS = {
  quality: "quality",
  strength: "blurStrength",
  image: "image",
  customImage: "customImage",
} as const;

export interface ImageChoice {
  /** A path on Foundry's server, or a full http(s) address. */
  readonly path: string;
  readonly label: string;
}

/**
 * Backgrounds to pick from: this module's own (drawn for it) and the art
 * of Foundry's setup screen, which every Foundry server has (used where it
 * is, never copied).
 */
export const PRESET_IMAGES: readonly ImageChoice[] = [
  ...["study", "night", "forest"].map((name) => ({
    path: `modules/${MODULE_ID}/backgrounds/${name}.svg`,
    label: `${MODULE_ID}.images.${name}`,
  })),
  {
    path: "ui/backgrounds/setup.webp",
    label: `${MODULE_ID}.images.foundryFantasy`,
  },
  {
    path: "ui/backgrounds/setup-scifi.webp",
    label: `${MODULE_ID}.images.foundryScifi`,
  },
];

const DEFAULT_IMAGE = PRESET_IMAGES[0]?.path ?? "";

/**
 * Per device: what this computer can run and what this player likes.
 * Returns them as observables, told by each setting's `onChange`.
 */
export function registerSettings(
  settings: SettingsApi,
): CameraBackgroundSettings {
  const observed = settingsOf(settings);
  const onChange = (key: string): void => {
    observed.changed(key);
  };
  const client = (
    key: string,
    config: Readonly<Record<string, unknown>>,
  ): void => {
    settings.register(MODULE_ID, key, {
      scope: "client",
      config: false,
      ...config,
      onChange: () => {
        onChange(key);
      },
    });
  };
  client(SETTINGS.quality, {
    name: `${MODULE_ID}.settings.quality.name`,
    hint: `${MODULE_ID}.settings.quality.hint`,
    type: String,
    choices: Object.fromEntries(
      QUALITIES.map((q) => [q, `${MODULE_ID}.settings.quality.choices.${q}`]),
    ),
    default: "standard",
  });
  client(SETTINGS.strength, {
    name: `${MODULE_ID}.settings.blurStrength.name`,
    hint: `${MODULE_ID}.settings.blurStrength.hint`,
    type: Number,
    range: STRENGTH,
    default: DEFAULT_STRENGTH,
  });
  client(SETTINGS.image, { type: String, default: DEFAULT_IMAGE });
  client(SETTINGS.customImage, { type: String, default: "" });
  return observed;
}

export interface CameraBackgroundSettings {
  readonly quality: Observable<Quality>;
  /** 0.1 to 1. */
  readonly strength: Observable<number>;
  /** The chosen image's path or address. */
  readonly image: Observable<string>;
  /** The presets, then the player's own image if they picked one. */
  readonly images: Observable<readonly ImageChoice[]>;
  set(key: keyof typeof SETTINGS, value: unknown): Promise<void>;
}

const readQuality = (value: unknown): Quality =>
  QUALITIES.find((q) => q === value) ?? "standard";

const readStrength = (value: unknown): number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= STRENGTH.min &&
  value <= STRENGTH.max
    ? value
    : DEFAULT_STRENGTH;

const readText = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

/** The settings as observables; `changed` tells the key's listeners. */
function settingsOf(settings: SettingsApi): CameraBackgroundSettings & {
  changed(key: string): void;
} {
  const listeners = new Map<string, Set<() => void>>();
  const get = (key: string): unknown => settings.get(MODULE_ID, key);
  const observable = <T>(
    keys: readonly string[],
    read: () => T,
  ): Observable<T> => ({
    get: read,
    subscribe(listener) {
      const call = (): void => {
        listener(read());
      };
      for (const key of keys) {
        const set = listeners.get(key) ?? new Set();
        set.add(call);
        listeners.set(key, set);
      }
      return () => {
        for (const key of keys) listeners.get(key)?.delete(call);
      };
    },
  });
  const custom = (): string => readText(get(SETTINGS.customImage), "");
  return {
    quality: observable([SETTINGS.quality], () =>
      readQuality(get(SETTINGS.quality)),
    ),
    strength: observable([SETTINGS.strength], () =>
      readStrength(get(SETTINGS.strength)),
    ),
    image: observable([SETTINGS.image], () =>
      readText(get(SETTINGS.image), DEFAULT_IMAGE),
    ),
    images: observable([SETTINGS.customImage], () =>
      custom()
        ? [
            ...PRESET_IMAGES,
            { path: custom(), label: `${MODULE_ID}.images.custom` },
          ]
        : PRESET_IMAGES,
    ),
    async set(key, value) {
      await settings.set(MODULE_ID, SETTINGS[key], value);
    },
    changed(key) {
      for (const listener of [...(listeners.get(key) ?? [])]) listener();
    },
  };
}

/**
 * The address to load an image from: a full http(s) address as it is, a
 * path through Foundry's route (its prefix), anything else refused.
 */
export function imageUrl(
  path: string,
  route: (path: string) => string,
): string | null {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("//") || /^[a-z][\w+.-]*:/i.test(path)) return null;
  return route(path.replace(/^\/+/, ""));
}
