import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { exerciseKernel, type KernelRun, loadKernel } from "./kernel-realm.ts";

/**
 * A kernel must use only what its constructor and `configure` give it, so
 * the same file can run in the core's worklet or on a processing server
 * (issue #6). Run with Vitest, from a test folder whose tsconfig has Node's
 * types (the modules keep it in `test/node/`).
 */
export interface KernelContractOptions extends KernelRun {
  /** The worklet file: `new URL("../../public/worklets/x.js", import.meta.url)`. */
  readonly file: URL;
  /** The name it registers its kernel under. */
  readonly name: string;
}

export function kernelContract({
  file,
  name,
  ...run
}: KernelContractOptions): void {
  const path = fileURLToPath(file);
  describe(`the ${name} kernel, outside a worklet`, () => {
    it("loads with nothing but modularAV.registerAudioKernel", () => {
      loadKernel(readFileSync(path, "utf8"), path, name);
    });

    it("is built, configured and renders with nothing else", () => {
      exerciseKernel(loadKernel(readFileSync(path, "utf8"), path, name), run);
    });
  });
}
