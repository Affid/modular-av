import type { Channel } from "@modular-av/api";
import { createRelayChannel } from "@modular-av/testing/harness/relay";
import type { CreateDefinition } from "@modular-av/testing/harness/service";
import type { JitsiServer } from "../../src/join.ts";
import { createJitsiService, MODULE_ID, SDK_PATH } from "../../src/service.ts";
import { jitsiRoomName } from "../../src/token.ts";

/** A page's log line the open-server specs wait for. */
export const OUTSIDER_LINE = "jitsi outsider notice";

/** Never sends: a client that claims nothing, as someone outside the world. */
const silentChannel = (inner: Channel): Channel => ({
  send: () => undefined,
  on: (handler) => inner.on(handler),
});

/**
 * Tokens, or `access=open`: the test room (`room`) as the link's room,
 * pinned to its shard, with Docker's names as the fallback when `domain`
 * is empty.
 */
function serverOf(params: URLSearchParams): JitsiServer {
  const url = params.get("url") ?? "";
  const hosts = {
    domain: params.get("domain") ?? "",
    muc: params.get("muc") ?? "",
  };
  if (params.get("access") !== "open") return { serviceUrl: url, ...hosts };
  const room = jitsiRoomName(params.get("room") ?? "room");
  const guessed = hosts.domain === "";
  return {
    serviceUrl: `${url}?room=${room}`,
    ...(guessed
      ? {
          domain: new URL(url).hostname,
          muc: `conference.${new URL(url).hostname}`,
        }
      : hosts),
    open: guessed
      ? { room, fallback: { domain: "meet.jitsi", muc: "muc.meet.jitsi" } }
      : { room },
  };
}

/**
 * For the service contract harness: the server in the page URL, the app
 * secret apart. On an open server, claims go over the harness's relay as
 * the joining user (Foundry's part); `impersonate` names another user in
 * the presence, `silent=1` claims nothing, `grace` shortens the outsider
 * grace.
 */
export const createDefinition: CreateDefinition = (params, secrets) => {
  const room = params.get("room") ?? "room";
  let relay: Channel | null = null;
  const channel: Channel = {
    send: (data, options) => {
      relay?.send(data, options);
    },
    on: (handler) => relay?.on(handler) ?? (() => undefined),
  };
  const grace = params.get("grace");
  const definition = createJitsiService({
    access: () => (params.get("access") === "open" ? "open" : "token"),
    server: () => Promise.resolve(serverOf(params)),
    serverProblem: () => Promise.resolve("no Jitsi server in the page's URL"),
    credentials: () => ({
      appId: secrets.appId ?? "",
      appSecret: secrets.appSecret ?? "",
    }),
    channel,
    onOutsider: () => {
      // eslint-disable-next-line no-console -- the open-server specs read it
      console.warn(OUTSIDER_LINE);
    },
    ...(grace === null ? {} : { outsiderGraceMs: Number(grace) }),
    // The service contract runs without Foundry: its socket never drops.
    onReconnect: () => () => undefined,
    sdkUrl: () => `/modules/${MODULE_ID}/${SDK_PATH}`,
    now: () => Date.now(),
    onLibraryLog: (line) => {
      // eslint-disable-next-line no-console -- surfaces in Playwright's page log
      console.warn(line);
    },
    onError: (error) => {
      // eslint-disable-next-line no-console -- surfaces in Playwright's page log
      console.error(error instanceof Error ? error.message : "error");
    },
  });
  return {
    ...definition,
    create(context) {
      const own = createRelayChannel(context.participant, room);
      relay = params.get("silent") === "1" ? silentChannel(own) : own;
      const named = params.get("impersonate");
      return definition.create(named ? { participant: named } : context);
    },
  };
};
