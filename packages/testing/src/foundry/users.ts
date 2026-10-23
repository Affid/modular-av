import { getProperty } from "./objects.ts";

/** Foundry's `CONST.USER_ROLES`. */
export const USER_ROLES = {
  NONE: 0,
  PLAYER: 1,
  TRUSTED: 2,
  ASSISTANT: 3,
  GAMEMASTER: 4,
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

interface PermissionRule {
  /** Roles at or above this hold the permission unless overridden. */
  readonly defaultRole: UserRole;
  /** Roles that always hold it; an override cannot revoke it. */
  readonly requiredRoles: readonly UserRole[];
}

/** As in Foundry v14 (common/constants.mjs USER_PERMISSIONS). */
const PERMISSIONS: Readonly<Record<string, PermissionRule>> = {
  BROADCAST_AUDIO: { defaultRole: USER_ROLES.TRUSTED, requiredRoles: [] },
  BROADCAST_VIDEO: { defaultRole: USER_ROLES.TRUSTED, requiredRoles: [] },
  SETTINGS_MODIFY: {
    defaultRole: USER_ROLES.ASSISTANT,
    requiredRoles: [USER_ROLES.GAMEMASTER],
  },
};

export type UserFlags = Readonly<
  Record<string, Readonly<Record<string, unknown>>>
>;

export interface FakeUserData {
  readonly id: string;
  readonly name: string;
  readonly role: number;
  readonly color?: string;
  readonly avatar?: string;
  readonly permissions?: Readonly<Record<string, boolean>>;
  readonly flags?: UserFlags;
}

/** Dotted keys (`"permissions.BROADCAST_AUDIO"`) or nested objects. */
export type UserUpdate = Readonly<Record<string, unknown>>;

/** What a user object may ask of the world, as the client that holds it. */
export interface UserActions {
  readonly selfId: string;
  update(target: string, changes: UserUpdate): Promise<void>;
  broadcastActivity(activity: Readonly<Record<string, unknown>>): void;
}

export interface FakeUser extends FakeUserData {
  readonly active: boolean;
  /** Includes assistant GMs, as in Foundry. */
  readonly isGM: boolean;
  /** Whether this is the logged-in user of the client holding the object. */
  readonly isSelf: boolean;
  hasPermission(permission: string): boolean;
  can(permission: string): boolean;
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<void>;
  update(changes: UserUpdate): Promise<void>;
  broadcastActivity(activity: Readonly<Record<string, unknown>>): void;
}

const serverSide = (): never => {
  throw new Error("Users in the server-side list cannot act; use a client");
};

export function createUser(
  data: FakeUserData,
  active: boolean,
  actions?: UserActions,
): FakeUser {
  /** Same order of checks as Foundry's `User#hasPermission`. */
  const hasPermission = (permission: string): boolean => {
    const rule = PERMISSIONS[permission];
    if (!rule) throw new Error(`Unknown permission "${permission}"`);
    if (data.role === USER_ROLES.NONE) return false;
    if ((rule.requiredRoles as readonly number[]).includes(data.role))
      return true;
    const override = data.permissions?.[permission];
    if (override !== undefined) return override;
    return data.role >= rule.defaultRole;
  };
  const update = (changes: UserUpdate): Promise<void> =>
    actions ? actions.update(data.id, changes) : serverSide();

  return Object.freeze({
    ...data,
    active,
    isGM: data.role >= USER_ROLES.ASSISTANT,
    isSelf: actions?.selfId === data.id,
    hasPermission,
    can: hasPermission,
    getFlag: (scope: string, key: string) =>
      getProperty(data.flags?.[scope], key),
    setFlag: (scope: string, key: string, value: unknown) =>
      update({ [`flags.${scope}.${key}`]: value }),
    update,
    broadcastActivity(activity: Readonly<Record<string, unknown>>) {
      if (!actions) return serverSide();
      if (actions.selfId !== data.id)
        throw new Error("You can only broadcast your own User activity data.");
      actions.broadcastActivity(activity);
    },
  });
}

/** Mirrors `User.#canUpdate` in v14's common/documents/user.mjs. */
export function canUpdateUser(
  actor: FakeUserData,
  target: FakeUserData,
  changes: Readonly<Record<string, unknown>>,
): boolean {
  if (actor.role === USER_ROLES.GAMEMASTER) return true;
  if (actor.role === USER_ROLES.NONE) return false;
  const restricted = ["permissions", "passwordSalt"];
  if (actor.role < USER_ROLES.ASSISTANT) restricted.push("name", "role");
  if (target.role === USER_ROLES.GAMEMASTER) restricted.push("password");
  if (restricted.some((key) => key in changes)) return false;
  return actor.role >= USER_ROLES.ASSISTANT || actor.id === target.id;
}

export interface FakeUsers {
  get(id: string): FakeUser | undefined;
  getName(name: string): FakeUser | undefined;
  readonly contents: readonly FakeUser[];
  /** The active GM with the highest role, then the lowest id; else null. */
  readonly activeGM: FakeUser | null;
}

export function createUsersView(read: () => readonly FakeUser[]): FakeUsers {
  return {
    get: (id) => read().find((user) => user.id === id),
    getName: (name) => read().find((user) => user.name === name),
    get contents() {
      return read();
    },
    get activeGM() {
      const [designated] = read()
        .filter((user) => user.active && user.isGM)
        .sort((a, b) => b.role - a.role || a.id.localeCompare(b.id));
      return designated ?? null;
    },
  };
}
