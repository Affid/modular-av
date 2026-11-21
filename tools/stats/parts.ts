// What each release file stands for. Every module is released as
// `<id>-v<version>` with `<id>.zip` (Foundry installing or updating it) and
// `module.json` (a manifest lookup, not an install). The rolling `dev`
// prerelease is deleted and recreated with every build, so its counts start
// over each time and are left out. Groups and colour slots are fixed here, so
// adding a module repaints nothing; parts.test.ts fails when a workspace
// module is missing from the list.

export type GroupId = "core" | "services" | "dock" | "effects" | "starter";

export interface Group {
  readonly id: GroupId;
  readonly name: string;
  /** Colour slot (svg.ts); undefined draws it in the neutral colour. */
  readonly slot: number | undefined;
  /** What its count means, for the stats README. */
  readonly meaning: string;
}

export const GROUPS: readonly Group[] = [
  {
    id: "core",
    name: "Core",
    slot: 0,
    meaning:
      "Foundry installing or updating the core. Every other module requires it, so this is the closest count of how many setups there are, updates included.",
  },
  {
    id: "services",
    name: "Services",
    slot: 1,
    meaning:
      "The modules that carry the call: LiveKit, P2P, Jitsi, and Krisp for LiveKit Cloud.",
  },
  {
    id: "dock",
    name: "Dock",
    slot: 2,
    meaning: "The camera dock and its themes.",
  },
  {
    id: "effects",
    name: "Sound & camera",
    slot: 3,
    meaning:
      "Noise cancellation, the camera background, the audio mixer and the sound effects.",
  },
  {
    id: "starter",
    name: "Starter set",
    slot: undefined,
    meaning:
      "Installs through the quick start. Each one also downloads the core, the dock, LiveKit and noise cancellation, which count under those modules, so it isn't on the card.",
  },
];

/** The groups shown as tiles on the card and as lines in the downloads chart. */
export const CARD_GROUPS: readonly GroupId[] = [
  "core",
  "services",
  "dock",
  "effects",
];

export interface ModuleEntry {
  readonly id: string;
  /** Its module.json title without the "Modular A/V: " prefix. */
  readonly name: string;
  readonly group: GroupId;
}

const entry = (id: string, name: string, group: GroupId): ModuleEntry => ({
  id,
  name,
  group,
});

/** In the order the stats show them: by group, then by importance. */
export const MODULES: readonly ModuleEntry[] = [
  entry("modular-av", "Core", "core"),
  entry("modular-av-livekit", "LiveKit", "services"),
  entry("modular-av-p2p", "P2P", "services"),
  entry("modular-av-jitsi", "Jitsi", "services"),
  entry("modular-av-livekit-krisp", "Krisp for LiveKit Cloud", "services"),
  entry("modular-av-dock", "Dock", "dock"),
  entry("modular-av-dock-vines", "Vines theme", "dock"),
  entry("modular-av-dock-scrolls", "Scrolls theme", "dock"),
  entry("modular-av-dock-hides", "Hides theme", "dock"),
  entry("modular-av-mic-denoise", "Noise cancellation", "effects"),
  entry("modular-av-cam-background", "Camera background", "effects"),
  entry("modular-av-audio-mixer", "Audio mixer", "effects"),
  entry("modular-av-audio-boost", "Mic boost", "effects"),
  entry("modular-av-audio-echo", "Echo", "effects"),
  entry("modular-av-audio-eq", "EQ", "effects"),
  entry("modular-av-audio-radio", "Radio", "effects"),
  entry("modular-av-audio-reverb", "Reverb", "effects"),
  entry("modular-av-starter-set", "Starter set", "starter"),
];

export const DEV_TAG = "dev";

export type FileKind =
  | { readonly kind: "zip"; readonly module: ModuleEntry }
  | { readonly kind: "manifest"; readonly module: ModuleEntry }
  | { readonly kind: "dev" }
  | { readonly kind: "unknown" };

const TAG = /^(.+)-v(\d+\.\d+\.\d+\S*)$/;

/** The version in a module's release tag, such as "0.13.2". */
export const versionOf = (tag: string): string | undefined =>
  TAG.exec(tag)?.[2];

export function classify(tag: string, asset: string): FileKind {
  if (tag === DEV_TAG) return { kind: "dev" };
  const id = TAG.exec(tag)?.[1];
  const module = MODULES.find((m) => m.id === id);
  if (!module) return { kind: "unknown" };
  if (asset === `${module.id}.zip`) return { kind: "zip", module };
  if (asset === "module.json") return { kind: "manifest", module };
  return { kind: "unknown" };
}

export function groupOf(id: GroupId): Group {
  const group = GROUPS.find((g) => g.id === id);
  if (!group) throw new Error(`No group ${id}`);
  return group;
}
