import type {
  AVCommands,
  AVState,
  ButtonControl,
  ChoiceControl,
  ChoiceOption,
  Contribution,
  EffectState,
  Observable,
  RangeControl,
  Store,
  ToggleState,
} from "@modular-av/api";
import { ImageLoadError } from "./errors.ts";
import {
  type CameraBackgroundSettings,
  imageUrl,
  MODULE_ID,
} from "./settings.ts";

export interface ControlsDeps {
  readonly api: {
    readonly state: Pick<Store<AVState>, "get" | "subscribe">;
    readonly commands: Pick<AVCommands, "setEffectEnabled">;
  };
  readonly settings: CameraBackgroundSettings;
  /** Foundry's route for a path on its server. */
  readonly route: (path: string) => string;
  /** Asks the player for an image: a path or an address, or null. */
  readonly pickImage: (current: string) => Promise<string | null>;
}

const toggleOf = (status: EffectState | undefined): ToggleState => ({
  on: status?.status === "starting" || status?.status === "running",
  busy: status?.status === "starting",
  disabled: status?.status === "unsupported",
});

const sameToggle = (a: ToggleState, b: ToggleState): boolean =>
  a.on === b.on && a.busy === b.busy && a.disabled === b.disabled;

/** An effect's state in the core's store, as a toggle's. */
function effectToggle(
  state: ControlsDeps["api"]["state"],
  id: string,
): Observable<ToggleState> {
  return {
    get: () => toggleOf(state.get().local.effects[id]),
    subscribe: (listener) =>
      state.subscribe((s) => toggleOf(s.local.effects[id]), listener, {
        equals: sameToggle,
      }),
  };
}

function map<A, B>(source: Observable<A>, f: (a: A) => B): Observable<B> {
  return {
    get: () => f(source.get()),
    subscribe: (listener) =>
      source.subscribe((value) => {
        listener(f(value));
      }),
  };
}

function strengthControl(settings: CameraBackgroundSettings): RangeControl {
  return {
    type: "range",
    id: `${MODULE_ID}.strength`,
    label: `${MODULE_ID}.controls.strength`,
    min: 10,
    max: 100,
    step: 5,
    unit: "%",
    state: map(settings.strength, (s) => Math.round(s * 100)),
    set: (value) => settings.set("strength", value / 100),
  };
}

function imageControls(
  deps: ControlsDeps,
): readonly [ChoiceControl, ButtonControl] {
  const { settings } = deps;
  const choice: ChoiceControl = {
    type: "choice",
    id: `${MODULE_ID}.image`,
    label: `${MODULE_ID}.controls.image`,
    // Read whenever a UI draws it: the player's own image joins the list.
    get options(): readonly ChoiceOption[] {
      return settings.images.get().map((i) => {
        const url = imageUrl(i.path, deps.route);
        return url
          ? { value: i.path, label: i.label, image: url }
          : { value: i.path, label: i.label };
      });
    },
    state: settings.image,
    set: (value) => settings.set("image", value),
  };
  const pick: ButtonControl = {
    type: "button",
    id: `${MODULE_ID}.pick`,
    label: `${MODULE_ID}.controls.pick`,
    icon: "fa-solid fa-folder-open",
    async run() {
      const path = await deps.pickImage(settings.image.get());
      if (!path) return;
      if (!imageUrl(path, deps.route))
        throw new ImageLoadError(`Not an image address: ${path}`);
      await settings.set("customImage", path);
      await settings.set("image", path);
    },
  };
  return [choice, pick];
}

/**
 * Quick toggles for blur (with its strength) and replace (with the image),
 * and a settings section with the quality: every UI draws them its way.
 */
export function backgroundContributions(
  deps: ControlsDeps,
): readonly Contribution[] {
  const { api, settings } = deps;
  const strength = strengthControl(settings);
  const images = imageControls(deps);
  const toggle = (
    mode: "blur" | "replace",
    icon: string,
    controls: ToggleControlChildren,
  ): Contribution => ({
    kind: "control",
    place: "quick",
    type: "toggle",
    id: `${MODULE_ID}.${mode}`,
    label: `${MODULE_ID}.effects.${mode}`,
    icon,
    state: effectToggle(api.state, `background-${mode}`),
    set: (on) => api.commands.setEffectEnabled(`background-${mode}`, on),
    controls,
  });
  return [
    toggle("blur", "fa-solid fa-droplet", [strength]),
    toggle("replace", "fa-solid fa-image", images),
    {
      kind: "settings-section",
      id: `${MODULE_ID}.section`,
      label: `${MODULE_ID}.section`,
      icon: "fa-solid fa-user",
      settings: [`${MODULE_ID}.quality`],
      controls: [strength, ...images],
    },
  ];
}

type ToggleControlChildren = NonNullable<
  Extract<Contribution, { type: "toggle" }>["controls"]
>;
