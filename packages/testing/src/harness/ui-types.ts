import type { ModularAV } from "@modular-av/api";
import type { MockServiceHub } from "../service/hub.ts";

/** With ?players=…: the other players' cores and the mock service. */
export interface UIHarness {
  /** Each other player's core API, by user id. */
  readonly players: Readonly<Record<string, ModularAV>>;
  readonly hub: MockServiceHub;
}
