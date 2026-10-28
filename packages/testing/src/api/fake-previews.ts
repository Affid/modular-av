import type { Previews } from "@modular-av/api";

/** A preview a UI asked for, as the fake core keeps it. */
export interface FakePreview {
  readonly kind: "camera" | "microphone";
  readonly device: string;
  /** The camera's effect, or null. */
  readonly effect: string | null;
  readonly element: Element;
  readonly stopped: boolean;
}

export interface FakePreviews extends Previews {
  readonly all: readonly FakePreview[];
  /** Feeds every running microphone preview. */
  level(db: number): void;
  /** The next preview of `kind` rejects as the browser would (e.g. NotAllowedError). */
  refuseNext(kind: FakePreview["kind"], name: string): void;
}

export function createFakePreviews(): FakePreviews {
  let all: readonly FakePreview[] = [];
  let listeners: readonly {
    readonly preview: FakePreview;
    readonly listener: (db: number) => void;
  }[] = [];
  let refusals = new Map<FakePreview["kind"], string>();
  const start = (preview: FakePreview) => {
    const refusal = refusals.get(preview.kind);
    if (refusal) {
      refusals = new Map(refusals);
      refusals.delete(preview.kind);
      return Promise.reject(new DOMException("Refused", refusal));
    }
    all = [...all, preview];
    return Promise.resolve({
      stop() {
        all = all.map((p) => (p === preview ? { ...p, stopped: true } : p));
        listeners = listeners.filter((l) => l.preview !== preview);
      },
    });
  };
  return {
    get all() {
      return all;
    },
    camera: (element, options) =>
      start({
        kind: "camera",
        device: options.device,
        effect: options.effect,
        element,
        stopped: false,
      }),
    microphone(element, options) {
      const preview: FakePreview = {
        kind: "microphone",
        device: options.device,
        effect: null,
        element,
        stopped: false,
      };
      return start(preview).then((handle) => {
        listeners = [...listeners, { preview, listener: options.listener }];
        return handle;
      });
    },
    level(db) {
      for (const { listener } of listeners) listener(db);
    },
    refuseNext(kind, name) {
      refusals = new Map(refusals).set(kind, name);
    },
  };
}
