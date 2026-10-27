import {
  type Attempt,
  fromConferenceError,
  fromConnectionError,
  JitsiServiceError,
} from "./errors.ts";
import type {
  Emitting,
  JitsiConference,
  JitsiConnection,
  JitsiMeetJS,
  Listener,
} from "./sdk-types.ts";

/** Where the Jitsi deployment is, from the module's world settings. */
export interface JitsiServer {
  /** The XMPP WebSocket, e.g. wss://meet.example.com/xmpp-websocket */
  readonly serviceUrl: string;
  /** The XMPP domain, e.g. meet.example.com (docker: meet.jitsi). */
  readonly domain: string;
  /** The conference (MUC) domain, e.g. conference.meet.example.com. */
  readonly muc: string;
}

/**
 * Jitsi's own peer-to-peer mode for two players is off: every call goes
 * through the bridge, so the bridge's receive limits always apply and a
 * third player joining doesn't move everyone to another path.
 */
const CONFERENCE_OPTIONS = {
  p2p: { enabled: false },
  disableThirdPartyRequests: true,
  analytics: { disabled: true, rtcstatsEnabled: false, watchRTCEnabled: false },
  e2eping: { enabled: false },
  enableNoAudioDetection: false,
  enableNoisyMicDetection: false,
  channelLastN: -1,
  pcStatsInterval: 5000,
} as const;

/** The signal's own reason when it is the service's (a drop while joining). */
const aborted = (signal: AbortSignal): Error =>
  signal.reason instanceof JitsiServiceError
    ? signal.reason
    : new DOMException("The connection attempt was aborted", "AbortError");

/** Settles on the first of `ok` or `fail`, or when `signal` aborts. */
function settle(
  target: {
    on(e: string, l: Listener): void;
    off(e: string, l: Listener): void;
  },
  events: { readonly ok: string; readonly fail: string },
  signal: AbortSignal,
  failure: (error: string) => JitsiServiceError,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(aborted(signal));
      return;
    }
    const done = (): void => {
      target.off(events.ok, onOk);
      target.off(events.fail, onFail);
      signal.removeEventListener("abort", onAbort);
    };
    const onOk = (): void => {
      done();
      resolve();
    };
    const onFail = (error: string): void => {
      done();
      reject(failure(error));
    };
    const onAbort = (): void => {
      done();
      reject(aborted(signal));
    };
    target.on(events.ok, onOk);
    target.on(events.fail, onFail);
    signal.addEventListener("abort", onAbort);
  });
}

const asTarget = (
  emitting: Emitting,
): { on(e: string, l: Listener): void; off(e: string, l: Listener): void } => ({
  on: (e, l) => {
    emitting.addEventListener(e, l);
  },
  off: (e, l) => {
    emitting.removeEventListener(e, l);
  },
});

/** Opens the XMPP connection with the token. */
export async function openConnection(
  sdk: JitsiMeetJS,
  server: JitsiServer,
  attempt: Attempt,
  signal: AbortSignal,
): Promise<JitsiConnection> {
  const connection = new sdk.JitsiConnection(null, attempt.token, {
    hosts: { domain: server.domain, muc: server.muc },
    serviceUrl: server.serviceUrl,
  });
  const events = sdk.events.connection;
  const opened = settle(
    asTarget(connection),
    {
      ok: events.CONNECTION_ESTABLISHED ?? "",
      fail: events.CONNECTION_FAILED ?? "",
    },
    signal,
    (error) => new JitsiServiceError(fromConnectionError(error, attempt)),
  );
  connection.connect();
  try {
    await opened;
  } catch (error: unknown) {
    void connection.disconnect().catch(() => undefined);
    throw error;
  }
  return connection;
}

/** Joins the room on an open connection; resolves once in it. */
export async function joinConference(
  sdk: JitsiMeetJS,
  connection: JitsiConnection,
  room: string,
  attempt: Attempt,
  signal: AbortSignal,
  wire: (conference: JitsiConference) => void,
): Promise<JitsiConference> {
  const conference = connection.initJitsiConference(room, CONFERENCE_OPTIONS);
  wire(conference);
  const events = sdk.events.conference;
  const joined = settle(
    conference,
    {
      ok: events.CONFERENCE_JOINED ?? "",
      fail: events.CONFERENCE_FAILED ?? "",
    },
    signal,
    (error) => new JitsiServiceError(fromConferenceError(error, attempt)),
  );
  conference.join();
  await joined;
  return conference;
}
