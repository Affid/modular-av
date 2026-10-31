import { createFakeTrack } from "../service/fake-track.ts";

/**
 * Stand-ins for the core's capture context (packages/core/src/media/env.ts),
 * declared structurally so this package doesn't depend on the core. Nodes
 * only record how they are wired.
 */
export interface FakeGateConfig {
  readonly mode: "gate" | "detect";
  readonly auto: boolean;
  readonly threshold: number;
}

export interface FakeAudioGraph {
  /** A node that only records its connections. */
  node(label: string): AudioNode;
  labelOf(node: AudioNode): string;
  /** Current connections as "from->to", in the order they were made. */
  edges(): readonly string[];
  /** Every connect and disconnect so far, as "+from->to" / "-from->to". */
  readonly log: readonly string[];
  /** Whether audio entering `from` reaches `to`. */
  reaches(from: AudioNode, to: AudioNode): boolean;
  /** Whether `from` is connected straight to `to`. */
  feeds(from: AudioNode, to: AudioNode): boolean;
}

export interface FakeGateLevel {
  readonly db: number;
  readonly threshold: number;
}

export interface FakeVoiceGate {
  readonly node: AudioNode;
  configure(config: FakeGateConfig): void;
  onTransition(listener: (open: boolean) => void): () => void;
  onError(listener: (error: unknown) => void): () => void;
  setLevels(enabled: boolean): void;
  onLevel(listener: (level: FakeGateLevel) => void): () => void;
  dispose(): void;
  /** Whether level reports are on. */
  readonly levels: boolean;
  /** Plays a level report (sent only while reports are on). */
  emitLevel(db: number, threshold: number): void;
  /** The configuration it was created with, then each change. */
  readonly configs: readonly FakeGateConfig[];
  readonly disposed: boolean;
  /** Plays the worklet opening or closing. */
  emit(open: boolean): void;
  /** Plays the worklet failing (processorerror). */
  fail(error: unknown): void;
}

/** A tap that reads a signal's peak; tests say what it hears. */
export interface FakeSignalProbe {
  readonly node: AudioNode;
  /** Linear, 0 to 1: exactly 0 for digital silence. */
  peak(): number;
  dispose(): void;
  setPeak(peak: number): void;
  readonly disposed: boolean;
}

/** One of the core's own gains; tests read what it was set to. */
export interface FakeLevel {
  readonly node: AudioNode;
  readonly level: number;
  /** The fade of the last change, 0 for at once. */
  readonly rampMs: number;
  set(level: number, rampMs?: number): void;
  follow(control: AudioNode | null, output?: number): void;
  /** What drives it on the audio thread, or null. */
  readonly following: {
    readonly node: AudioNode;
    readonly output: number;
  } | null;
  dispose(): void;
  readonly disposed: boolean;
}

/** A fixed delay of the core's. */
export interface FakeDelay {
  readonly node: AudioNode;
  readonly seconds: number;
  dispose(): void;
  readonly disposed: boolean;
}

export interface FakeCaptureContext {
  readonly audioContext: AudioContext;
  readonly output: MediaStreamTrack;
  readonly destination: AudioNode;
  createSource(track: MediaStreamTrack): AudioNode;
  createGate(config: FakeGateConfig): Promise<FakeVoiceGate>;
  createProbe(): FakeSignalProbe;
  createLevel(name: string, level: number): FakeLevel;
  createDelay(name: string, seconds: number): FakeDelay;
  /** False plays a browser without k-rate gains. */
  readonly canFollow: boolean;
  readonly running: boolean;
  onRunningChange(listener: (running: boolean) => void): () => void;
  resume(): Promise<void>;
  suspend(): Promise<void>;

  readonly graph: FakeAudioGraph;
  readonly gates: readonly FakeVoiceGate[];
  readonly probes: readonly FakeSignalProbe[];
  /** The gain made under `name`, the latest if several were. */
  level(name: string): FakeLevel | undefined;
  /** The delay made under `name`, the latest if several were. */
  delay(name: string): FakeDelay | undefined;
  /** The probe `node` is connected to, if any. */
  probeFedBy(node: AudioNode): FakeSignalProbe | undefined;
  /** The source node made for each microphone track, in order. */
  readonly sources: readonly { track: MediaStreamTrack; node: AudioNode }[];
  /** Makes `createGate` reject with this error, or succeed again with null. */
  failGates(error: Error | null): void;
  /** Plays the browser's autoplay policy keeping the context suspended. */
  blockAutoplay(blocked: boolean): void;
}

type Edge = readonly [AudioNode, AudioNode];

export function createFakeAudioGraph(): FakeAudioGraph {
  let edges: readonly Edge[] = [];
  let log: readonly string[] = [];
  const labels = new WeakMap<AudioNode, string>();
  const labelOf = (node: AudioNode): string => labels.get(node) ?? "?";
  const name = ([from, to]: Edge): string => `${labelOf(from)}->${labelOf(to)}`;

  const node = (label: string): AudioNode => {
    const self = {
      connect(destination: AudioNode): AudioNode {
        const edge: Edge = [self, destination];
        if (!edges.some(([a, b]) => a === edge[0] && b === destination))
          edges = [...edges, edge];
        log = [...log, `+${name(edge)}`];
        return destination;
      },
      disconnect(destination?: AudioNode): void {
        const from = self;
        const removed = edges.filter(
          ([a, b]) => a === from && (!destination || b === destination),
        );
        // As in browsers: naming a destination that isn't connected throws.
        if (destination && removed.length === 0)
          throw new DOMException(
            "the given destination is not connected",
            "InvalidAccessError",
          );
        edges = edges.filter((e) => !removed.includes(e));
        log = [...log, ...removed.map((e) => `-${name(e)}`)];
      },
    } as unknown as AudioNode;
    labels.set(self, label);
    return self;
  };

  const reaches = (from: AudioNode, to: AudioNode): boolean => {
    const seen = new Set<AudioNode>();
    const visit = (current: AudioNode): boolean => {
      if (current === to) return true;
      if (seen.has(current)) return false;
      seen.add(current);
      return edges.some(([a, b]) => a === current && visit(b));
    };
    return visit(from);
  };

  return {
    node,
    labelOf,
    edges: () => edges.map(name),
    get log() {
      return log;
    },
    reaches,
    feeds: (from, to) => edges.some(([a, b]) => a === from && b === to),
  };
}

function createFakeGate(
  graph: FakeAudioGraph,
  config: FakeGateConfig,
): FakeVoiceGate {
  let configs: readonly FakeGateConfig[] = [config];
  let disposed = false;
  let transitions: readonly ((open: boolean) => void)[] = [];
  let errors: readonly ((error: unknown) => void)[] = [];
  let levelListeners: readonly ((level: FakeGateLevel) => void)[] = [];
  let levels = false;
  const node = graph.node("gate");
  return {
    node,
    configure(next) {
      configs = [...configs, next];
    },
    onTransition(listener) {
      transitions = [...transitions, listener];
      return () => {
        transitions = transitions.filter((l) => l !== listener);
      };
    },
    onError(listener) {
      errors = [...errors, listener];
      return () => {
        errors = errors.filter((l) => l !== listener);
      };
    },
    setLevels(enabled) {
      levels = enabled;
    },
    onLevel(listener) {
      levelListeners = [...levelListeners, listener];
      return () => {
        levelListeners = levelListeners.filter((l) => l !== listener);
      };
    },
    get levels() {
      return levels;
    },
    emitLevel(db, threshold) {
      if (!levels) return;
      for (const listener of levelListeners) listener({ db, threshold });
    },
    dispose() {
      disposed = true;
      node.disconnect();
    },
    get configs() {
      return configs;
    },
    get disposed() {
      return disposed;
    },
    emit(open) {
      for (const listener of transitions) listener(open);
    },
    fail(error) {
      for (const listener of errors) listener(error);
    },
  };
}

function createFakeProbe(graph: FakeAudioGraph): FakeSignalProbe {
  const node = graph.node("probe");
  let peak = 0;
  let disposed = false;
  return {
    node,
    peak: () => peak,
    dispose() {
      disposed = true;
    },
    setPeak(next) {
      peak = next;
    },
    get disposed() {
      return disposed;
    },
  };
}

function createFakeLevel(
  graph: FakeAudioGraph,
  name: string,
  initial: number,
): FakeLevel {
  const node = graph.node(name);
  let level = initial;
  let rampMs = 0;
  let disposed = false;
  let following: FakeLevel["following"] = null;
  return {
    node,
    get level() {
      return level;
    },
    get rampMs() {
      return rampMs;
    },
    set(next, ramp = 0) {
      level = next;
      rampMs = ramp;
    },
    follow(control, output = 0) {
      following = control ? { node: control, output } : null;
      level = control ? 0 : 1;
      rampMs = 0;
    },
    get following() {
      return following;
    },
    dispose() {
      disposed = true;
      node.disconnect();
    },
    get disposed() {
      return disposed;
    },
  };
}

export function createFakeCaptureContext(
  options: { readonly canFollow?: boolean } = {},
): FakeCaptureContext {
  const graph = createFakeAudioGraph();
  const destination = graph.node("destination");
  const output = createFakeTrack("audio", "capture output");
  const audioContext = {
    sampleRate: 48_000,
    createGain: () => graph.node("gain"),
  } as unknown as AudioContext;
  let gates: readonly FakeVoiceGate[] = [];
  let probes: readonly FakeSignalProbe[] = [];
  let levels: ReadonlyMap<string, FakeLevel> = new Map();
  let delays: ReadonlyMap<string, FakeDelay> = new Map();
  let sources: readonly { track: MediaStreamTrack; node: AudioNode }[] = [];
  let gateError: Error | null = null;
  let running = false;
  let autoplayBlocked = false;
  let listeners: readonly ((running: boolean) => void)[] = [];

  const setRunning = (next: boolean): void => {
    if (running === next) return;
    running = next;
    for (const listener of listeners) listener(next);
  };

  return {
    audioContext,
    output,
    destination,
    createSource(track) {
      const node = graph.node(`source:${track.label}`);
      sources = [...sources, { track, node }];
      return node;
    },
    createGate(config) {
      if (gateError !== null) return Promise.reject(gateError);
      const gate = createFakeGate(graph, config);
      gates = [...gates, gate];
      return Promise.resolve(gate);
    },
    createProbe() {
      const probe = createFakeProbe(graph);
      probes = [...probes, probe];
      return probe;
    },
    createLevel(name, level) {
      const created = createFakeLevel(graph, name, level);
      levels = new Map(levels).set(name, created);
      return created;
    },
    createDelay(name, seconds) {
      const node = graph.node(name);
      let disposed = false;
      const created: FakeDelay = {
        node,
        seconds,
        dispose() {
          disposed = true;
          node.disconnect();
        },
        get disposed() {
          return disposed;
        },
      };
      delays = new Map(delays).set(name, created);
      return created;
    },
    canFollow: options.canFollow ?? true,
    get running() {
      return running;
    },
    onRunningChange(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
    resume() {
      if (!autoplayBlocked) setRunning(true);
      return Promise.resolve();
    },
    suspend() {
      setRunning(false);
      return Promise.resolve();
    },
    graph,
    get gates() {
      return gates;
    },
    get probes() {
      return probes;
    },
    level: (name) => levels.get(name),
    delay: (name) => delays.get(name),
    probeFedBy: (node) =>
      probes.find((p) => !p.disposed && graph.feeds(node, p.node)),
    get sources() {
      return sources;
    },
    failGates(error) {
      gateError = error;
    },
    blockAutoplay(blocked) {
      autoplayBlocked = blocked;
    },
  };
}
