/**
 * Contributions (handoff §3 "Extension points"): small declared items any
 * module adds and every UI renders in its own style. Declarations are
 * fixed once registered; what changes comes through their observables,
 * which a UI subscribes to only while the item is shown.
 */
import type { Observable, ParticipantId } from "./service.ts";
import type { ParticipantState } from "./state.ts";

/** An i18n key or plain text. Always shown as text, never as HTML. */
export type Label = string;

interface ItemBase {
  /** Unique among all contributions, e.g. "modular-av-cam-background.blur". */
  readonly id: string;
  readonly label: Label;
  /** Font Awesome classes, e.g. "fa-solid fa-droplet". */
  readonly icon?: string;
}

export interface ToggleState {
  readonly on: boolean;
  /** Shown but can't be changed now. */
  readonly disabled?: boolean;
  /** Changing: shown as working. */
  readonly busy?: boolean;
}

export interface ToggleControl extends ItemBase {
  readonly type: "toggle";
  readonly state: Observable<ToggleState>;
  set(on: boolean): Promise<void>;
  /** Shown while on, e.g. a strength slider. They have no controls themselves. */
  readonly controls?: readonly Control[];
}

export interface RangeControl extends ItemBase {
  readonly type: "range";
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** After the value, e.g. "%". */
  readonly unit?: Label;
  readonly state: Observable<number>;
  set(value: number): Promise<void>;
}

export interface ChoiceOption {
  readonly value: string;
  readonly label: Label;
  /**
   * A picture of the option (its URL), e.g. a background's thumbnail. UIs
   * may show the options as pictures to pick, named by their labels.
   */
  readonly image?: string;
}

export interface ChoiceControl extends ItemBase {
  readonly type: "choice";
  readonly options: readonly ChoiceOption[];
  readonly state: Observable<string>;
  set(value: string): Promise<void>;
}

export interface ButtonControl extends ItemBase {
  readonly type: "button";
  run(): Promise<void>;
}

export type Control =
  ToggleControl | RangeControl | ChoiceControl | ButtonControl;

interface ContributionBase {
  /** Lower comes first; 0 if not given. */
  readonly order?: number;
  /**
   * Discouraged: draws the item itself, for what a declaration can't
   * express. Returns its cleanup. UIs may ignore it.
   */
  readonly render?: (element: HTMLElement) => () => void;
}

/** In the UI's quick controls (`quick`) or its settings window (`settings`). */
export type ControlContribution = Control &
  ContributionBase & {
    readonly kind: "control";
    readonly place: "quick" | "settings";
  };

/** An item of a participant's menu, e.g. a GM's "Block video". */
export interface ParticipantActionContribution
  extends ItemBase, ContributionBase {
  readonly kind: "participant-action";
  /** Only GMs see it. */
  readonly gmOnly?: boolean;
  /** Whether it is offered for this participant; always if not given. */
  appliesTo?(participant: ParticipantState): boolean;
  /** Who it is checked for, if it is on or off. */
  readonly checked?: Observable<ReadonlySet<ParticipantId>>;
  run(participant: ParticipantId): Promise<void>;
}

/** A badge on the participants it is active for, e.g. "Blur on". */
export interface IndicatorContribution extends ItemBase, ContributionBase {
  readonly kind: "indicator";
  readonly icon: string;
  readonly active: Observable<ReadonlySet<ParticipantId>>;
}

/** A row of the connection details, e.g. the server's region. */
export interface StatusRowContribution extends ItemBase, ContributionBase {
  readonly kind: "status-row";
  /** Null hides the row. */
  readonly value: Observable<Label | null>;
}

/**
 * A section of the settings window: Foundry settings, by key
 * ("<module-id>.<key>"), rendered from their registration, and controls.
 * World settings are shown to GMs only.
 */
export interface SettingsSectionContribution
  extends ItemBase, ContributionBase {
  readonly kind: "settings-section";
  readonly settings: readonly string[];
  /** Of `settings`, those holding a secret: their fields never show the value. */
  readonly secrets?: readonly string[];
  readonly controls?: readonly Control[];
}

export type Contribution =
  | ControlContribution
  | ParticipantActionContribution
  | IndicatorContribution
  | StatusRowContribution
  | SettingsSectionContribution;

export type ContributionKind = Contribution["kind"];
