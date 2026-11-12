import { execFileSync } from "node:child_process";
import { ROOT } from "../workspace.ts";

/** Runs a command with its output on the terminal; throws if it fails. */
export function run(
  command: string,
  args: readonly string[],
  cwd = ROOT,
): void {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

/** Runs a command and returns its trimmed output; throws if it fails. */
export function capture(
  command: string,
  args: readonly string[],
  cwd = ROOT,
): string {
  return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
}

/** Whether a command succeeds, its output hidden. */
export function succeeds(
  command: string,
  args: readonly string[],
  cwd = ROOT,
): boolean {
  try {
    execFileSync(command, args, { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
