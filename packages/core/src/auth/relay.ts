import type {
  Channel,
  ParticipantId,
  ServiceDefinition,
  TokenRequest,
} from "@modular-av/api";
import { isTokenReply, isTokenRequest } from "./messages.ts";

/** How long a player waits for a GM's reply before showing "waiting". */
export const REPLY_TIMEOUT_MS = 5_000;
/** How often a waiting player asks again (also at once when a GM logs in). */
export const RETRY_MS = 10_000;
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

/**
 * Resolves with the token if it arrives within `ms`, else null (also when a
 * GM logs in, if `untilGm`); rejects on abort.
 */
function wait(
  deps: TokenRelayDeps,
  signal: AbortSignal,
  token: Promise<string>,
  ms: number,
  untilGm: boolean,
): Promise<string | null> {
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
    const offGm = untilGm
      ? deps.onGmConnected(() => {
          finish(() => {
            resolve(null);
          });
        })
      : () => undefined;
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

export function createTokenRelay(deps: TokenRelayDeps): TokenRelay {
  let pending = new Map<string, (token: string) => void>();
  let recent = new Map<string, readonly number[]>();

  const allow = (sender: string): boolean => {
    const since = deps.now() - RATE_LIMIT.windowMs;
    const times = (recent.get(sender) ?? []).filter((t) => t > since);
    if (times.length >= RATE_LIMIT.requests) return false;
    recent = new Map(recent).set(sender, [...times, deps.now()]);
    return true;
  };

  /** A GM's side: sign for the sender only, as Foundry's server names them. */
  const answer = async (id: string, sender: string): Promise<void> => {
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

  const off = deps.channel.on((data, sender) => {
    if (isTokenRequest(data)) {
      void answer(data.id, sender);
      return;
    }
    if (isTokenReply(data) && deps.isGM(sender))
      pending.get(data.id)?.(data.token);
  });

  /**
   * Asks again every round, and keeps listening for every request it sent:
   * a GM whose page is busy (Foundry loading after `ready`) answers late,
   * and a late token is as good as any.
   */
  const request = async (signal: AbortSignal): Promise<string> => {
    let deliver: (token: string) => void = () => undefined;
    const arrived = new Promise<string>((resolve) => {
      deliver = resolve;
    });
    let ids: readonly string[] = [];
    let waiting = false;
    const done = (token: string): string => {
      if (waiting) deps.onWaitingForGm(false);
      return token;
    };
    try {
      for (;;) {
        if (signal.aborted) throw abortError();
        const service = deps.service();
        const local = service ? signLocally(deps, service) : null;
        if (local) return done(await local);
        const recipients = deps.gmIds().filter((gm) => gm !== deps.selfId);
        if (recipients.length > 0) {
          const id = deps.randomId();
          ids = [...ids, id];
          pending = new Map(pending).set(id, deliver);
          deps.channel.send({ type: "request", id }, { recipients });
          const replied = await wait(
            deps,
            signal,
            arrived,
            REPLY_TIMEOUT_MS,
            false,
          );
          if (replied !== null) return done(replied);
        }
        if (!waiting) deps.onWaitingForGm(true);
        waiting = true;
        const later = await wait(deps, signal, arrived, RETRY_MS, true);
        if (later !== null) return done(later);
      }
    } finally {
      pending = new Map([...pending].filter(([id]) => !ids.includes(id)));
    }
  };

  return { request, dispose: off };
}
