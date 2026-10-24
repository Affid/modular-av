import type {
  AVState,
  SessionEndReason,
  SessionState,
  Store,
} from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { FoundryI18n, FoundryNotifications } from "../foundry/globals.ts";

/**
 * The core's minimal plain status, so its guarantees hold with no UI
 * module: notifications for the session and a player-list badge.
 */
export interface Notice {
  readonly kind: "warn" | "info" | "error";
  readonly key: string;
}

const key = (name: string): string => `${MODULE_ID}.status.${name}`;

const ENDED: Readonly<Record<Exclude<SessionEndReason, "left">, string>> = {
  "joined-elsewhere": key("ended.joinedElsewhere"),
  kicked: key("ended.kicked"),
  "room-closed": key("ended.roomClosed"),
  auth: key("ended.auth"),
  full: key("ended.full"),
  unsupported: key("ended.unsupported"),
  "no-service": key("ended.noService"),
};

/** Whether a connection was lost and not yet regained. */
export interface NoticeMemo {
  readonly lost: boolean;
}

export interface NoticeStep {
  readonly notice: Notice | null;
  readonly memo: NoticeMemo;
}

/** What to tell the player when the session moves from `prev` to `next`. */
export function sessionNotice(
  prev: SessionState,
  next: SessionState,
  memo: NoticeMemo,
): NoticeStep {
  const none = { notice: null, memo };
  if (prev.status === next.status) return none;
  if (next.status === "retrying" && !memo.lost)
    return {
      notice: { kind: "warn", key: key("reconnecting") },
      memo: { lost: true },
    };
  if (next.status === "connected" && memo.lost)
    return {
      notice: { kind: "info", key: key("reconnected") },
      memo: { lost: false },
    };
  if (next.status === "waiting-for-gm")
    return { notice: { kind: "info", key: key("waitingForGm") }, memo };
  if (next.status === "left") {
    const reason = next.reason;
    const notice: Notice | null =
      reason && reason !== "left"
        ? { kind: "error", key: ENDED[reason] }
        : null;
    return { notice, memo: { lost: false } };
  }
  return none;
}

export interface PlainStatusDeps {
  readonly store: Store<AVState>;
  readonly notifications: FoundryNotifications;
  readonly i18n: FoundryI18n;
  /** Re-renders the player list so the badges follow the state. */
  renderPlayers(): void;
  now(): number;
  /** Which device an effect works on, by id. */
  effectKind(id: string): "audio" | "video" | undefined;
}

/** The "you're muted" hint comes back at most this often. */
export const MUTED_HINT_INTERVAL_MS = 30_000;

export function startPlainStatus(deps: PlainStatusDeps): () => void {
  const notify = (notice: Notice): void => {
    deps.notifications[notice.kind](deps.i18n.localize(notice.key));
  };
  let memo: NoticeMemo = { lost: false };
  const offSession = deps.store.subscribe(
    (s) => s.session,
    (next, prev) => {
      const step = sessionNotice(prev, next, memo);
      memo = step.memo;
      if (step.notice) notify(step.notice);
    },
  );
  const offDevices = deps.store.subscribe(
    (s) => [s.local.microphoneError, s.local.cameraError] as const,
    ([microphone, camera], [oldMicrophone, oldCamera]) => {
      if (microphone && microphone !== oldMicrophone)
        notify({ kind: "warn", key: key("noMicrophone") });
      if (camera && camera !== oldCamera)
        notify({ kind: "warn", key: key("noCamera") });
    },
    { equals: (a, b) => a[0] === b[0] && a[1] === b[1] },
  );
  const offOpenMic = deps.store.subscribe(
    (s) => s.local.openMic,
    (openMic) => {
      if (openMic) notify({ kind: "warn", key: key("openMic") });
    },
  );
  const offEffects = watchEffects(deps, notify);
  let lastHint = -Infinity;
  const offMutedHint = deps.store.subscribe(
    (s) => s.local.speakingWhileMuted,
    (speaking) => {
      if (!speaking || deps.now() - lastHint < MUTED_HINT_INTERVAL_MS) return;
      lastHint = deps.now();
      notify({ kind: "info", key: key("speakingWhileMuted") });
    },
  );
  const offBadges = deps.store.subscribe(
    (s) =>
      Object.values(s.participants)
        .filter((p) => p.deafened && p.active)
        .map((p) => p.id)
        .join(","),
    () => {
      deps.renderPlayers();
    },
  );
  return () => {
    offSession();
    offDevices();
    offOpenMic();
    offEffects();
    offMutedHint();
    offBadges();
  };
}

/** An effect that fails: the camera stays off, or audio goes on without it. */
function watchEffects(
  deps: PlainStatusDeps,
  notify: (notice: Notice) => void,
): () => void {
  const offCamera = deps.store.subscribe(
    (s) => s.local.cameraHold,
    (hold) => {
      if (hold === "effect-failed")
        notify({ kind: "warn", key: key("cameraEffectFailed") });
    },
  );
  const failedAudio = (state: AVState): string =>
    Object.entries(state.local.effects)
      .filter(
        ([id, e]) => e.status === "failed" && deps.effectKind(id) === "audio",
      )
      .map(([id]) => id)
      .join(",");
  const offAudio = deps.store.subscribe(failedAudio, (next, previous) => {
    const before = new Set(previous.split(","));
    if (next.split(",").some((id) => id && !before.has(id)))
      notify({ kind: "warn", key: key("microphoneEffectFailed") });
  });
  return () => {
    offCamera();
    offAudio();
  };
}

/** Player ids that get a "deafened" badge. */
export function deafenedIds(state: AVState): ReadonlySet<string> {
  return new Set(
    Object.values(state.participants)
      .filter((p) => p.deafened && p.active)
      .map((p) => p.id),
  );
}

const BADGE_CLASS = "mav-badge";

/** Adds the badges to Foundry's player list (`renderPlayers` hook). */
export function decoratePlayerList(
  root: ParentNode,
  state: AVState,
  label: string,
): void {
  const deafened = deafenedIds(state);
  for (const old of root.querySelectorAll(`.${BADGE_CLASS}`)) old.remove();
  for (const item of root.querySelectorAll<HTMLElement>("li[data-user-id]")) {
    const id = item.dataset.userId;
    if (!id || !deafened.has(id)) continue;
    const doc = item.ownerDocument;
    const badge = doc.createElement("span");
    badge.className = BADGE_CLASS;
    badge.dataset.deafened = "";
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", label);
    badge.title = label;
    const icon = doc.createElement("i");
    icon.className = "fa-solid fa-headphones-slash";
    icon.setAttribute("aria-hidden", "true");
    badge.append(icon);
    item.append(badge);
  }
}
