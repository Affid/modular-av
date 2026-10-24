import type {
  CaptureContext,
  GateConfig,
  GateLevel,
  VoiceGateNode,
} from "./env.ts";

/** RNNoise and the other noise models need 48 kHz. */
export const CAPTURE_SAMPLE_RATE = 48_000;
export const GATE_WORKLET = "worklets/voice-gate.js";
const GATE_PROCESSOR = "modular-av-voice-gate";

type Listeners<T> = readonly { readonly listener: (value: T) => void }[];

function listen<T>(
  get: () => Listeners<T>,
  set: (next: Listeners<T>) => void,
  listener: (value: T) => void,
): () => void {
  const registration = { listener };
  set([...get(), registration]);
  return () => {
    set(get().filter((r) => r !== registration));
  };
}

const isGateMessage = (
  data: unknown,
): data is { readonly type: "open"; readonly open: boolean } =>
  typeof data === "object" &&
  data !== null &&
  (data as { type?: unknown }).type === "open" &&
  typeof (data as { open?: unknown }).open === "boolean";

const isLevelMessage = (data: unknown): data is GateLevel =>
  typeof data === "object" &&
  data !== null &&
  (data as { type?: unknown }).type === "level" &&
  typeof (data as { db?: unknown }).db === "number" &&
  typeof (data as { threshold?: unknown }).threshold === "number";

function createGateNode(
  context: AudioContext,
  config: GateConfig,
): VoiceGateNode {
  const node = new AudioWorkletNode(context, GATE_PROCESSOR, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: config,
  });
  let transitions: Listeners<boolean> = [];
  let errors: Listeners<unknown> = [];
  let levels: Listeners<GateLevel> = [];
  node.port.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (isLevelMessage(data)) {
      const level = { db: data.db, threshold: data.threshold };
      for (const { listener } of levels) listener(level);
      return;
    }
    if (!isGateMessage(data)) return;
    for (const { listener } of transitions) listener(data.open);
  };
  node.onprocessorerror = (event) => {
    for (const { listener } of errors) listener(event);
  };
  return {
    node,
    configure(next) {
      node.port.postMessage({ type: "configure", ...next });
    },
    onTransition: (listener) =>
      listen(
        () => transitions,
        (next) => (transitions = next),
        listener,
      ),
    onError: (listener) =>
      listen(
        () => errors,
        (next) => (errors = next),
        listener,
      ),
    setLevels(enabled) {
      node.port.postMessage({ type: "levels", enabled });
    },
    onLevel: (listener) =>
      listen(
        () => levels,
        (next) => (levels = next),
        listener,
      ),
    dispose() {
      node.port.onmessage = null;
      node.onprocessorerror = null;
      node.port.close();
      node.disconnect();
    },
  };
}

/** The real capture context; `workletUrl` resolves a file in `public/`. */
export function createBrowserCaptureContext(
  workletUrl: (path: string) => string,
): CaptureContext {
  const context = new AudioContext({
    sampleRate: CAPTURE_SAMPLE_RATE,
    latencyHint: "interactive",
  });
  const destination = context.createMediaStreamDestination();
  destination.channelCount = 1;
  destination.channelCountMode = "explicit";
  const [output] = destination.stream.getAudioTracks();
  if (!output) throw new Error("The capture context has no output track");
  let loading: Promise<void> | null = null;
  let running: Listeners<boolean> = [];
  context.onstatechange = () => {
    for (const { listener } of running) listener(context.state === "running");
  };

  return {
    audioContext: context,
    output,
    destination,
    createSource: (track) =>
      context.createMediaStreamSource(new MediaStream([track])),
    async createGate(config) {
      loading ??= context.audioWorklet.addModule(workletUrl(GATE_WORKLET));
      try {
        await loading;
      } catch (error: unknown) {
        // A later attempt may succeed (e.g. the server was busy).
        loading = null;
        throw error;
      }
      return createGateNode(context, config);
    },
    get running() {
      return context.state === "running";
    },
    onRunningChange: (listener) =>
      listen(
        () => running,
        (next) => (running = next),
        listener,
      ),
    resume: () => context.resume(),
    suspend: () => context.suspend(),
  };
}
