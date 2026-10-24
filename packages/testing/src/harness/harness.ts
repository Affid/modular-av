/// <reference types="vite/client" />
// Browser test harness: installs a fake Foundry as page globals, loads the
// module named in ?module=<package dir> from source and runs Foundry's
// startup hooks. Tests read window.harness.
import { createFakeWorld } from "../foundry/world.ts";
import { installPipeline } from "./pipeline.ts";
import type { Harness } from "./types.ts";

const entries = import.meta.glob("../../../*/src/index.ts");

async function start(): Promise<Harness> {
  const params = new URLSearchParams(location.search);
  const dir = params.get("module") ?? "core";
  const world = createFakeWorld({
    users: [{ id: "gm1", name: "Gamemaster", role: 4 }],
    modules: [
      { id: params.get("id") ?? "modular-av", version: "0.0.0-harness" },
    ],
  });
  const client = world.connect("gm1");
  client.install(window);
  const pipeline = installPipeline(client.Hooks, params);
  const load = entries[`../../../${dir}/src/index.ts`];
  if (!load) return { client, ready: false, error: `No package "${dir}"` };
  await load();
  client.runLifecycle();
  return { client, ready: true, pipeline };
}

window.harness = await start();
