import { el, icon, setLabel } from "@modular-av/kit";

export interface ButtonState {
  /** For toggles: `aria-pressed`. */
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  /** The dock's own text, already localized. */
  readonly label?: string;
  readonly icon?: string;
}

export interface IconButton {
  readonly element: HTMLButtonElement;
  set(state: ButtonState): void;
}

export interface IconButtonOptions extends ButtonState {
  readonly className: string;
  readonly label: string;
  readonly icon: string;
  readonly onClick: (button: HTMLButtonElement) => void;
  /** A toggle gets `aria-pressed` from the start. */
  readonly toggle?: boolean;
}

/**
 * A button with an icon and no visible text: its label is its accessible
 * name and Foundry's tooltip. Only what changed is written.
 */
export function iconButton(
  doc: Document,
  options: IconButtonOptions,
): IconButton {
  const element = el("button", {
    doc,
    className: `mav-dock-button ${options.className}`,
    attrs: { type: "button" },
  });
  let current: Required<Omit<ButtonState, "pressed">> & { pressed?: boolean } =
    {
      label: "",
      icon: "",
      disabled: false,
    };
  const set = (state: ButtonState): void => {
    if (state.label !== undefined && state.label !== current.label)
      setLabel(element, state.label);
    if (state.icon !== undefined && state.icon !== current.icon)
      element.replaceChildren(icon(state.icon, doc));
    if (state.pressed !== undefined && state.pressed !== current.pressed)
      element.setAttribute("aria-pressed", String(state.pressed));
    if (state.disabled !== undefined && state.disabled !== current.disabled)
      element.disabled = state.disabled;
    current = { ...current, ...state };
  };
  set({
    label: options.label,
    icon: options.icon,
    disabled: options.disabled ?? false,
    ...(options.toggle ? { pressed: options.pressed ?? false } : {}),
  });
  element.addEventListener("click", () => {
    options.onClick(element);
  });
  return { element, set };
}
