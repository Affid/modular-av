import type {
  Channel,
  ParticipantId,
  ServiceDefinition,
  TokenRequest,
} from "@modular-av/api";
import { isSignerReady, isTokenReply, isTokenRequest } from "./messages.ts";

/** How long a player waits for a GM's reply before showing "waiting". */
export const REPLY_TIMEOUT_MS = 5_000;
/** How often a waiting player asks again (also at once when a GM logs in). */
export const RETRY_MS = 10_000;
/**
 * How long a request may still be answered after a GM's page said it can
 * sign: a page that saw it replies at once; one that didn't, never.
 */
export const WOKEN_GRACE_MS = 1_000;
/** Requests one user may make per window before a GM ignores them. */
export const RATE_LIMIT = { requests: 5, windowMs: 10_000 } as const;

export interface TokenRelayDeps {
  readonly channel: Channel;
  readonly selfId: ParticipantId;
  isGM(userId: string): boolean;
  /**
   * Every GM user, online or not: requests go to them only, so players
   * never see them. Not filtered by Foundry's `active` flag, which lags
   * right after a page loads; offline users simply get nothing.
   */
  gmIds(): readonly string[];
  service(): ServiceDefinition | undefined;
  /** Built from what Foundry's server says about the user; null refuses. */
  tokenRequestFor(participant: ParticipantId): TokenRequest | null;
  onWaitingForGm(waiting: boolean): void;
  onGmConnected(listener: () => void): () => void;
  /** A GM's signing failed; the player keeps waiting. */
  onSignError(error: unknown): void;
  randomId(): string;
  now(): number;
}

export interface TokenRelay {
  /** Resolves with a token for this user; waits for a GM as long as needed. */
  request(signal: AbortSignal): Promise<string>;
  dispose(): void;
}

const abortError = (): DOMException =>
  new DOMException("The token request was aborted", "AbortError");

/** Calls `listener` when a GM logs in or a GM's page can sign; undoes it. */
type OnSigner = (listener: () => void) => () => void;

/** A wait cut short: a GM can sign now, so it is worth asking again. */
const WOKEN = Symbol("woken");

const never: OnSigner = () => () => undefined;

/**
 * Resolves with the token if it arrives within `ms`, `WOKEN` when `onWake`
 * calls first, else null; rejects on abort.
 */
function wait(
  onWake: OnSigner,
  signal: AbortSignal,
  token: Promise<string>,
  ms: number,
): Promise<string | typeof WOKEN | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      offGm();
      signal.removeEventListener("abort", onAbort);
      settle();
    };
    const onAbort = (): void => {
      finish(() => {
        reject(abortError());
      });
    };
    const timer = setTimeout(() => {
      finish(() => {
        resolve(null);
      });
    }, ms);
    const offGm = onWake(() => {
      finish(() => {
        resolve(WOKEN);
      });
    });
    signal.addEventListener("abort", onAbort);
    void token.then((value) => {
      finish(() => {
        resolve(value);
      });
    });
  });
}

function signLocally(
  deps: TokenRelayDeps,
  service: ServiceDefinition,
): Promise<string> | null {
  // A player's browser may still hold a GM's secret (a shared profile):
  // only a GM signs locally.
  if (!deps.isGM(deps.selfId)) return null;
  if (!service.signToken || !service.canSignTokens?.()) return null;
  const request = deps.tokenRequestFor(deps.selfId);
  return request ? service.signToken(request) : null;
}

/** Requests this side sent and still listens for, by id. */
interface Pending {
  add(id: string, deliver: (token: string) => void): void;
  deliver(id: string, token: string): void;
  drop(ids: readonly string[]): void;
}

function createPending(): Pending {
  let pending = new Map<string, (token: string) => void>();
  return {
    add(id, deliver) {
      pending = new Map(pending).set(id, deliver);
    },
    deliver: (id, token) => pending.get(id)?.(token),
    drop(ids) {
      pending = new Map([...pending].filter(([id]) => !ids.includes(id)));
    },
  };
}

/**
 * A GM logging in wakes a waiting player, but the GM's page may still be
 * loading then: its "signer" message, once it can sign, wakes them again,
 * even while they wait for a reply to a request it never saw.
 */
function createWakeups(deps: TokenRelayDeps): {
  /** A GM's page can sign. */
  readonly onReady: OnSigner;
  /** That, or a GM logged in. */
  readonly onSigner: OnSigner;
  wake(): void;
} {
  let listeners: readonly { readonly listener: () => void }[] = [];
  const onReady: OnSigner = (listener) => {
    const entry = { listener };
    listeners = [...listeners, entry];
    return () => {
      listeners = listeners.filter((e) => e !== entry);
    };
  };
  return {
    onReady,
    onSigner(listener) {
      const offReady = onReady(listener);
      const offGm = deps.onGmConnected(listener);
      return () => {
        offGm();
        offReady();
      };
    },
    wake() {
      for (const { listener } of listeners) listener();
    },
  };
}

/** A GM's side: sign for the sender only, as Foundry's server names them. */
function createAnswering(
  deps: TokenRelayDeps,
): (id: string, sender: string) => Promise<void> {
  let recent = new Map<string, readonly number[]>();
  const allow = (sender: string): boolean => {
    const since = deps.now() - RATE_LIMIT.windowMs;
    const times = (recent.get(sender) ?? []).filter((t) => t > since);
    if (times.length >= RATE_LIMIT.requests) return false;
    recent = new Map(recent).set(sender, [...times, deps.now()]);
    return true;
  };
  return async (id, sender) => {
    const service = deps.service();
    if (!deps.isGM(deps.selfId) || !service?.signToken) return;
    if (!service.canSignTokens?.() || !allow(sender)) return;
    const request = deps.tokenRequestFor(sender);
    if (!request) return;
    try {
      const token = await service.signToken(request);
      deps.channel.send({ type: "token", id, token }, { recipients: [sender] });
    } catch (error: unknown) {
      deps.onSignError(error);
    }
  };
}

interface Asking {
  readonly deps: TokenRelayDeps;
  readonly pending: Pending;
  readonly onReady: OnSigner;
  readonly onSigner: OnSigner;
  /** Tells waiting players this GM's page can sign: they ask at once. */
  readonly sayCanSign: () => void;
}

/**
 * Asks again every round, and keeps listening for every request it sent:
 * a GM whose page is busy (Foundry loading after `ready`) answers late,
 * and a late token is as good as any.
 */
async function askUntilToken(a: Asking, signal: AbortSignal): Promise<string> {
  const { deps, onSigner } = a;
  let deliver: (token: string) => void = () => undefined;
  const arrived = new Promise<string>((resolve) => {
    deliver = resolve;
  });
  let ids: readonly string[] = [];
  let waiting = false;
  try {
    for (;;) {
      if (signal.aborted) throw abortError();
      const service = deps.service();
      const local = service ? signLocally(deps, service) : null;
      if (local) {
        const token = await local;
        // A secret that came after the page started: say so now.
        a.sayCanSign();
        return token;
      }
      const recipients = deps.gmIds().filter((gm) => gm !== deps.selfId);
      if (recipients.length > 0) {
        const id = deps.randomId();
        ids = [...ids, id];
        a.pending.add(id, deliver);
        deps.channel.send({ type: "request", id }, { recipients });
        const replied = await wait(
          a.onReady,
          signal,
          arrived,
          REPLY_TIMEOUT_MS,
        );
        // A GM's page started meanwhile: if it missed this request, again.
        const settled =
          replied === WOKEN
            ? await wait(never, signal, arrived, WOKEN_GRACE_MS)
            : replied;
        if (typeof settled === "string") return settled;
        if (replied === WOKEN) continue;
      }
      if (!waiting) deps.onWaitingForGm(true);
      waiting = true;
      const later = await wait(onSigner, signal, arrived, RETRY_MS);
      if (typeof later === "string") return later;
    }
  } finally {
    a.pending.drop(ids);
    // Aborted or failed while waiting: never leave "waiting" behind.
    if (waiting) deps.onWaitingForGm(false);
  }
}

export function createTokenRelay(deps: TokenRelayDeps): TokenRelay {
  const pending = createPending();
  const wakeups = createWakeups(deps);
  const answer = createAnswering(deps);
  const off = deps.channel.on((data, sender) => {
    if (isTokenRequest(data)) {
      void answer(data.id, sender);
      return;
    }
    if (isTokenReply(data) && deps.isGM(sender))
      pending.deliver(data.id, data.token);
    if (isSignerReady(data) && deps.isGM(sender)) wakeups.wake();
  });
  const sayCanSign = (): void => {
    deps.channel.send({ type: "signer" });
  };
  // Listening now: a GM's page that can sign says so.
  if (deps.isGM(deps.selfId) && deps.service()?.canSignTokens?.()) sayCanSign();
  const asking = {
    ...{ deps, pending, sayCanSign },
    ...{ onReady: wakeups.onReady, onSigner: wakeups.onSigner },
  };
  return {
    request: (signal) => askUntilToken(asking, signal),
    dispose: off,
  };
}
