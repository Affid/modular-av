/**
 * A stand-in for Foundry v14's DialogV2 (client/applications/api/
 * dialog.mjs): `confirm` and `wait` open a dialog the test answers, as a
 * player pressing a button or closing it.
 */

export interface FakeDialogButton {
  readonly action: string;
  readonly label?: string;
}

export interface FakeDialog {
  readonly title: string;
  /** As Foundry renders it: HTML. */
  readonly content: string;
  /** The buttons' actions, in order. */
  readonly actions: readonly string[];
  readonly open: boolean;
  /** Presses the button with this action. */
  press(action: string): void;
  /** Closes it without a button: resolves to null. */
  dismiss(): void;
}

interface DialogOptions {
  readonly window?: { readonly title?: string };
  readonly content?: string;
  readonly buttons?: readonly FakeDialogButton[];
  readonly yes?: Partial<FakeDialogButton>;
  readonly no?: Partial<FakeDialogButton>;
}

export interface FakeDialogV2 {
  confirm(options?: DialogOptions): Promise<boolean | null>;
  wait(options?: DialogOptions): Promise<string | null>;
}

export interface FakeDialogs {
  readonly DialogV2: FakeDialogV2;
  /** Every dialog opened, answered or not, oldest first. */
  readonly dialogs: readonly FakeDialog[];
}

export function createFakeDialogs(): FakeDialogs {
  let dialogs: readonly FakeDialog[] = [];

  const open = (
    options: DialogOptions,
    buttons: readonly FakeDialogButton[],
  ): Promise<string | null> =>
    new Promise((resolve) => {
      let answered = false;
      const answer = (value: string | null): void => {
        if (answered) throw new Error("This dialog was already answered");
        answered = true;
        resolve(value);
      };
      const actions = buttons.map((b) => b.action);
      const dialog: FakeDialog = {
        title: options.window?.title ?? "",
        content: options.content ?? "",
        actions,
        get open() {
          return !answered;
        },
        press(action) {
          if (!actions.includes(action))
            throw new Error(`No button "${action}" in this dialog`);
          answer(action);
        },
        dismiss() {
          answer(null);
        },
      };
      dialogs = [...dialogs, dialog];
    });

  const DialogV2: FakeDialogV2 = {
    async confirm(options = {}) {
      const result = await open(options, [
        { action: "yes", ...options.yes },
        { action: "no", ...options.no },
        ...(options.buttons ?? []),
      ]);
      return result === null ? null : result === "yes";
    },
    wait: (options = {}) => open(options, options.buttons ?? []),
  };

  return {
    DialogV2,
    get dialogs() {
      return dialogs;
    },
  };
}
