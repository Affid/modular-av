import type { FakeClient } from "../foundry/client.ts";

/** What the browser harness page exposes to Playwright tests. */
export interface Harness {
  readonly client: FakeClient;
  readonly ready: boolean;
  readonly error?: string;
}

declare global {
  interface Window {
    harness?: Harness;
  }
}
