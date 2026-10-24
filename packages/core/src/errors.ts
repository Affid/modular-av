import type { CommandError, CommandErrorCode } from "@modular-av/api";

/** What every failed command throws (the API's `CommandError`). */
export class AVCommandError extends Error implements CommandError {
  readonly code: CommandErrorCode;
  readonly params: Readonly<Record<string, string | number>>;

  constructor(
    code: CommandErrorCode,
    message: string,
    params: Readonly<Record<string, string | number>> = {},
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = "AVCommandError";
    this.code = code;
    this.params = params;
  }
}

/** What the state reports about a failure: the error's name ("NotAllowedError"). */
export const errorName = (error: unknown): string =>
  error instanceof DOMException || error instanceof Error
    ? error.name
    : "Error";
