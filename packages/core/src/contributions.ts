/**
 * Shape checks for surfaces and contributions, run when they are
 * registered: a UI renders them as declared, so a bad declaration fails
 * there, naming the module's mistake, rather than inside some UI later.
 * Labels are shown as text by every UI; the checks keep them strings.
 */

type Fields = Readonly<Record<string, unknown>>;

const ICON = /^fa-[a-z0-9-]+( fa-[a-z0-9-]+)*$/;
const SETTING_KEY = /^[\w-]+\.[\w.-]+$/;

const CONTRIBUTION_KINDS = [
  "control",
  "participant-action",
  "indicator",
  "status-row",
  "settings-section",
] as const;
const CONTROL_TYPES = ["toggle", "range", "choice", "button"] as const;
const PLACES = ["quick", "settings"] as const;

class Problem extends Error {}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Problem(message);
}

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null;

const isText = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

const isFunction = (value: unknown): boolean => typeof value === "function";

const isObservable = (value: unknown): boolean =>
  isFields(value) && isFunction(value.get) && isFunction(value.subscribe);

const oneOf = (list: readonly string[], value: unknown): boolean =>
  list.some((item) => item === value);

/** What every item has: an id, a label and maybe an icon. */
function checkItem(item: Fields, iconRequired = false): void {
  check(isText(item.id), "needs an id");
  check(isText(item.label), "needs a label (text or an i18n key)");
  if (iconRequired || item.icon !== undefined)
    check(
      typeof item.icon === "string" && ICON.test(item.icon),
      'needs an icon of Font Awesome classes ("fa-solid fa-…")',
    );
}

function checkBase(item: Fields): void {
  checkItem(item);
  if (item.order !== undefined)
    check(Number.isFinite(item.order), "order must be a number");
  if (item.render !== undefined)
    check(isFunction(item.render), "render must be a function");
}

function checkRange(control: Fields): void {
  const { min, max, step } = control;
  check(
    typeof min === "number" &&
      typeof max === "number" &&
      typeof step === "number" &&
      min < max &&
      step > 0,
    "a range needs min < max and a step above 0",
  );
}

function checkOptions(options: unknown): void {
  check(
    Array.isArray(options) &&
      options.length > 0 &&
      options.every(
        (o) => isFields(o) && typeof o.value === "string" && isText(o.label),
      ),
    "options need a text value and label each",
  );
}

function checkControl(control: Fields, nested: boolean): void {
  checkItem(control);
  check(oneOf(CONTROL_TYPES, control.type), "unknown control type");
  if (control.type === "button") {
    check(isFunction(control.run), "a button needs run()");
    return;
  }
  check(isObservable(control.state), "state must be observable");
  check(isFunction(control.set), "a control needs set()");
  if (control.type === "range") checkRange(control);
  if (control.type === "choice") checkOptions(control.options);
  if (control.controls !== undefined) checkControls(control.controls, nested);
}

function checkControls(controls: unknown, nested: boolean): void {
  check(!nested, "controls may be nested once only");
  check(Array.isArray(controls), "controls must be a list");
  for (const control of controls as unknown[]) {
    check(isFields(control), "a control must be an object");
    checkControl(control, true);
  }
}

function checkKind(c: Fields): void {
  switch (c.kind) {
    case "control":
      check(oneOf(PLACES, c.place), 'place must be "quick" or "settings"');
      checkControl(c, false);
      return;
    case "participant-action":
      check(isFunction(c.run), "an action needs run(participant)");
      if (c.appliesTo !== undefined)
        check(isFunction(c.appliesTo), "appliesTo must be a function");
      if (c.checked !== undefined)
        check(isObservable(c.checked), "checked must be observable");
      return;
    case "indicator":
      checkItem(c, true);
      check(isObservable(c.active), "active must be observable");
      return;
    case "status-row":
      check(isObservable(c.value), "value must be observable");
      return;
    default:
      checkSection(c);
  }
}

function checkSection(c: Fields): void {
  check(
    Array.isArray(c.settings) &&
      c.settings.every((k) => typeof k === "string" && SETTING_KEY.test(k)),
    'settings must be setting keys ("<module-id>.<key>")',
  );
  if (c.controls !== undefined) checkControls(c.controls, false);
}

const named = (value: unknown): string =>
  isFields(value) && typeof value.id === "string"
    ? `"${value.id}"`
    : "a definition";

/** Runs a check and says which definition it was about. */
function explain(what: string, value: unknown, run: () => void): void {
  try {
    run();
  } catch (error: unknown) {
    if (!(error instanceof Problem)) throw error;
    throw new Error(`${what} ${named(value)}: ${error.message}`, {
      cause: error,
    });
  }
}

export function validateContribution(value: unknown): void {
  explain("contribution", value, () => {
    check(isFields(value), "must be an object");
    check(oneOf(CONTRIBUTION_KINDS, value.kind), "unknown kind");
    checkBase(value);
    checkKind(value);
  });
}

const SURFACE_FUNCTIONS: Readonly<Record<string, string>> = {
  cameras: "mount",
  settings: "render",
  players: "decorate",
};

export function validateSurface(value: unknown): void {
  explain("surface", value, () => {
    check(isFields(value), "must be an object");
    const fn =
      typeof value.kind === "string"
        ? SURFACE_FUNCTIONS[value.kind]
        : undefined;
    check(fn !== undefined, 'kind must be "cameras", "settings" or "players"');
    checkItem(value);
    check(isFunction(value[fn]), `needs ${fn}()`);
  });
}
