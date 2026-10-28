import type {
  ButtonControl,
  ChoiceControl,
  ChoiceOption,
  Contribution,
  ControlContribution,
  Observable,
  RangeControl,
} from "@modular-av/api";
import { ImageLoadError } from "./errors.ts";
import {
  type CameraBackgroundSettings,
  imageUrl,
  MODULE_ID,
} from "./settings.ts";

export interface ControlsDeps {
  readonly settings: CameraBackgroundSettings;
  /** Foundry's route for a path on its server. */
  readonly route: (path: string) => string;
  /** Asks the player for an image: a path or an address, or null. */
  readonly pickImage: (current: string) => Promise<string | null>;
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

/** Shown with the effect's choice, while it is chosen. */
const attachedTo = (effect: string) =>
  ({ kind: "control", place: "quick", effect }) as const;

function strengthControl(
  settings: CameraBackgroundSettings,
): RangeControl & ControlContribution {
  return {
    ...attachedTo("background-blur"),
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

function imageControls(deps: ControlsDeps): readonly ControlContribution[] {
  const { settings } = deps;
  const choice: ChoiceControl & ControlContribution = {
    ...attachedTo("background-replace"),
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
  const pick: ButtonControl & ControlContribution = {
    ...attachedTo("background-replace"),
    type: "button",
    id: `${MODULE_ID}.pick`,
    label: `${MODULE_ID}.controls.pick`,
    icon: "fa-solid fa-folder-open",
    async run() {
      const path = (await deps.pickImage(settings.image.get()))?.trim();
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
 * The blur's strength and the replacement's images, each shown with its
 * effect's choice, and the quality on the settings window's Video tab:
 * every UI draws them its way.
 */
export function backgroundContributions(
  deps: ControlsDeps,
): readonly Contribution[] {
  return [
    strengthControl(deps.settings),
    ...imageControls(deps),
    {
      kind: "settings-section",
      id: `${MODULE_ID}.section`,
      label: `${MODULE_ID}.section`,
      icon: "fa-solid fa-user",
      tab: "video",
      settings: [`${MODULE_ID}.quality`],
    },
  ];
}
