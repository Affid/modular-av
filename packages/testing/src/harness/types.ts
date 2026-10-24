import type { FakeClient } from "../foundry/client.ts";
import type { PipelineControls } from "./pipeline.ts";
import type { SampleControls } from "./sample-plugin.ts";
import type { UIHarness } from "./ui-types.ts";

/** What the browser harness page exposes to Playwright tests. */
export interface Harness {
  readonly client: FakeClient;
  readonly ready: boolean;
  readonly error?: string;
  /** With ?service=mock and/or ?effects=test. */
  readonly pipeline?: PipelineControls;
  /** With ?players=…: the other players' cores and the mock service. */
  readonly ui?: UIHarness;
  /** With ?sample=1. */
  readonly sample?: SampleControls;
}

declare global {
  interface Window {
    harness?: Harness;
  }
}
