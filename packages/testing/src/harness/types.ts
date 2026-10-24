import type { FakeClient } from "../foundry/client.ts";
import type { PipelineControls } from "./pipeline.ts";

/** What the browser harness page exposes to Playwright tests. */
export interface Harness {
  readonly client: FakeClient;
  readonly ready: boolean;
  readonly error?: string;
  /** With ?service=mock and/or ?effects=test. */
  readonly pipeline?: PipelineControls;
}

declare global {
  interface Window {
    harness?: Harness;
  }
}
