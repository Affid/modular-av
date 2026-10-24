import type { MeterReading, Meters, ParticipantId } from "@modular-av/api";
import type { LevelMeter, MediaEnv } from "./env.ts";

/** About 20 readings a second, as the voice gate reports. */
export const METER_INTERVAL_MS = 50;

export interface MetersDeps {
  readonly env: Pick<
    MediaEnv,
    "watchOnScreen" | "watchRemoval" | "createLevelMeter" | "every"
  >;
  readonly onError: (error: unknown) => void;
}

/** Where levels come from, known once Foundry's `setup` made the call. */
export interface MeterSources {
  readonly selfId: ParticipantId;
  readonly local: {
    onLevel(listener: (reading: MeterReading) => void): () => void;
  };
  readonly remote: {
    audioTrack(participant: ParticipantId): MediaStreamTrack | null;
    onChange(listener: () => void): () => void;
  };
}

export interface CoreMeters {
  readonly api: Meters;
  /** Subscriptions made before this wait for it. */
  start(sources: MeterSources): void;
}

interface Subscription {
  readonly participant: ParticipantId;
  readonly element: Element;
  readonly listener: (reading: MeterReading) => void;
  readonly shown: boolean;
}

/** Sampling one other player's track, for as long as it is shown. */
interface Sampling {
  readonly track: MediaStreamTrack;
  /** Whose window the timer runs in. */
  readonly element: Element;
  readonly stop: () => void;
}

export function createMeters(deps: MetersDeps): CoreMeters {
  const { env, onError } = deps;
  let sources: MeterSources | null = null;
  let subscriptions: readonly Subscription[] = [];
  let offLocal: (() => void) | null = null;
  let samplings = new Map<ParticipantId, Sampling>();

  const shownFor = (participant: ParticipantId): readonly Subscription[] =>
    subscriptions.filter((s) => s.shown && s.participant === participant);

  const tell = (participant: ParticipantId, reading: MeterReading): void => {
    for (const s of shownFor(participant))
      try {
        s.listener(reading);
      } catch (error: unknown) {
        onError(error);
      }
  };

  const syncLocal = ({ selfId, local }: MeterSources): void => {
    const wanted = shownFor(selfId).length > 0;
    if (wanted && !offLocal)
      offLocal = local.onLevel((reading) => {
        tell(selfId, reading);
      });
    if (!wanted && offLocal) {
      offLocal();
      offLocal = null;
    }
  };

  /** A meter on the track, read in the window of the first element showing it. */
  const sample = (
    participant: ParticipantId,
    track: MediaStreamTrack,
    element: Element,
  ): Sampling => {
    let meter: LevelMeter | null = null;
    let stopped = false;
    env
      .createLevelMeter(track)
      .then((made) => {
        if (stopped) made.dispose();
        else meter = made;
      })
      .catch(onError);
    const stopTimer = env.every(element, METER_INTERVAL_MS, () => {
      if (meter)
        tell(participant, { db: meter.read(), threshold: null, open: null });
    });
    return {
      track,
      element,
      stop() {
        stopped = true;
        stopTimer();
        meter?.dispose();
      },
    };
  };

  const syncRemote = ({ selfId, remote }: MeterSources): void => {
    const next = new Map<ParticipantId, Sampling>();
    for (const [participant, current] of samplings) {
      const track = remote.audioTrack(participant);
      // Its element still shown: else the timer moves to another's window.
      const kept = shownFor(participant).some(
        (s) => s.element === current.element,
      );
      if (track === current.track && kept) next.set(participant, current);
      else current.stop();
    }
    for (const s of subscriptions) {
      if (!s.shown || s.participant === selfId || next.has(s.participant))
        continue;
      const track = remote.audioTrack(s.participant);
      if (track)
        next.set(s.participant, sample(s.participant, track, s.element));
    }
    samplings = next;
  };

  const sync = (): void => {
    if (!sources) return;
    syncLocal(sources);
    syncRemote(sources);
  };

  const replace = (from: Subscription, to: Subscription | null): void => {
    subscriptions = to
      ? subscriptions.map((s) => (s === from ? to : s))
      : subscriptions.filter((s) => s !== from);
    sync();
  };

  const api: Meters = Object.freeze({
    subscribe(
      participant: ParticipantId,
      element: Element,
      listener: (reading: MeterReading) => void,
    ) {
      let current: Subscription | null = {
        participant,
        element,
        listener,
        shown: true,
      };
      subscriptions = [...subscriptions, current];
      const unobserve = env.watchOnScreen(element, ({ visible }) => {
        if (!current || current.shown === visible) return;
        const next = { ...current, shown: visible };
        replace(current, next);
        current = next;
      });
      const off = (): void => {
        if (!current) return;
        unobserve();
        unwatch();
        replace(current, null);
        current = null;
      };
      const unwatch = env.watchRemoval(element, off);
      sync();
      return off;
    },
  });

  return {
    api,
    start(next) {
      sources = next;
      next.remote.onChange(sync);
      sync();
    },
  };
}
