import type {
  ChoiceControl,
  Contribution,
  ControlContribution,
  RangeControl,
  ToggleControl,
} from "@modular-av/api";

/** A control with a value that can be saved and set back: buttons have none. */
export type SettingControl = ControlContribution &
  (RangeControl | ToggleControl | ChoiceControl);

export type SettingValue = number | string | boolean;

export const settingsOf = (
  contributions: readonly Contribution[],
  effect: string,
): readonly SettingControl[] =>
  contributions.filter(
    (c): c is SettingControl =>
      c.kind === "control" && c.effect === effect && c.type !== "button",
  );

export function valueOf(control: SettingControl): SettingValue {
  if (control.type === "toggle") return control.state.get().on;
  return control.state.get();
}

/** Whether `set` may be given `value`: what was saved can be out of date. */
export function accepts(control: SettingControl, value: SettingValue): boolean {
  if (control.type === "toggle") return typeof value === "boolean";
  if (control.type === "choice")
    return control.options.some((option) => option.value === value);
  return (
    typeof value === "number" && value >= control.min && value <= control.max
  );
}

export function setValue(
  control: SettingControl,
  value: SettingValue,
): Promise<void> {
  if (control.type === "toggle") return control.set(value as boolean);
  if (control.type === "choice") return control.set(value as string);
  return control.set(value as number);
}
