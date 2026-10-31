import type {
  EffectHost,
  EffectHostOptions,
  EffectKernel,
  HostedEffect,
} from "@modular-av/api";

const HOST_WORKLET = "worklets/effect-host.js";
const HOST_PROCESSOR = "modular-av-effect-host";

/** What the effect's state shows as its error. */
export class KernelError extends Error {
  override readonly name = "KernelError";
}

/** What a context has loaded: a module loads once per context. */
const loaded = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();

function load(context: BaseAudioContext, url: string): Promise<void> {
  const modules = loaded.get(context) ?? new Map<string, Promise<void>>();
  loaded.set(context, modules);
  const known = modules.get(url);
  if (known) return known;
  const loading = context.audioWorklet
    .addModule(url)
    .catch((error: unknown) => {
      // A later attempt may succeed (e.g. the server was busy).
      modules.delete(url);
      throw error;
    });
  modules.set(url, loading);
  return loading;
}

const isFailure = (data: unknown): data is { readonly error: string } =>
  typeof data === "object" &&
  data !== null &&
  (data as { type?: unknown }).type === "failed" &&
  typeof (data as { error?: unknown }).error === "string";

function createHostedEffect(
  context: BaseAudioContext,
  kernel: EffectKernel,
  { tail = 0, fail }: EffectHostOptions,
): HostedEffect {
  const node = new AudioWorkletNode(context, HOST_PROCESSOR, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { kernel: kernel.name, options: kernel.options, tail },
  });
  node.port.onmessage = (event: MessageEvent<unknown>) => {
    if (isFailure(event.data)) fail(new KernelError(event.data.error));
  };
  node.onprocessorerror = () => {
    fail(new KernelError("The effect's worklet stopped"));
  };
  return {
    input: node,
    output: node,
    configure(value) {
      node.port.postMessage(value);
    },
    dispose() {
      node.port.onmessage = null;
      node.onprocessorerror = null;
      node.port.close();
      node.disconnect();
    },
  };
}

/** `workletUrl` resolves a file in the core's `public/`. */
export function createEffectHost(
  context: BaseAudioContext,
  workletUrl: (path: string) => string,
  options: EffectHostOptions,
): EffectHost {
  return async (kernel) => {
    await load(context, workletUrl(HOST_WORKLET));
    await load(context, kernel.module);
    return createHostedEffect(context, kernel, options);
  };
}
