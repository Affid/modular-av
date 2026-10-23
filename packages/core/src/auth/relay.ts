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
  /** Requests go to these users only, so players never see them. */
  onlineGms(): readonly string[];
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

/** Resolves on the first of: a GM logging in, the retry delay, or abort. */
function waitForGm(deps: TokenRelayDeps, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (): void => {
      clearTimeout(timer);
      offGm();
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = (): void => {
      done();
      reject(abortError());
    };
    const timer = setTimeout(() => {
      done();
      resolve();
    }, RETRY_MS);
    const offGm = deps.onGmConnected(() => {
      done();
      resolve();
    });
    signal.addEventListener("abort", onAbort);
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

  const ask = (signal: AbortSignal): Promise<string | null> =>
    new Promise((resolve, reject) => {
      const id = deps.randomId();
      const done = (): void => {
        clearTimeout(timer);
        const next = new Map(pending);
        next.delete(id);
        pending = next;
        signal.removeEventListener("abort", onAbort);
      };
      const onAbort = (): void => {
        done();
        reject(abortError());
      };
      const timer = setTimeout(() => {
        done();
        resolve(null);
      }, REPLY_TIMEOUT_MS);
      pending = new Map(pending).set(id, (token) => {
        done();
        resolve(token);
      });
      signal.addEventListener("abort", onAbort);
      deps.channel.send(
        { type: "request", id },
        { recipients: deps.onlineGms().filter((gm) => gm !== deps.selfId) },
      );
    });

  const request = async (signal: AbortSignal): Promise<string> => {
    const service = deps.service();
    const local = service ? signLocally(deps, service) : null;
    if (local) return local;
    for (;;) {
      if (signal.aborted) throw abortError();
      const asked = deps.onlineGms().some((gm) => gm !== deps.selfId);
      const token = asked ? await ask(signal) : null;
      deps.onWaitingForGm(token === null);
      if (token !== null) return token;
      await waitForGm(deps, signal);
    }
  };

  return { request, dispose: off };
}
