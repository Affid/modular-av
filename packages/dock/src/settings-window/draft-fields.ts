import type { DeviceKind, GateFallback, VoiceMode } from "@modular-av/api";
import type { DockContext } from "../context.ts";
import { chosenInGroup, groupsOf } from "../panel/effects.ts";

/** Foundry's world A/V modes (`AVSettings.AV_MODES`). */
export const WORLD_MODES = { off: 0, audio: 1, video: 2, both: 3 } as const;
export type WorldMode = keyof typeof WORLD_MODES;

export interface Relay {
  readonly type: "server" | "custom";
  readonly url: string;
  readonly username: string;
  readonly password: string;
}

/** Everything the window's own fields hold, as saved or as drafted. */
export interface DraftValues {
  readonly audioInput: string;
  readonly videoInput: string;
  readonly audioOutput: string;
  readonly voiceMode: VoiceMode;
  /** Push to talk's key, a KeyboardEvent code; "" for none. */
  readonly pttKey: string;
  readonly sensitivityAuto: boolean;
  readonly threshold: number;
  readonly gateFallback: GateFallback;
  /** The effect chosen in each group ("" for none), by group name. */
  readonly effects: Readonly<Record<string, string>>;
  readonly receiveVideo: boolean;
  /** A player's own theme ("" follows the GM's); a GM's: everyone's. */
  readonly theme: string;
  readonly camerasOwn: string;
  readonly camerasWorld: string;
  readonly settingsWindow: string;
  readonly service: string;
  readonly worldMode: WorldMode;
  readonly relay: Relay;
}

export type DraftKey = keyof DraftValues;

/** How a field is read as saved, and what saving it does. */
export interface Field<K extends DraftKey> {
  read(ctx: DockContext): DraftValues[K];
  apply(ctx: DockContext, value: DraftValues[K]): Promise<void>;
  /** Saving it reloads every page, or this one. */
  readonly reload?: "everyone" | "self";
  /** Only a GM sets it. */
  readonly gm?: boolean;
}

const CORE = "modular-av";

const local = (ctx: DockContext) => ctx.api.state.get().local;

/** The device fields are named as the API's device kinds. */
const device = <K extends DeviceKind>(kind: K): Field<K> => ({
  read: (ctx) => local(ctx).chosenDevices[kind],
  apply: (ctx, id) => ctx.api.commands.setDevice(kind, id),
});

type StringKey = "camerasOwn" | "camerasWorld" | "settingsWindow" | "service";

/** A core setting by key: a string, or "" while it holds none. */
const coreSetting = <K extends StringKey>(
  key: string,
  extra: Pick<Field<K>, "reload" | "gm">,
): Field<K> => ({
  ...extra,
  read: (ctx) => {
    const value = ctx.settings.get(CORE, key);
    return typeof value === "string" ? value : "";
  },
  apply: async (ctx, value) => {
    await ctx.settings.set(CORE, key, value);
  },
});

interface RtcWorld {
  readonly mode?: number;
  readonly turn?: Partial<Relay>;
}

const rtcWorld = (ctx: DockContext): RtcWorld => {
  const value = ctx.settings.get("core", "rtcWorldSettings");
  return typeof value === "object" && value !== null ? value : {};
};

const setRtcWorld = async (
  ctx: DockContext,
  change: RtcWorld,
): Promise<void> => {
  await ctx.settings.set("core", "rtcWorldSettings", {
    ...rtcWorld(ctx),
    ...change,
  });
};

const modeOf = (value: number | undefined): WorldMode =>
  (Object.entries(WORLD_MODES).find(([, n]) => n === value)?.[0] as
    WorldMode | undefined) ?? "off";

function effectChoices(ctx: DockContext): Record<string, string> {
  const effects = local(ctx).effects;
  return Object.fromEntries(
    groupsOf(ctx.api.effects.list()).map(([name, group]) => [
      name,
      chosenInGroup(group, effects),
    ]),
  );
}

/** Each group whose choice changed: its new effect on, or the old one off. */
async function applyEffects(
  ctx: DockContext,
  chosen: Readonly<Record<string, string>>,
): Promise<void> {
  const now = effectChoices(ctx);
  for (const [name, id] of Object.entries(chosen)) {
    const was = now[name] ?? "";
    if (id === was) continue;
    await (id
      ? ctx.api.commands.setEffectEnabled(id, true)
      : ctx.api.commands.setEffectEnabled(was, false));
  }
}

/** A GM picks everyone's theme, and sees it; a player picks their own. */
const theme: Field<"theme"> = {
  read: (ctx) => (ctx.isGM ? ctx.themes.worldDefault() : ctx.themes.own()),
  apply: async (ctx, id) => {
    if (!ctx.isGM) return ctx.themes.choose(id);
    await ctx.themes.chooseWorldDefault(id);
    await ctx.themes.choose("");
  },
};

export const FIELDS: { readonly [K in DraftKey]: Field<K> } = {
  audioInput: device("audioInput"),
  videoInput: device("videoInput"),
  audioOutput: device("audioOutput"),
  voiceMode: {
    read: (ctx) => local(ctx).voiceMode,
    apply: (ctx, mode) => ctx.api.commands.setVoiceMode(mode),
  },
  pttKey: {
    read: (ctx) => ctx.pushToTalkKeys()[0] ?? "",
    apply: (ctx, code) => ctx.setPushToTalkKey(code),
  },
  sensitivityAuto: {
    read: (ctx) => local(ctx).inputSensitivity.auto,
    apply: (ctx, auto) => ctx.api.commands.setInputSensitivity({ auto }),
  },
  threshold: {
    read: (ctx) => local(ctx).inputSensitivity.threshold,
    apply: (ctx, threshold) =>
      ctx.api.commands.setInputSensitivity({ threshold }),
  },
  gateFallback: {
    read: (ctx) => local(ctx).gateFallback,
    apply: (ctx, fallback) => ctx.api.commands.setGateFallback(fallback),
  },
  effects: { read: effectChoices, apply: applyEffects },
  receiveVideo: {
    read: (ctx) => local(ctx).receiveVideo,
    apply: (ctx, on) => ctx.api.commands.setReceiveVideo(on),
  },
  theme,
  camerasOwn: coreSetting("camerasPlayer", { reload: "self" }),
  camerasWorld: coreSetting("cameras", { reload: "everyone", gm: true }),
  settingsWindow: coreSetting("settingsWindow", {
    reload: "everyone",
    gm: true,
  }),
  service: coreSetting("service", { reload: "everyone", gm: true }),
  worldMode: {
    gm: true,
    reload: "everyone",
    read: (ctx) => modeOf(rtcWorld(ctx).mode),
    apply: (ctx, mode) => setRtcWorld(ctx, { mode: WORLD_MODES[mode] }),
  },
  relay: {
    gm: true,
    read: (ctx) => {
      // Only a GM sets it: a player's draft holds no password.
      const turn = ctx.isGM ? (rtcWorld(ctx).turn ?? {}) : {};
      return {
        type: turn.type === "custom" ? "custom" : "server",
        url: turn.url ?? "",
        username: turn.username ?? "",
        password: turn.password ?? "",
      };
    },
    apply: (ctx, relay) => setRtcWorld(ctx, { turn: relay }),
  },
};
