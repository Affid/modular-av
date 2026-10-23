import type {
  ParticipantId,
  ServiceDefinition,
  ServiceError,
  SubscriptionOptions,
  TokenRequest,
  TrackSource,
} from "@modular-av/api";
import { createMockConnection } from "./connection.ts";
import type { Hub, Member } from "./internals.ts";
import { signMockToken } from "./token.ts";

export { MockServiceFailure } from "./internals.ts";

export interface MockServiceOptions {
  /** Clock for token expiry; defaults to `Date.now`. */
  readonly now?: () => number;
  /** Whether connections offer GM moderation. */
  readonly moderation?: boolean;
}

/**
 * An in-memory media server for tests. Connections made from its
 * `definition()` share rooms here, and the scripting methods play the part
 * of the network and the server (outages, kicks, duplicate identities).
 */
export interface MockServiceHub {
  definition(): ServiceDefinition;
  signToken(request: TokenRequest): string;
  participants(room: string): readonly ParticipantId[];
  isMuted(participant: ParticipantId, source: TrackSource): boolean;
  subscription(
    viewer: ParticipantId,
    target: ParticipantId,
    source: TrackSource,
  ): SubscriptionOptions | undefined;
  /** The transport is recovering by itself: the connection reports `resuming`. */
  startOutage(participant: ParticipantId): void;
  endOutage(participant: ParticipantId): void;
  /** The service gave up: `lost`, removed from the room. */
  loseConnection(participant: ParticipantId): void;
  kick(participant: ParticipantId): void;
  closeRoom(room: string): void;
  warnTokenExpiring(participant: ParticipantId): void;
  setSpeaking(participant: ParticipantId, speaking: boolean): void;
}

const NETWORK: ServiceError = { code: "network", final: false };
const KICKED: ServiceError = { code: "kicked", final: true };
const DUPLICATE: ServiceError = { code: "duplicate", final: true };
const ROOM_CLOSED: ServiceError = { code: "room-closed", final: true };

export function createMockServiceHub(
  options: MockServiceOptions = {},
): MockServiceHub {
  const now = options.now ?? Date.now;
  let rooms = new Map<string, readonly Member[]>();
  let muted = new Map<string, boolean>();
  let subscriptions = new Map<string, SubscriptionOptions>();

  const membersOf = (room: string): readonly Member[] => rooms.get(room) ?? [];
  const others = (member: Member): readonly Member[] =>
    membersOf(member.room).filter((m) => m !== member);
  const find = (participant: ParticipantId): Member => {
    for (const members of rooms.values()) {
      const member = members.find((m) => m.participant === participant);
      if (member) return member;
    }
    throw new Error(`No mock connection for "${participant}"`);
  };

  const hub: Hub = {
    now,
    moderation: options.moderation ?? false,
    join(member) {
      membersOf(member.room)
        .filter((m) => m.participant === member.participant)
        .forEach((m) => {
          m.end("failed", DUPLICATE);
        });
      for (const other of membersOf(member.room)) {
        other.events.emit("participantJoined", member.participant);
        member.events.emit("participantJoined", other.participant);
        for (const track of other.tracks())
          member.events.emit("trackAdded", track);
      }
      rooms = new Map(rooms).set(member.room, [
        ...membersOf(member.room),
        member,
      ]);
    },
    leave(member) {
      rooms = new Map(rooms).set(member.room, others(member));
      for (const other of membersOf(member.room)) {
        for (const track of member.tracks())
          other.events.emit("trackRemoved", track);
        other.events.emit("participantLeft", member.participant);
      }
    },
    trackAdded(member, track) {
      for (const other of others(member))
        other.events.emit("trackAdded", track);
    },
    trackRemoved(member, track) {
      for (const other of others(member))
        other.events.emit("trackRemoved", track);
    },
    setMuted(participant, source, value) {
      muted = new Map(muted).set(`${participant}|${source}`, value);
    },
    setSubscription(viewer, target, source, value) {
      subscriptions = new Map(subscriptions).set(
        `${viewer}|${target}|${source}`,
        value,
      );
    },
    kick(participant) {
      find(participant).end("failed", KICKED);
    },
  };

  return {
    definition: () => ({
      id: "mock",
      label: "Mock service",
      mediaOwnership: "core",
      signToken: (request) => Promise.resolve(signMockToken(request, now())),
      create: (context) =>
        Promise.resolve(createMockConnection(hub, context.participant)),
    }),
    signToken: (request) => signMockToken(request, now()),
    participants: (room) => membersOf(room).map((m) => m.participant),
    isMuted: (participant, source) =>
      muted.get(`${participant}|${source}`) ?? false,
    subscription: (viewer, target, source) =>
      subscriptions.get(`${viewer}|${target}|${source}`),
    startOutage: (participant) => {
      find(participant).setState("resuming");
    },
    endOutage: (participant) => {
      find(participant).setState("connected");
    },
    loseConnection: (participant) => {
      find(participant).end("lost", NETWORK);
    },
    kick: (participant) => {
      hub.kick(participant);
    },
    closeRoom: (room) => {
      for (const member of membersOf(room)) member.end("failed", ROOM_CLOSED);
    },
    warnTokenExpiring: (participant) => {
      find(participant).events.emit("tokenExpiring");
    },
    setSpeaking: (participant, speaking) => {
      const member = find(participant);
      for (const other of others(member))
        other.events.emit("speaking", participant, speaking);
    },
  };
}
